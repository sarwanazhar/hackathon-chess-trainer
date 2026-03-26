# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

AI-powered chess training backend. The core design prevents LLM hallucination by grounding all AI responses in verified Stockfish engine analysis — Gemini only explains facts that Stockfish has already verified, never inventing them.

**Stack:** Go backend, Gin HTTP framework, Gorilla WebSocket, Stockfish chess engine, Google Gemini API, Supabase (PostgreSQL + Auth), YouTube Data API v3.

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
go test -v -run TestAuthServiceReachable
go test -v -run TestVerifyJWTRejectsGarbage
go test -v -run TestTablesExist
go test -v -run TestCRUDPuzzles

# Re-seed general puzzle pool (safe to re-run — skips if 10+ puzzles exist)
go test -v -run TestSeedPuzzles

# List users via Supabase Admin API (dev only)
curl "https://vxexrrwgtmibjnvfmnqu.supabase.co/auth/v1/admin/users" \
  -H "apikey: $SUPABASE_SERVICE_KEY" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_KEY"
```

## Architecture

### Anti-Hallucination Pipeline

The key architectural decision is a 3-stage "Situation Report" that assembles engine-verified facts before calling Gemini:

1. **`stockfish.go`** — runs Stockfish at depth 15 (coaching) or 12 (hints), extracts evaluation in pawn units, best move in both UCI and SAN notation, and the principal variation line
2. **`board_analysis.go`** — extracts board facts: hanging pieces, king safety, material balance
3. **`situation_report.go`** — assembles a constrained prompt template that feeds only those verified facts to Gemini; the LLM explains moves, never invents them

### Transport Layer

**WebSocket `/ws/game`** (`game.go`) — real-time game play. Auth via `?token=<jwt>` query param. The read loop is blocking per-connection. Blunders (eval drop > 1.5 pawns) are auto-saved to Supabase.

**REST `/api/*`** (`main.go`, individual handler files) — all require `Authorization: Bearer <jwt>`. Auth middleware in `main.go` extracts `user_id` for downstream handlers.

### File Responsibilities

| File | Purpose |
|------|---------|
| `main.go` | Server setup, routes, `authMiddleware` |
| `game.go` | WebSocket handler — game loop, move handling, hints |
| `stockfish.go` | UCI engine interface — `GetAnalysis()`, move grading, theme detection |
| `board_analysis.go` | Board fact extraction — hanging pieces, king safety, material |
| `situation_report.go` | Grounded prompt assembly for Gemini |
| `supabase.go` | DB client, `VerifyJWT()` (calls `/auth/v1/user`), save/fetch helpers |
| `connectivity_test.go` | Integration tests: reachability, auth, table existence, CRUD |
| `seed_test.go` | Seeds 20 general-pool puzzles (run once) |
| `supabase_schema.sql` | DDL for all 4 tables + RLS policies (already applied) |
| `chat.go` | `POST /api/chat` — SSE streaming chat |
| `analyze.go` | `POST /api/analyze` — full game replay and grading |
| `puzzles.go` | `GET/POST /api/puzzles` — personalized puzzle pool |
| `openings.go` | `GET /api/learn` — topic content + YouTube search |

### WebSocket Message Protocol

Client → Server:
```json
{"type": "new_game", "color": "white"}
{"type": "move", "move": "e2e4"}
{"type": "hint"}
{"type": "set_personality", "mode": "roast"}
```

Server → Client:
```json
{"type": "board_update", "fen": "...", "ai_move": "e7e5", "eval": 0.2}
{"type": "coach_chunk", "text": "...", "is_blunder": false}
{"type": "coach_done"}
{"type": "hint", "move": "d2d4", "eval": 1.5, "reason": "..."}
{"type": "game_over", "result": "checkmate", "winner": "white"}
{"type": "error", "message": "Invalid move"}
```

### Database Schema (Supabase)

- `profiles` — user_id, username, rating, personality
- `games` — id, user_id, pgn, moves[], result, color, analyzed
- `missed_moves` — id, user_id, game_id, fen, user_move, best_move, eval_drop, theme, next_review_at
- `puzzles` — id, user_id (NULL = general pool), fen, solution[], theme, difficulty, source

Blunders auto-generate puzzles via `missed_moves`.

## Environment Variables

All set in `backend/.env`. Supabase is fully configured and live.

| Variable | Status |
|----------|--------|
| `GEMINI_API_KEY` | Set |
| `SUPABASE_URL` | Set (`https://vxexrrwgtmibjnvfmnqu.supabase.co`) |
| `SUPABASE_SERVICE_KEY` | Set (sb_secret_* format) |
| `SUPABASE_JWT_SECRET` | Set (legacy HS256 — kept for reference, not used for verification) |
| `YOUTUBE_API_KEY` | Set |
| `STOCKFISH_PATH` | Set (`./stockfish/stockfish-windows-x86-64-avx2.exe`) |

## Key Design Details

- **Chess library**: `github.com/notnil/chess` handles game state, move validation, FEN parsing, and SAN conversion. `github.com/notnil/chess/uci` wraps the Stockfish process via UCI protocol.
- **Streaming**: WebSocket uses `json.Marshal` + `WriteMessage`; REST endpoints use SSE (`fmt.Fprintf(c.Writer, "data: ...\n\n")`); Gemini uses its iterator streaming API.
- **Personality modes**: "supportive Grandmaster" (default) or "roast comedian" — controlled per-user via `profiles.personality` and `set_personality` WebSocket messages.
- **Move grading thresholds** (in `stockfish.go`): blunder > 1.5 pawns drop, mistake > 0.5, inaccuracy > 0.2.
- **CORS**: all origins accepted (hackathon scope).
- **JWT verification**: `VerifyJWT()` calls Supabase's `/auth/v1/user` endpoint rather than verifying locally. This is intentional — Supabase migrated to ECC P-256 signing which is incompatible with the previous HS256 local check. The API approach works with any current or future signing algorithm.
- **Supabase tables**: all 4 tables are live with RLS enabled. Service key bypasses RLS for all server-side writes. Schema is in `supabase_schema.sql`.
- **Puzzle pool**: 20 general-pool puzzles seeded (themes: checkmate, fork, pin, back rank, skewer, promotion, endgame, combination; difficulty 1–3). New personal puzzles are auto-generated from blunders during games.
