# Chess Trainer — Backend API Documentation

> **For the Next.js frontend team.** Base URL: `http://localhost:8080`
> Auth: **Clerk** JWTs. The backend uses `clerk-sdk-go/v2` — it validates your Clerk session tokens directly. No Supabase auth involved.

---

## Table of Contents

1. [Authentication](#authentication)
2. [WebSocket — Real-Time Game (`/ws/game`)](#websocket--real-time-game)
3. [REST — Chat (`POST /api/chat`)](#post-apichat)
4. [REST — Game Analysis (`POST /api/analyze`)](#post-apianalyze)
5. [REST — Puzzles](#puzzles)
   - [Get Puzzles (`GET /api/puzzles`)](#get-apipuzzles)
   - [Submit Move (`POST /api/puzzles/attempt`)](#post-apipuzzlesattempt)
   - [Get Coaching (`POST /api/puzzles/coach`)](#post-apipuzzlescoach)
   - [Complete Puzzle (`POST /api/puzzles/complete`)](#post-apipuzzlescomplete)
6. [REST — Opening Learning (`GET /api/learn`)](#get-apilearn)
7. [Error Handling](#error-handling)
8. [Data Types Reference](#data-types-reference)
9. [Auth Integration — Clerk + Backend (read last)](#auth-integration--clerk--backend)

---

## Authentication

The backend uses **Clerk session tokens** for all auth. The token is your Clerk session JWT — get it with `getToken()` from `useAuth()`.

| Transport | How to pass the token |
|-----------|----------------------|
| REST endpoints | `Authorization: Bearer <token>` header |
| WebSocket | `?token=<token>` query parameter in the URL |

> See the [Auth Integration](#auth-integration--clerk--backend) section at the bottom for full Next.js setup, a reusable fetch helper, SSE streaming, and a WebSocket hook with auto-reconnect.

---

## WebSocket — Real-Time Game

```
GET ws://localhost:8080/ws/game?token=<clerk_jwt>
```

One persistent WebSocket connection per game session. Send JSON messages to control the game; receive JSON messages for board state, AI coaching, and events.

### Connection lifecycle

1. Open the WebSocket with a valid token.
2. Send `new_game` to start a game.
3. Send `move` messages as the user plays.
4. After each move, receive `board_update` → stream of `coach_chunk` → `coach_done`.
5. Receive `game_over` when the game ends.
6. Close the WebSocket — the backend auto-saves the final game state.

---

### Client → Server Messages

#### `new_game`
Starts a new game. Resets board state and saves a game record to the DB.

```json
{
  "type": "new_game",
  "color": "white"
}
```

| Field | Type | Values | Required |
|-------|------|--------|----------|
| `type` | string | `"new_game"` | yes |
| `color` | string | `"white"` \| `"black"` | yes |

**Response:** `board_update` with the starting FEN.

---

#### `move`
Submit a move in **UCI notation** (e.g. `"e2e4"`, `"g1f3"`, `"e1g1"` for castling).

```json
{
  "type": "move",
  "move": "e2e4"
}
```

| Field | Type | Description | Required |
|-------|------|-------------|----------|
| `type` | string | `"move"` | yes |
| `move` | string | UCI move string | yes |

**Response sequence:**
1. `board_update` — new board state after user + AI moves
2. `coach_chunk` × N — streaming AI coaching text
3. `coach_done` — coaching finished
4. *(or)* `game_over` — if the game ended

---

#### `hint`
Ask for the best move in the current position. Can be called any time during a game.

```json
{ "type": "hint" }
```

**Response:** `hint` message with the best move and a one-sentence reason.

---

#### `set_personality`
Change the AI coach's communication style. Persisted for the session.

```json
{
  "type": "set_personality",
  "mode": "roast"
}
```

| Field | Type | Values |
|-------|------|--------|
| `mode` | string | `"mentor"` (default, supportive Grandmaster) \| `"roast"` (savage but accurate) |

No response message — takes effect on the next coaching message.

---

#### `set_level`
Adjust coaching depth and vocabulary for the user's skill level.

```json
{
  "type": "set_level",
  "level": "beginner"
}
```

| Field | Type | Values |
|-------|------|--------|
| `level` | string | `"beginner"` \| `"intermediate"` \| `"advanced"` |

No response message — takes effect on the next coaching message.

---

### Server → Client Messages

#### `board_update`
Sent after `new_game` and after every move (both user and AI).

```json
{
  "type": "board_update",
  "fen": "rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1",
  "ai_move": "e7e5",
  "eval": 0.2,
  "opening": "King's Pawn Game"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `fen` | string | Current board FEN after both moves |
| `ai_move` | string | AI's last move in **UCI** notation (omitted for `new_game`) |
| `eval` | number | Engine evaluation in pawns (positive = White advantage) |
| `opening` | string | ECO opening name if recognized (may be omitted) |

> **Note:** `ai_move` is UCI. If you need SAN for display, convert client-side using a chess library (e.g. `chess.js`).

---

#### `coach_chunk`
Part of the streaming AI coaching response. Concatenate all chunks to build the full text.

```json
{
  "type": "coach_chunk",
  "text": "Your move e4 controls the center...",
  "is_blunder": false
}
```

| Field | Type | Description |
|-------|------|-------------|
| `text` | string | Partial coaching text |
| `is_blunder` | boolean | `true` if the user's move was a blunder (eval drop > 1.5 pawns) |

> Use `is_blunder` to style the coaching panel (e.g. red highlight).

---

#### `coach_done`
Signals the end of the coaching stream.

```json
{ "type": "coach_done" }
```

---

#### `hint`
Response to a `hint` request.

```json
{
  "type": "hint",
  "move": "g1f3",
  "eval": 0.5,
  "reason": "Nf3 develops the knight and controls the center while preparing kingside castling."
}
```

| Field | Type | Description |
|-------|------|-------------|
| `move` | string | Best move in **UCI** notation |
| `eval` | number | Engine evaluation after this move |
| `reason` | string | One-sentence AI explanation |

---

#### `game_over`
Sent when the game ends (checkmate, stalemate, draw).

```json
{
  "type": "game_over",
  "result": "checkmate",
  "winner": "white"
}
```

| Field | Type | Values |
|-------|------|--------|
| `result` | string | `"checkmate"` \| `"stalemate"` \| `"draw"` |
| `winner` | string | `"white"` \| `"black"` \| `""` (empty for draws) |

---

#### `error`
Sent when an operation fails (invalid move, no game started, etc.).

```json
{
  "type": "error",
  "message": "Invalid move"
}
```

---

#### `debug_prompt`
Transparency feature — the exact grounded prompt sent to Gemini, emitted **before every coaching stream** (fires on every `move`, not just blunders).

```json
{
  "type": "debug_prompt",
  "prompt": "..."
}
```

Safe to ignore in production UI. Useful for a debug panel during development.

---

### Move Grading Thresholds

| Grade | Eval Drop |
|-------|-----------|
| Blunder | > 1.5 pawns |
| Mistake | > 0.8 pawns |
| Inaccuracy | > 0.3 pawns |
| Good | ≤ 0.3 pawns |

---

## `POST /api/chat`

Free-form chess Q&A with an AI coach. Optionally attach a saved game for context.

**Request:**
```json
{
  "message": "How do I improve my endgame?",
  "game_id": "uuid-optional"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `message` | string | yes | User's question |
| `game_id` | string | no | UUID of a saved game for context |

**Response: SSE stream (`text/event-stream`)**

Each event is a JSON chunk:
```
data: {"chunk": "The endgame is all about king activity..."}

data: {"chunk": " You should centralize your king early."}

data: [DONE]
```

**Consuming SSE in React:**
```ts
const token = await getToken();
const response = await fetch("http://localhost:8080/api/chat", {
  method: "POST",
  headers: {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ message: "How do I improve my endgame?" }),
});

const reader = response.body!.getReader();
const decoder = new TextDecoder();

while (true) {
  const { done, value } = await reader.read();
  if (done) break;
  const text = decoder.decode(value);
  const lines = text.split("\n").filter(l => l.startsWith("data: "));
  for (const line of lines) {
    const payload = line.replace("data: ", "");
    if (payload === "[DONE]") break;
    const { chunk } = JSON.parse(payload);
    // append chunk to your display
  }
}
```

---

## `POST /api/analyze`

Replays a completed game move-by-move using Stockfish (depth 12), grades every move, and returns a summary. Also auto-saves blunders/mistakes as personal puzzles.

Provide either `game_id` (for a saved game) or `pgn` (for an externally imported game) — not both.

**Request:**
```json
{
  "game_id": "uuid-of-saved-game"
}
```
or
```json
{
  "pgn": "1. e4 e5 2. Nf3 Nc6 ..."
}
```

**Response:**
```json
{
  "moves": [
    { "move": "e4",  "eval": 0.3,  "grade": "good" },
    { "move": "e5",  "eval": 0.0,  "grade": "good" },
    { "move": "Nf3", "eval": 0.4,  "grade": "good" },
    { "move": "Nc6", "eval": 0.0,  "grade": "good" },
    { "move": "Bc4", "eval": 0.5,  "grade": "good" },
    { "move": "d6",  "eval": -0.8, "grade": "mistake" }
  ],
  "summary": "You played a solid opening but lost the thread in the middlegame with 3 mistakes. Focus on piece coordination.",
  "weak_areas": ["tactic", "endgame"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `moves` | array | One entry per half-move (ply) |
| `moves[].move` | string | Move in **SAN** notation |
| `moves[].eval` | number | Engine eval after this move (pawns, White POV) |
| `moves[].grade` | string | `"good"` \| `"inaccuracy"` \| `"mistake"` \| `"blunder"` |
| `summary` | string | 2-sentence AI coaching summary |
| `weak_areas` | string[] | Detected weak tactical themes |

---

## Puzzles

### `GET /api/puzzles`

Returns a personalized puzzle queue. First pulls from the user's own blunders (`missed_moves`), topped up from the general pool if fewer than 3 personal puzzles are available.

**Query parameters:**

| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `theme` | string | — | Filter by theme (see themes below) |
| `limit` | number | `5` | Max puzzles to return |

**Available themes:** `opening`, `tactic`, `endgame`, `fork`, `pin`, `skewer`, `back_rank`, `checkmate`, `promotion`, `combination`

**Example:**
```
GET /api/puzzles?theme=endgame&limit=3
Authorization: Bearer <token>
```

**Response:**
```json
[
  {
    "id": "uuid",
    "fen": "8/5k2/8/8/8/8/5K2/4R3 w - - 0 1",
    "solution": ["Re7+", "Kf8", "Re8#"],
    "theme": "endgame",
    "difficulty": 2
  }
]
```

| Field | Type | Description |
|-------|------|-------------|
| `id` | string | Puzzle UUID |
| `fen` | string | Starting position FEN |
| `solution` | string[] | Correct moves in **SAN** notation, in order |
| `theme` | string | Tactical theme |
| `difficulty` | number | `1` (easy) \| `2` (medium) \| `3` (hard) |

> Solutions use SAN. When submitting attempts, you send **UCI** — the backend converts internally.

---

### `POST /api/puzzles/attempt`

Submit a user's move for a puzzle. Handles multi-move puzzles by returning the opponent's response and the next position.

**Flow for multi-move puzzles:**
1. Call `/attempt` with `move_index: 0` and the starting FEN.
2. If `correct: true` and `complete: false` → show opponent move, update FEN to `next_fen`, call `/attempt` again with `move_index: next_index`.
3. If `correct: true` and `complete: true` → puzzle solved! Call `/puzzles/complete`.
4. If `correct: false` → show the correct move (`best_move_san`), optionally call `/puzzles/coach`.

**Request:**
```json
{
  "puzzle_id": "uuid",
  "move": "e1e7",
  "move_index": 0,
  "fen": "8/5k2/8/8/8/8/5K2/4R3 w - - 0 1"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `puzzle_id` | string | yes | From `GET /api/puzzles` |
| `move` | string | yes | User's move in **UCI** notation |
| `move_index` | number | yes | 0-based index into the solution array |
| `fen` | string | yes | Current board FEN (client-tracked) |

**Response — correct + more moves:**
```json
{
  "correct": true,
  "complete": false,
  "opponent_move_san": "Kf8",
  "opponent_move_uci": "f7f8",
  "next_fen": "8/5k2/8/8/8/8/5K2/4R3 w - - 1 2",
  "next_index": 2
}
```

**Response — correct + puzzle complete:**
```json
{
  "correct": true,
  "complete": true
}
```

**Response — wrong move:**
```json
{
  "correct": false,
  "best_move_san": "Re7+",
  "best_move_uci": "e1e7"
}
```

---

### `POST /api/puzzles/coach`

Get engine-grounded coaching for a wrong puzzle move. **No AI/LLM is used here** — all analysis is from Stockfish, so it's instant and always accurate.

Call this after receiving `correct: false` from `/attempt`.

**Request:**
```json
{
  "fen": "8/5k2/8/8/8/8/5K2/4R3 w - - 0 1",
  "wrong_move": "e1e8",
  "best_move": "e1e7",
  "theme": "endgame"
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `fen` | string | yes | Position FEN |
| `wrong_move` | string | yes | User's wrong move in **UCI** |
| `best_move` | string | yes | Correct move in **UCI** (from `/attempt` response) |
| `theme` | string | no | Tactical theme for tip generation |

**Response:**
```json
{
  "wrong_move_san": "Re8",
  "best_move_san": "Re7+",
  "eval_drop": 2.1,
  "grade": "blunder",
  "eval": 5.3,
  "eval_label": "White is winning",
  "pv_line": ["Kf8", "Re8#"],
  "coaching": "Re8 was a blunder (2.1 pawn drop). The correct move is Re7+ (eval: +5.3, White is winning). Best line: Kf8 Re8#. Tip: In endgames, king activity and pawn advancement are key.",
  "board_facts": ["White is up a rook"]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `wrong_move_san` | string | User's wrong move in SAN |
| `best_move_san` | string | Correct move in SAN |
| `eval_drop` | number | Pawn evaluation loss |
| `grade` | string | `"blunder"` \| `"mistake"` \| `"inaccuracy"` \| `"good"` |
| `eval` | number | Engine eval at the position |
| `eval_label` | string | Human label (e.g. `"White is winning"`) |
| `pv_line` | string[] | Best continuation after the correct move |
| `coaching` | string | Full coaching text (no LLM, deterministic) |
| `board_facts` | string[] | Key position facts (hanging pieces, king safety, material) |

---

### `POST /api/puzzles/complete`

Record the result of a completed puzzle attempt and schedule the next review (spaced repetition).

| Result | Next Review |
|--------|-------------|
| `solved: true` | 7 days |
| `solved: false` | 24 hours |

**Request:**
```json
{
  "puzzle_id": "uuid",
  "solved": true,
  "time_taken_ms": 8400
}
```

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `puzzle_id` | string | yes | UUID of the puzzle |
| `solved` | boolean | yes | Whether the user solved it |
| `time_taken_ms` | number | no | Time taken in milliseconds |

**Response:**
```json
{ "ok": true }
```

---

## `GET /api/learn`

Returns AI-generated learning content and curated YouTube videos for any chess topic. Videos are cached in the DB after the first fetch.

**Query parameters:**

| Param | Type | Default | Required | Description |
|-------|------|---------|----------|-------------|
| `topic` | string | — | yes | Topic to learn (e.g. `"sicilian-defense"`, `"rook endgame"`) |
| `type` | string | `"opening"` | no | Type of content for the AI prompt (`"opening"` \| `"tactic"` \| `"endgame"` \| etc.) |

**Examples:**
```
GET /api/learn?topic=sicilian-defense
GET /api/learn?topic=rook+endgame&type=endgame
GET /api/learn?topic=fork&type=tactic
```

**Response:**
```json
{
  "topic": "Sicilian Defense",
  "summary": "The Sicilian Defense is Black's most popular response to 1.e4. It leads to asymmetrical positions where both sides have winning chances.",
  "key_ideas": [
    "Black fights for the center with a flank pawn",
    "Common variations: Najdorf, Dragon, Scheveningen",
    "Black typically counterattacks on the queenside"
  ],
  "videos": [
    {
      "title": "Sicilian Defense: Complete Guide",
      "url": "https://www.youtube.com/watch?v=abc123",
      "channel": "GothamChess"
    }
  ],
  "source": "cache"
}
```

| Field | Type | Description |
|-------|------|-------------|
| `topic` | string | Display-formatted topic name |
| `summary` | string | 2-3 sentence AI overview |
| `key_ideas` | string[] | 3 key ideas about the topic |
| `videos` | array | Up to 3 YouTube videos |
| `videos[].title` | string | Video title |
| `videos[].url` | string | Full YouTube URL |
| `videos[].channel` | string | Channel name |
| `source` | string | `"cache"` (from DB) \| `"live"` (fetched from YouTube) |

---

## Error Handling

All REST endpoints return standard JSON errors:

```json
{ "error": "description" }
```

| HTTP Status | When |
|-------------|------|
| `400` | Bad request — missing/invalid fields |
| `401` | Missing or invalid Clerk token |
| `404` | Resource not found (game, puzzle) |
| `500` | Server error (Stockfish, DB, AI) |

WebSocket errors are sent as messages (connection stays open):
```json
{ "type": "error", "message": "Invalid move" }
```

---

## Data Types Reference

### Move Notation

The backend uses two move formats:

| Format | Example | Used in |
|--------|---------|---------|
| **UCI** | `"e2e4"`, `"g1f3"`, `"e1g1"` (castling) | Sending moves to server, `ai_move`, `hint.move` |
| **SAN** | `"e4"`, `"Nf3"`, `"O-O"` | Displaying moves to users, puzzle solutions, analysis |

When you need to convert for display purposes, use [chess.js](https://github.com/jhlywa/chess.js) on the frontend:

```ts
import { Chess } from "chess.js";

const chess = new Chess(fen);
// UCI → SAN
const move = chess.move({ from: "e2", to: "e4" });
console.log(move.san); // "e4"
```

### Evaluation Scale

| Eval range | Label |
|------------|-------|
| > +3.0 | White winning |
| +0.5 to +3.0 | White better |
| -0.5 to +0.5 | Equal |
| -3.0 to -0.5 | Black better |
| < -3.0 | Black winning |

Positive = White advantage. During a game where the user plays Black, a high positive eval means the user is losing.

### Personality Modes

| Mode | Behavior |
|------|----------|
| `"mentor"` | Supportive, educational, encouraging (default) |
| `"roast"` | Savage but technically accurate criticism |

---

## Auth Integration — Clerk + Backend

The backend verifies **Clerk session tokens** directly using the Clerk SDK. The `user_id` for all DB records is `claims.Subject` from the JWT — the Clerk user ID (e.g. `user_2abc...`). You never send it explicitly.

---

### 1. Next.js setup

Install Clerk:
```bash
npm install @clerk/nextjs
```

Add to `.env.local` (get your publishable key from the Clerk dashboard — it starts with `pk_test_`):
```
NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY=pk_test_...
CLERK_SECRET_KEY=sk_test_YOUR_CLERK_SECRET_KEY_HERE
```

Wrap your app in `app/layout.tsx`:
```tsx
import { ClerkProvider } from "@clerk/nextjs";

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <ClerkProvider>
      <html lang="en">
        <body>{children}</body>
      </html>
    </ClerkProvider>
  );
}
```

Add sign-in / sign-up pages (Clerk handles the UI):
```
app/sign-in/[[...sign-in]]/page.tsx  → <SignIn />
app/sign-up/[[...sign-up]]/page.tsx  → <SignUp />
```

Protect routes in `middleware.ts`:
```ts
import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublic = createRouteMatcher(["/sign-in(.*)", "/sign-up(.*)"]);

export default clerkMiddleware((auth, req) => {
  if (!isPublic(req)) auth().protect();
});

export const config = {
  matcher: ["/((?!_next|.*\\..*).*)"],
};
```

---

### 2. Making authenticated REST requests

Create a reusable helper so you never forget the header:

```ts
// lib/api.ts
import { useAuth } from "@clerk/nextjs";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";

export function useApi() {
  const { getToken } = useAuth();

  const apiFetch = async (path: string, options: RequestInit = {}) => {
    const token = await getToken(); // always fresh — never cache this
    const res = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
        ...options.headers,
      },
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: res.statusText }));
      throw new Error(err.error ?? "Request failed");
    }
    return res;
  };

  return { apiFetch };
}
```

Usage in a component:
```tsx
"use client";
import { useApi } from "@/lib/api";

export function Puzzles() {
  const { apiFetch } = useApi();

  const loadPuzzles = async () => {
    const res = await apiFetch("/api/puzzles?limit=5");
    const data = await res.json();
    console.log(data); // Puzzle[]
  };
}
```

---

### 3. SSE streaming (chat)

```ts
// lib/api.ts — add this alongside apiFetch
const streamChat = async (
  message: string,
  onChunk: (text: string) => void,
  gameId?: string,
) => {
  const token = await getToken();
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({ message, game_id: gameId }),
  });

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    const text = decoder.decode(value);
    for (const line of text.split("\n")) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6);
      if (payload === "[DONE]") return;
      try {
        const { chunk } = JSON.parse(payload);
        onChunk(chunk);
      } catch {}
    }
  }
};
```

---

### 4. WebSocket (game)

WebSocket connections are authenticated **once at connect time** using a token in the query string.

Clerk session tokens expire in ~60 seconds by default. For a game session that lasts longer, you need to either:
- (Recommended) Go to your Clerk dashboard → **Sessions** → extend the token lifetime, **or**
- Reconnect the WebSocket with a fresh token when the connection drops.

```ts
// hooks/useGameSocket.ts
"use client";
import { useAuth } from "@clerk/nextjs";
import { useEffect, useRef } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:8080";
const WS_BASE = API_BASE.replace(/^http/, "ws");

export function useGameSocket(onMessage: (msg: any) => void) {
  const { getToken } = useAuth();
  const wsRef = useRef<WebSocket | null>(null);

  const connect = async () => {
    const token = await getToken();
    const ws = new WebSocket(`${WS_BASE}/ws/game?token=${token}`);
    wsRef.current = ws;

    ws.onmessage = (e) => {
      try { onMessage(JSON.parse(e.data)); } catch {}
    };

    ws.onclose = () => {
      // Auto-reconnect after 2s (with fresh token)
      setTimeout(connect, 2000);
    };
  };

  useEffect(() => {
    connect();
    return () => wsRef.current?.close();
  }, []);

  const send = (msg: object) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(msg));
    }
  };

  return { send };
}
```

Usage:
```tsx
const { send } = useGameSocket((msg) => {
  if (msg.type === "board_update") setFen(msg.fen);
  if (msg.type === "coach_chunk") setCoaching(prev => prev + msg.text);
  if (msg.type === "coach_done") setStreaming(false);
  if (msg.type === "game_over") setResult(msg.result);
});

// Start a game
send({ type: "new_game", color: "white" });

// Make a move (UCI format)
send({ type: "move", move: "e2e4" });
```

---

### 5. Environment variable for the backend URL

Add to `.env.local`:
```
NEXT_PUBLIC_API_URL=http://localhost:8080
```

For production, change this to your deployed backend URL.

---

## Quick Reference

| Endpoint | Method | Auth | Description |
|----------|--------|------|-------------|
| `/ws/game?token=<jwt>` | WS | query param | Real-time game + AI coaching |
| `/api/chat` | POST | Bearer | Streaming chess Q&A (SSE) |
| `/api/analyze` | POST | Bearer | Full game analysis (game_id or PGN) |
| `/api/puzzles` | GET | Bearer | Get personalized puzzle queue |
| `/api/puzzles/attempt` | POST | Bearer | Submit a puzzle move |
| `/api/puzzles/coach` | POST | Bearer | Engine coaching for a wrong move (no LLM) |
| `/api/puzzles/complete` | POST | Bearer | Record puzzle result + schedule next review |
| `/api/learn` | GET | Bearer | Topic learning content + YouTube videos |

### WebSocket messages at a glance

**Client → Server**

| `type` | Key fields | Effect |
|--------|-----------|--------|
| `new_game` | `color` | Start a new game |
| `move` | `move` (UCI) | Play a move |
| `hint` | — | Get best move suggestion |
| `set_personality` | `mode` (`mentor`/`roast`) | Change coaching tone |
| `set_level` | `level` (`beginner`/`intermediate`/`advanced`) | Change coaching depth |

**Server → Client**

| `type` | Key fields | When |
|--------|-----------|------|
| `board_update` | `fen`, `ai_move` (UCI), `eval`, `opening` | After new_game or move |
| `coach_chunk` | `text`, `is_blunder` | Streaming coaching (multiple) |
| `coach_done` | — | Coaching stream finished |
| `hint` | `move` (UCI), `eval`, `reason` | Response to hint request |
| `game_over` | `result`, `winner` | Game ended |
| `error` | `message` | Invalid move or server error |
| `debug_prompt` | `prompt` | Grounded prompt sent to Gemini |
