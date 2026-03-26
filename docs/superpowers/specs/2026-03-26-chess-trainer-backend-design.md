# Chess Trainer Backend — Design Spec
**Date:** 2026-03-26
**Hackathon Deadline:** 2026-03-28
**Stack:** Go + Gin · Stockfish · Gemini (Gemma-3-27b-it) · Supabase
**Scope:** Backend only. Frontend being built by a second team member.

---

## Project Overview

An AI-powered chess trainer that grounds all coaching advice in hard engine facts, preventing LLM hallucination. The coach analyzes every move using Stockfish + board logic, assembles a "Situation Report" of verified facts, and feeds only that to Gemini — so the LLM explains, never invents.

---

## Features (MVP for Hackathon)

| Feature | Delivery |
|---|---|
| A. Grounded AI move coaching (no hallucination) | WebSocket |
| B. Hints (best move on demand) | WebSocket |
| C. Chat with AI coach | REST |
| D. Personalized puzzles from user blunders | REST |
| G. Post-game analysis | REST |
| H. Opening/endgame learning + YouTube search | REST |

**Out of scope for MVP:** Text-to-speech, leaderboard, blindfold mode, spaced repetition scheduling (store data but no review scheduler).

---

## Architecture

### Transport

- **WebSocket** `/ws/game` — real-time game play, live AI coaching, hints
- **REST** `/api/*` — chat, analysis, puzzles, learning content

### File Structure

```
backend/
  main.go              # Server setup, routes, middleware
  game.go              # WebSocket handler, game loop (refactored from current main.go)
  board_analysis.go    # Hanging pieces, king safety, material count
  stockfish.go         # Eval, best move, PV line extraction
  situation_report.go  # Assembles Stockfish + board facts → grounded prompt
  chat.go              # POST /api/chat
  analyze.go           # POST /api/analyze
  puzzles.go           # GET /api/puzzles, POST /api/puzzles/complete
  openings.go          # GET /api/learn + YouTube Data API v3 search
  supabase.go          # Supabase client, JWT verification, DB helpers
  stockfish/           # Stockfish binary (already present)
```

---

## Core Fix: The Situation Report

### Problem
The current backend sends raw FEN + piece names to Gemini. Gemini hallucinates illegal moves and wrong tactical explanations.

### Solution
Three-stage grounding pipeline before every LLM call:

**Stage 1 — `stockfish.go`**
```
Input:  game.Position()
Output: Eval (float64), BestMove (string), PV []string (5 moves)
Method: UCI, depth 15
```

**Stage 2 — `board_analysis.go`**
Uses `github.com/notnil/chess` to scan the board:
- `FindHangingPieces(pos)` — pieces attacked but undefended (both sides)
- `KingSafety(pos, color)` — is king on open/semi-open file?
- `MaterialBalance(pos)` — centipawn difference converted to float

**Stage 3 — `situation_report.go`**
Assembles all facts into a single string:
```
### VERIFIED FACTS (do not contradict) ###
Eval: +2.1 (White winning)
Best Move: Rd1 (Rook to d1)
Top Line: Rd1 Qe7 Rxd8+ Rxd8 Bxf6

Board Facts:
- Black Knight on f6 is attacked by White Pawn and undefended
- Black King is exposed on open g-file
- White is up +1 Pawn

User played: Nf3 | Eval drop: -1.8 (blunder)

### TASK ###
You are a [PERSONALITY] chess coach.
Explain WHY Rd1 is best using ONLY the facts above. 2-3 sentences. Be direct.
```

`[PERSONALITY]` is substituted per user preference: `"blunt Grandmaster"` (default) or `"roast comedian"`.

---

## WebSocket Protocol (`/ws/game`)

All messages are JSON.

### Client → Server

```json
{"type": "new_game", "color": "white"}
{"type": "move", "move": "e2e4"}
{"type": "hint"}
{"type": "set_personality", "mode": "roast"}
```

### Server → Client

```json
{"type": "board_update", "fen": "...", "ai_move": "e7e5", "eval": 0.2}
{"type": "coach_chunk", "text": "...", "is_blunder": false}
{"type": "coach_done"}
{"type": "hint", "move": "d2d4", "eval": 1.5, "reason": "Controls center"}
{"type": "game_over", "result": "checkmate", "winner": "white"}
{"type": "error", "message": "Invalid move"}
```

**Blunder auto-save:** When `eval_drop > 1.5`, the position is saved to `missed_moves` in Supabase and tagged with a theme (tactic / endgame / opening).

---

## REST API Endpoints

All endpoints require `Authorization: Bearer <supabase_jwt>` header. Go backend verifies the JWT using Supabase's JWKS.

### POST /api/chat
Chat with the AI coach about any chess topic.
```json
// Request
{"message": "How do I improve my endgame?", "game_id": "uuid (optional)"}

// Response (streaming, text/event-stream)
data: {"chunk": "Endgames require..."}
data: {"chunk": "...precise calculation."}
data: [DONE]
```
If `game_id` is provided, the prompt includes a summary of that game for context.

### POST /api/analyze
Full post-game analysis. Runs Stockfish on every move, grades each one.
```json
// Request
{"game_id": "uuid"}

// Response
{
  "moves": [
    {"move": "e2e4", "eval": 0.2, "grade": "good", "comment": "Solid opening."},
    {"move": "Nf3",  "eval": -1.8, "grade": "blunder", "comment": "Drops the knight."}
  ],
  "summary": "You played well in the opening but blundered in the endgame.",
  "weak_areas": ["endgame", "knight endings"]
}
```
Saves missed moves to Supabase. Sets `games.analyzed = true`.

### GET /api/puzzles
Returns personalized puzzles generated from the user's own blunders.
```
Query params:
  ?theme=endgame   (optional filter)
  ?limit=5         (default 5)
```
```json
[
  {"id": "uuid", "fen": "...", "theme": "endgame", "difficulty": 3},
  ...
]
```
If user has fewer than 3 puzzles from their own games, fills remainder from a general puzzle pool.

### POST /api/puzzles/complete
Mark a puzzle attempt. Used for tracking progress.
```json
{"puzzle_id": "uuid", "solved": true, "time_taken_ms": 4200}
```

### GET /api/learn
Returns learning content + YouTube video for a topic.
```
Query params:
  ?topic=sicilian-defense   (opening name or endgame type)
  ?type=opening             (opening | endgame)
```
```json
{
  "topic": "Sicilian Defense",
  "summary": "The Sicilian is Black's most popular response to 1.e4...",
  "key_ideas": ["Control of d5", "Queenside counterplay"],
  "youtube": {
    "title": "Sicilian Defense: Complete Guide",
    "url": "https://youtube.com/watch?v=...",
    "channel": "GothamChess"
  }
}
```
YouTube search uses YouTube Data API v3. Query: `"{topic} chess tutorial"`.

---

## Supabase Schema

```sql
-- Managed by Supabase Auth
-- auth.users: id, email, created_at

-- User profile and preferences
CREATE TABLE profiles (
  user_id       UUID PRIMARY KEY REFERENCES auth.users(id),
  username      TEXT UNIQUE NOT NULL,
  rating        INT DEFAULT 800,
  personality   TEXT DEFAULT 'mentor',  -- 'mentor' | 'roast'
  created_at    TIMESTAMPTZ DEFAULT NOW()
);

-- Game records
CREATE TABLE games (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID REFERENCES auth.users(id),
  pgn         TEXT,
  moves       TEXT[],
  result      TEXT,   -- 'win' | 'loss' | 'draw'
  color       TEXT,   -- 'white' | 'black'
  analyzed    BOOLEAN DEFAULT FALSE,
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

-- Blunders → source of personalized puzzles
CREATE TABLE missed_moves (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id),
  game_id        UUID REFERENCES games(id),
  fen            TEXT NOT NULL,
  user_move      TEXT NOT NULL,
  best_move      TEXT NOT NULL,
  eval_drop      FLOAT NOT NULL,
  theme          TEXT,  -- 'tactic' | 'endgame' | 'opening'
  next_review_at TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

-- Puzzle pool (auto-generated from missed_moves + seeded general puzzles)
CREATE TABLE puzzles (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id) NULL,  -- NULL = general pool
  fen        TEXT NOT NULL,
  solution   TEXT[],   -- array of moves e.g. ["Rd1", "Qe7", "Rxd8"]
  theme      TEXT,
  difficulty INT DEFAULT 1,
  source     TEXT DEFAULT 'auto'  -- 'auto' | 'manual'
);
```

---

## Auth Flow

1. User logs in via frontend → Supabase issues JWT
2. Frontend sends `Authorization: Bearer <jwt>` on all API calls and WebSocket upgrade (`?token=<jwt>`)
3. Go backend calls `supabase.VerifyJWT(token)` → extracts `user_id`
4. All DB queries are scoped to that `user_id`

---

## Environment Variables

```
GEMINI_API_KEY=
SUPABASE_URL=
SUPABASE_JWT_SECRET=
YOUTUBE_API_KEY=
STOCKFISH_PATH=./stockfish/stockfish-windows-x86-64-avx2.exe
```

---

## Hackathon Scope Notes

- Spaced repetition: `next_review_at` is stored but no background scheduler — `GET /api/puzzles` simply returns puzzles ordered by `next_review_at ASC` (good enough for demo)
- Leaderboard: table not in MVP schema — add after core features work
- Text-to-speech: handled entirely by frontend (Web Speech API) — backend just streams text
- Blindfold mode: frontend-only feature
- YouTube: use YouTube Data API v3 with a single search query per topic — no caching needed for demo
