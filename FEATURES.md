# Chess Trainer — Feature Requirements

## Anti-Hallucination Architecture (Foundation)

Every AI response is grounded in engine-verified facts. The LLM **explains**, never **invents**.

```
User Move
    │
    ▼
┌─────────────┐    depth-15    ┌─────────────────┐
│  Stockfish  │ ─────────────► │  StockfishResult │
│  Engine     │                │  · Eval (pawns)  │
└─────────────┘                │  · BestMove UCI  │
                               │  · BestMove SAN  │
┌─────────────┐                │  · PV Line (5)   │
│  notnil/    │ ─────────────► └────────┬─────────┘
│  chess pkg  │  board facts            │
│             │  · HangingPieces        ▼
│             │  · KingSafety   ┌────────────────┐
│             │  · MaterialDiff │ Situation      │
└─────────────┘                 │ Report (prompt)│
                                └───────┬────────┘
                                        │
                                        ▼
                                ┌───────────────┐
                                │  Gemini LLM   │
                                │  (explain     │
                                │   only)       │
                                └───────────────┘
```

---

## Core Features

### F1 — Real-Time Game Play (WebSocket `/ws/game`)

**What it does:** User plays a full chess game vs the Stockfish engine with live AI coaching after every move.

**Status:** Implemented (`game.go`)

**Flow:**
```
Client                          Server
  │                               │
  ├─── new_game {color} ─────────►│ Create chess.Game, save to DB
  │◄── board_update {fen} ────────┤
  │                               │
  ├─── move {e2e4} ──────────────►│
  │                               ├─ Stockfish depth-15 BEFORE move
  │                               ├─ Validate move
  │                               ├─ Apply user move
  │                               ├─ Stockfish depth-15 AFTER move
  │                               ├─ Calculate eval drop
  │                               ├─ If blunder → save to missed_moves
  │                               ├─ Apply AI best response
  │◄── board_update {fen, eval} ──┤
  │◄── coach_chunk {text} ────────┤ (streaming, multiple chunks)
  │◄── coach_done ────────────────┤
  │                               │
  ├─── hint ─────────────────────►│ Stockfish depth-12
  │◄── hint {move, eval, reason} ─┤
```

**Move Grading Thresholds:**

| Label       | Eval Drop    |
|-------------|--------------|
| Blunder     | > 1.5 pawns  |
| Mistake     | > 0.8 pawns  |
| Inaccuracy  | > 0.3 pawns  |
| Good        | ≤ 0.3 pawns  |

**Gaps / Known Issues:**
- `detectTheme` uses half-move count only — no real tactical theme detection (fork, pin, etc.)
- Hint endpoint does not use Situation Report grounding (direct prompt, can hallucinate move justification)
- Move grade thresholds in `stockfish.go` differ from `game.go` (0.5 vs 0.8 for "mistake") — needs reconciliation

---

### F2 — AI Chat (`POST /api/chat`)

**What it does:** Free-form chess Q&A — users can ask how to play openings, strategies, improve weaknesses.

**Status:** Implemented (`chat.go`)

**Flow:**
```
Client                                Server
  │                                     │
  ├─── POST /api/chat                   │
  │    {message, fen?, context?} ──────►│
  │                                     ├─ If FEN provided:
  │                                     │    run Stockfish + AnalyzeBoard
  │                                     │    build grounded prompt
  │                                     ├─ Else: general chess Q&A
  │                                     │
  │◄── SSE stream "data: {chunk}\n\n" ──┤ (streaming response)
  │◄── SSE "data: [DONE]\n\n" ──────────┤
```

**Gap:** Chat currently does not auto-recommend YouTube videos or puzzles when weakness topics are detected.

---

### F3 — Opening Learning (`GET /api/learn`)

**What it does:** User asks about an opening or topic; backend searches YouTube and returns structured learning content.

**Status:** Implemented (`openings.go`)

**Flow:**
```
GET /api/learn?topic=Sicilian+Defense

       │
       ▼
┌─────────────────────────┐
│ YouTube Data API v3     │
│ search.list             │
│ q = "chess {topic}"     │
│ type = video            │
│ maxResults = 3          │
└────────┬────────────────┘
         │ video list
         ▼
┌─────────────────────────┐
│ Gemini: generate topic  │
│ explanation (grounded   │
│ on topic name only)     │
└────────┬────────────────┘
         │
         ▼
  {explanation, videos[]}
```

**Gap:** No weakness detection — user must manually query. Chat should auto-trigger `learn` when it detects weakness keywords.

---

### F4 — Spaced Repetition Puzzles (`GET /api/puzzles`, `POST /api/puzzles/complete`)

**What it does:** Personalized puzzles generated automatically from the user's own blunders. Topped up from a general pool when personal puzzles run low.

**Status:** Implemented (`puzzles.go`)

**Flow:**
```
Game blunder detected
        │
        ▼
┌───────────────────┐
│ SaveMissedMove    │◄── FEN + user_move + best_move + eval_drop + theme
│ (missed_moves DB) │
└───────┬───────────┘
        │
        ▼
GET /api/puzzles?theme=endgame&limit=5

┌──────────────────────────────────────────────────────────┐
│  1. Query missed_moves WHERE user_id = ? ORDER BY        │
│     next_review_at ASC (due first)                       │
│  2. If < 3 results → fill remainder from general pool    │
│     (puzzles WHERE user_id IS NULL)                      │
└──────────────────────────────────────────────────────────┘

POST /api/puzzles/complete {puzzle_id, solved, time_taken_ms}
  ┌─ solved=true  → next_review_at = now + 7 days
  └─ solved=false → next_review_at = now + 24 hours
```

**Spaced Repetition Schedule:**

| Attempt | Next Review |
|---------|-------------|
| Failed  | 24 hours    |
| Solved  | 7 days      |

**Gap:** Only 2-interval SRS (pass/fail). True SM-2 algorithm would use ease factor + interval multiplier.

---

### F5 — Game Analysis (`POST /api/analyze`)

**What it does:** Replays a completed game move-by-move, grades every position with Stockfish, and returns a full annotated summary.

**Status:** Implemented (`analyze.go`)

**Flow:**
```
POST /api/analyze {game_id}
        │
        ▼
  Fetch PGN from DB
        │
        ▼
  Replay game move by move:
  ┌─────────────────────────────────────┐
  │ For each move:                      │
  │   eval_before = Stockfish(depth 12) │
  │   apply move                        │
  │   eval_after  = Stockfish(depth 12) │
  │   drop = eval_before - eval_after   │
  │   grade = moveGrade(drop)           │
  └─────────────────────────────────────┘
        │
        ▼
  SSE stream move-by-move results
  {move, san, eval, drop, grade}
        │
        ▼
  Final summary:
  {blunders, mistakes, inaccuracies,
   accuracy_score, key_moments[]}
```

---

### F6 — Personality Modes

**What it does:** Users choose their coach's communication style. Stored per-user in `profiles.personality`.

**Status:** Implemented (WebSocket `set_personality`, `situation_report.go`)

| Mode      | Prompt Label          | Behavior                          |
|-----------|-----------------------|-----------------------------------|
| mentor    | supportive Grandmaster| Encouraging, educational tone     |
| roast     | roast comedian        | Savage but accurate criticism     |

**Flow:**
```
Client sends: {"type": "set_personality", "mode": "roast"}
        │
        ▼
  session.Personality = "roast"
  (persisted on next DB write)
        │
        ▼
  BuildSituationReport receives personality
  → personalityLabel() → injected into prompt
```

---

## Additional Features

### A1 — Text-to-Speech for AI Coaching

**What it does:** AI coaching text streamed back is narrated via TTS — useful for blindfold mode or hands-free play.

**Implementation Plan:**
- Frontend: Web Speech API (`speechSynthesis`) — zero backend changes
- Each `coach_chunk` message is fed to the TTS queue
- `coach_done` flushes the queue
- Voice selection: user configures in settings

```
coach_chunk {text} received
        │
        ▼
  ttsQueue.push(text)
        │
        ▼
  coach_done received
        │
        ▼
  speechSynthesis.speak(ttsQueue.join(''))
```

---

### A2 — Blindfold Mode

**What it does:** Board is hidden; AI voice narrates moves. Develops mental visualization — a feature not available on Lichess or Chess.com.

**Unique selling point:** No major chess platform offers AI-narrated blindfold training.

**Flow:**
```
User enables Blindfold Mode
        │
        ▼
  Frontend hides board rendering
        │
        ▼
  On each move:
    → AI coaching text includes move in SAN
    → TTS narrates: "You played e4. The engine
       responds with e5. Best move is Nf3."
        │
        ▼
  Hint request:
    → Returns SAN move only (no visual arrow)
    → TTS reads: "Consider Knight f3"
```

**Backend changes needed:** `board_update` response should include move in SAN (currently UCI only for `ai_move`). Add `ai_move_san` field.

---

### A3 — Leaderboard

**What it does:** Ranks all users by rating or puzzle accuracy. Motivates competition and retention.

**Implementation Plan:**
- New endpoint: `GET /api/leaderboard`
- Query `profiles` table ordered by `rating DESC`
- Optional filter: weekly vs all-time

```
GET /api/leaderboard?scope=weekly&limit=50

        │
        ▼
  SELECT user_id, username, rating,
         COUNT(games) as games_played
  FROM profiles JOIN games ...
  ORDER BY rating DESC
  LIMIT 50
```

**DB change needed:** `profiles` table already has `rating` column. Need to add `games_played` view or computed column.

---

### A4 — Weakness Auto-Detection in Chat

**What it does:** When a user asks about a weakness (e.g., "I'm bad at endgames"), the chat handler automatically recommends YouTube videos AND suggests relevant puzzles.

**Flow:**
```
POST /api/chat {message: "I always lose in endgames"}
        │
        ▼
  weakness_keywords = ["endgame","opening","tactics",
                       "fork","pin","pawn structure"...]
        │
        ▼
  If keyword matched:
    → Fetch YouTube videos: GET /api/learn?topic={keyword}
    → Fetch themed puzzles: GET /api/puzzles?theme={keyword}
    │
    ▼
  Gemini response includes:
    "Here are some resources: [videos]
     And here are puzzles to practice: [puzzles]"
```

---

### A5 — Enhanced Tactical Theme Detection

**What it does:** Replace the half-move-count `detectTheme` with real tactical pattern recognition.

**Current (weak):**
```go
// game.go — inaccurate
func detectTheme(halfMove int) string {
    if halfMove < 20 { return "opening" }
    if halfMove < 60 { return "tactic" }
    return "endgame"
}
```

**Proposed (accurate):**
```
After blunder detected:
        │
        ▼
  Analyze position for patterns:
  ┌─ fork:     piece attacks 2+ enemy pieces simultaneously
  ├─ pin:      piece is pinned to king or higher-value piece
  ├─ skewer:   high-value piece forced to move, exposing piece behind
  ├─ back rank:king trapped on back rank, rook/queen delivers mate
  ├─ promotion:passed pawn within 2 ranks of promotion
  └─ endgame:  ≤ 6 pieces total on board
        │
        ▼
  Use detected theme for:
    - missed_moves.theme (better puzzle categorization)
    - Situation Report (feeds theme to Gemini prompt)
```

---

### A6 — SM-2 Spaced Repetition

**What it does:** Replace the binary 24h/7d schedule with the SM-2 algorithm for optimal long-term memory.

**SM-2 Formula:**
```
Initial: EF = 2.5, interval = 1 day

After each review:
  q = user quality rating (0-5)
  EF' = EF + (0.1 - (5-q)(0.08 + (5-q)*0.02))
  EF' = max(1.3, EF')

  if q < 3:
    interval = 1 day (reset)
  else if first review:
    interval = 1 day
  else if second review:
    interval = 6 days
  else:
    interval = prev_interval * EF'
```

**DB changes needed:** Add `ease_factor FLOAT`, `review_count INT`, `interval_days INT` to `missed_moves`.

---

## Feature Priority Matrix

| Feature | Core / Additional | Effort | Impact | Priority |
|---------|------------------|--------|--------|----------|
| F1 Real-time game play | Core | Done | High | P0 |
| F2 AI Chat | Core | Done | High | P0 |
| F3 Opening Learning | Core | Done | Medium | P0 |
| F4 Spaced Repetition Puzzles | Core | Done | High | P0 |
| F5 Game Analysis | Core | Done | High | P0 |
| F6 Personality Modes | Core | Done | Medium | P0 |
| A1 Text-to-Speech | Additional | Low | High | P1 |
| A2 Blindfold Mode | Additional | Medium | High | P1 — unique differentiator |
| A3 Leaderboard | Additional | Low | Medium | P2 |
| A4 Weakness Auto-Detection | Additional | Medium | High | P1 |
| A5 Enhanced Theme Detection | Additional | Medium | High | P1 — fixes puzzle accuracy |
| A6 SM-2 SRS | Additional | Medium | Medium | P2 |

---

## Known Backend Gaps (Fix Before Demo)

| Gap | File | Fix |
|-----|------|-----|
| Hint uses non-grounded prompt | `game.go:303` | Run `AnalyzeBoard` + `BuildSituationReport` for hints too |
| `detectTheme` uses move count only | `stockfish.go:129` | Implement pattern-based detection (A5) |
| `ai_move` in board_update is UCI | `game.go:253` | Add `ai_move_san` field for frontend display |
| Move grade thresholds inconsistent | `stockfish.go:87` vs `game.go:225` | Unify: use `moveGrade()` from `stockfish.go` everywhere |
| Puzzle SRS is binary only | `puzzles.go:98` | SM-2 algorithm (A6) or at minimum 3-tier intervals |
