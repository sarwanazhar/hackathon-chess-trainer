# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered chess training backend. The core design prevents LLM hallucination by grounding all AI responses in verified Stockfish engine analysis — Gemini only explains facts that Stockfish has already verified, never inventing them.

**Stack:** Go backend, Gin HTTP framework, Gorilla WebSocket, Stockfish chess engine, Google Gemini API, Supabase (PostgreSQL only), Clerk (Auth), YouTube Data API v3.

## Commands

All commands run from `backend/`:

```bash
# Build
go build -o backend.exe

# Run (requires .env to be configured)
./backend.exe

# Download dependencies
go mod download

# Tidy dependencies
go mod tidy
```

Server starts on `localhost:8080`.

```bash
# Run connectivity / integration tests (requires live Supabase)
go test -v -run TestSupabaseReachable
go test -v -run TestTablesExist
go test -v -run TestCRUDPuzzles

# Re-seed general puzzle pool (safe to re-run — skips if 10+ puzzles exist)
go test -v -run TestSeedPuzzles

# Seed Lichess puzzles
go test -v -run TestSeedLichessPuzzles

# Seed video cache
go test -v -run TestSeedVideos
```

## Architecture

### Anti-Hallucination Pipeline

The key architectural decision is a 3-stage "Situation Report" that assembles engine-verified facts before calling Gemini:

1. **`stockfish.go`** — runs Stockfish at depth 15 (coaching) or 12 (hints), extracts evaluation in pawn units, best move in both UCI and SAN notation, and the principal variation line
2. **`board_analysis.go`** — extracts board facts: hanging pieces, king safety, material balance
3. **`situation_report.go`** — assembles a constrained prompt template that feeds only those verified facts to Gemini; the LLM explains moves, never invents them

### Auth

**Clerk** handles all authentication via `github.com/clerk/clerk-sdk-go/v2`.

- `clerk.SetKey(os.Getenv("CLERK_SECRET_KEY"))` is called at startup in `main.go`
- `clerkjwt.Verify()` validates tokens on every request
- WebSocket: token passed as `?token=<jwt>` query param
- REST: token passed as `Authorization: Bearer <jwt>` header
- `user_id` in all DB tables is a Clerk user ID (TEXT, e.g. `user_2abc...`) — **not** a UUID

Supabase Auth is **not used**. `SUPABASE_JWT_SECRET` in `.env` is dead weight from before the migration.

### Transport Layer

**WebSocket `/ws/game`** (`game.go`) — real-time game play. Auth via `?token=<clerk_jwt>` query param. The read loop is blocking per-connection. Blunders (eval drop > 1.5 pawns) are auto-saved to Supabase.

**REST `/api/*`** (`main.go`, individual handler files) — all require `Authorization: Bearer <clerk_jwt>`. Auth middleware in `main.go` extracts `user_id` for downstream handlers.

### File Responsibilities

| File | Purpose |
|------|---------|
| `main.go` | Server setup, routes, `authMiddleware` (Clerk) |
| `game.go` | WebSocket handler — game loop, move handling, hints |
| `stockfish.go` | UCI engine interface — `GetAnalysis()`, move grading, theme detection |
| `board_analysis.go` | Board fact extraction — hanging pieces, king safety, material |
| `situation_report.go` | Grounded prompt assembly for Gemini |
| `supabase.go` | DB client, save/fetch helpers (no auth logic) |
| `chat.go` | `POST /api/chat` — SSE streaming chat |
| `analyze.go` | `POST /api/analyze` — full game replay and grading |
| `puzzles.go` | `GET /api/puzzles`, `POST /api/puzzles/complete` — puzzle queue + SRS |
| `puzzle_play.go` | `POST /api/puzzles/attempt`, `POST /api/puzzles/coach` — interactive puzzle play |
| `openings.go` | `GET /api/learn` — topic content + YouTube search/cache |
| `connectivity_test.go` | Integration tests: reachability, table existence, CRUD |
| `seed_test.go` | Seeds 20 general-pool puzzles (run once) |
| `seed_lichess_test.go` | Seeds puzzles from Lichess puzzle database |
| `seed_videos_test.go` | Pre-populates video cache for common topics |
| `supabase_schema.sql` | Original DDL (Supabase Auth era) |
| `clerk_migration.sql` | Migration: drops UUID FK constraints, changes user_id to TEXT for Clerk |

### WebSocket Message Protocol

Client → Server:
```json
{"type": "new_game", "color": "white"}
{"type": "move", "move": "e2e4"}
{"type": "hint"}
{"type": "set_personality", "mode": "roast"}
{"type": "set_level", "level": "beginner"}
```

Server → Client:
```json
{"type": "board_update", "fen": "...", "ai_move": "e7e5", "eval": 0.2, "opening": "King's Pawn Game"}
{"type": "coach_chunk", "text": "...", "is_blunder": false}
{"type": "coach_done"}
{"type": "hint", "move": "d2d4", "eval": 1.5, "reason": "..."}
{"type": "game_over", "result": "checkmate", "winner": "white"}
{"type": "error", "message": "Invalid move"}
{"type": "debug_prompt", "prompt": "..."}
```

### Database Schema (Supabase)

- `profiles` — user_id (TEXT), username, rating, personality
- `games` — id, user_id (TEXT), pgn, moves[], result, color, analyzed
- `missed_moves` — id, user_id (TEXT), game_id, fen, user_move, best_move, eval_drop, theme, next_review_at
- `puzzles` — id, user_id (TEXT, NULL = general pool), fen, solution[], theme, difficulty, source
- `videos` — id, topic, title, video_url, channel (YouTube cache)

All `user_id` columns are **TEXT** (Clerk format) with no FK to `auth.users`. RLS policies were dropped in `clerk_migration.sql` — service key bypasses row-level security for all backend writes.

Blunders auto-generate puzzles via `missed_moves`.

## Environment Variables

All set in `backend/.env`.

| Variable | Status |
|----------|--------|
| `CLERK_SECRET_KEY` | Set (`sk_test_...`) |
| `GEMINI_API_KEY` | Set |
| `SUPABASE_URL` | Set (`https://vxexrrwgtmibjnvfmnqu.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Set (`sb_secret_*` format) |
| `SUPABASE_JWT_SECRET` | Set but **unused** — legacy from Supabase Auth era |
| `YOUTUBE_API_KEY` | Set |
| `STOCKFISH_PATH` | Set (`./stockfish/stockfish-windows-x86-64-avx2.exe`) |

## Key Design Details

- **Chess library**: `github.com/notnil/chess` handles game state, move validation, FEN parsing, and SAN conversion. `github.com/notnil/chess/uci` wraps the Stockfish process via UCI protocol.
- **Streaming**: WebSocket uses `json.Marshal` + `WriteMessage`; REST endpoints use SSE (`fmt.Fprintf(c.Writer, "data: ...\n\n")`); Gemini uses its iterator streaming API.
- **Personality modes**: "supportive Grandmaster" (default, `mentor`) or "roast comedian" (`roast`) — controlled per-user via `profiles.personality` and `set_personality` WebSocket messages.
- **Skill level**: `beginner` | `intermediate` | `advanced` — set via `set_level` WebSocket message, affects coaching depth/vocabulary in the situation report.
- **Move grading thresholds** (in `stockfish.go`): blunder > 1.5 pawns drop, mistake > 0.5, inaccuracy > 0.2.
- **CORS**: all origins accepted (hackathon scope).
- **Puzzle coaching** (`puzzle_play.go`): engine-only, no LLM — deterministic and rate-limit-free. The `/api/puzzles/coach` endpoint uses Stockfish + board analysis directly.
- **Video cache**: YouTube results stored in `videos` table. `openings.go` checks cache before hitting the YouTube API.
- **Puzzle pool**: General-pool puzzles seeded from `seed_test.go` and `seed_lichess_test.go`. Personal puzzles auto-generated from blunders during games.
