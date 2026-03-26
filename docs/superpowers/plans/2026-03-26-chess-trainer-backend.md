# Chess Trainer Backend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Refactor the Go backend into a grounded AI chess coaching system that eliminates LLM hallucination via a Situation Report pipeline, and adds REST endpoints for chat, game analysis, puzzles, and learning content.

**Architecture:** WebSocket `/ws/game` handles real-time gameplay with JSON messages. REST endpoints under `/api` handle chat (SSE), post-game analysis, personalized puzzles, and opening/endgame learning. A three-stage pipeline (Stockfish → Board Analysis → Situation Report) grounds every Gemini prompt in verified facts.

**Tech Stack:** Go 1.25 · Gin · notnil/chess · Stockfish UCI · Gemini (gemma-3-27b-it) · Supabase (PostgREST + JWT Auth) · YouTube Data API v3 · golang-jwt/jwt/v5

---

### Task 1: Scaffold — Add JWT Dependency + Split main.go

**Files:**
- Modify: `backend/main.go`
- Create: `backend/game.go` (stub)
- Create: `backend/stockfish.go` (stub)
- Create: `backend/board_analysis.go` (stub)
- Create: `backend/situation_report.go` (stub)
- Create: `backend/supabase.go` (stub)
- Create: `backend/chat.go` (stub)
- Create: `backend/analyze.go` (stub)
- Create: `backend/puzzles.go` (stub)
- Create: `backend/openings.go` (stub)

- [ ] **Step 1: Add JWT dependency**

Run in `backend/`:
```bash
go get github.com/golang-jwt/jwt/v5
```
Expected: `go.mod` updated with `github.com/golang-jwt/jwt/v5`

- [ ] **Step 2: Create stub files**

Create `backend/game.go`:
```go
package main

import (
	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
)

func handleChessGame(geminiClient *genai.Client, db *SupabaseClient) gin.HandlerFunc {
	return func(c *gin.Context) {}
}
```

Create `backend/stockfish.go`:
```go
package main

import (
	"github.com/notnil/chess"
	"github.com/notnil/chess/uci"
)

// StockfishResult holds engine output for one position.
type StockfishResult struct {
	Eval     float64
	BestMove string
	PV       []string // up to 5 moves
}

func analyzePosition(eng *uci.Engine, pos *chess.Position) StockfishResult {
	return StockfishResult{}
}
```

Create `backend/board_analysis.go`:
```go
package main

import "github.com/notnil/chess"

// BoardAnalysis holds human-readable facts about a board position.
type BoardAnalysis struct {
	HangingPieces []string
	KingSafety    string
	Material      float64
	Phase         string
}

func analyzeBoard(pos *chess.Position) BoardAnalysis {
	return BoardAnalysis{}
}
```

Create `backend/situation_report.go`:
```go
package main

// SituationReport bundles engine data + board facts for prompt assembly.
type SituationReport struct {
	SF          StockfishResult
	Board       BoardAnalysis
	UserMove    string
	EvalBefore  float64
	Personality string
}

func buildSituationReport(sr SituationReport) string { return "" }
func buildHintPrompt(sf StockfishResult, board BoardAnalysis) string { return "" }
```

Create `backend/supabase.go`:
```go
package main

// SupabaseClient wraps Supabase PostgREST API calls.
type SupabaseClient struct {
	BaseURL    string
	ServiceKey string
}

func newSupabaseClient() *SupabaseClient { return &SupabaseClient{} }
func verifyJWT(token string) (string, error) { return "", nil }
```

Create `backend/chat.go`:
```go
package main

import (
	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
)

func chatHandler(db *SupabaseClient, client *genai.Client) gin.HandlerFunc {
	return func(c *gin.Context) {}
}
```

Create `backend/analyze.go`:
```go
package main

import "github.com/gin-gonic/gin"

func analyzeGameHandler(db *SupabaseClient, stockfishPath string) gin.HandlerFunc {
	return func(c *gin.Context) {}
}
```

Create `backend/puzzles.go`:
```go
package main

import "github.com/gin-gonic/gin"

func getPuzzlesHandler(db *SupabaseClient) gin.HandlerFunc {
	return func(c *gin.Context) {}
}
func completePuzzleHandler(db *SupabaseClient) gin.HandlerFunc {
	return func(c *gin.Context) {}
}
```

Create `backend/openings.go`:
```go
package main

import (
	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
)

func learnHandler(client *genai.Client) gin.HandlerFunc {
	return func(c *gin.Context) {}
}
```

- [ ] **Step 3: Slim down main.go to server setup only**

Replace `backend/main.go` entirely:
```go
package main

import (
	"context"
	"log"
	"os"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/joho/godotenv"
	"google.golang.org/api/option"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env not found, using env vars")
	}

	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Fatal("GEMINI_API_KEY is required")
	}

	ctx := context.Background()
	geminiClient, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		log.Fatal("Gemini client:", err)
	}
	defer geminiClient.Close()

	db := newSupabaseClient()
	stockfishPath := os.Getenv("STOCKFISH_PATH")
	if stockfishPath == "" {
		stockfishPath = "./stockfish/stockfish-windows-x86-64-avx2.exe"
	}

	r := gin.Default()
	r.GET("/ws/game", handleChessGame)

	api := r.Group("/api")
	api.POST("/chat", chatHandler(db, geminiClient))
	api.POST("/analyze", analyzeGameHandler(db, stockfishPath))
	api.GET("/puzzles", getPuzzlesHandler(db))
	api.POST("/puzzles/complete", completePuzzleHandler(db))
	api.GET("/learn", learnHandler(geminiClient))

	log.Println("Chess Trainer starting on :8080")
	if err := r.Run(":8080"); err != nil {
		log.Fatal(err)
	}
}
```

- [ ] **Step 4: Verify it compiles**

Run in `backend/`:
```bash
go build ./...
```
Expected: no errors (stubs return zero values, that's fine)

- [ ] **Step 5: Commit**

```bash
git add backend/
git commit -m "feat: scaffold backend file structure with stubs"
```

---

### Task 2: stockfish.go — PV Extraction + Improved Eval

**Files:**
- Modify: `backend/stockfish.go`
- Create: `backend/stockfish_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/stockfish_test.go`:
```go
package main

import (
	"testing"

	"github.com/notnil/chess"
	"github.com/notnil/chess/uci"
)

func newTestEngine(t *testing.T) *uci.Engine {
	t.Helper()
	eng, err := uci.New("./stockfish/stockfish-windows-x86-64-avx2.exe")
	if err != nil {
		t.Skip("Stockfish binary not available:", err)
	}
	eng.Run(uci.CmdUCI, uci.CmdIsReady)
	return eng
}

func TestAnalyzePosition_StartingPosition(t *testing.T) {
	eng := newTestEngine(t)
	defer eng.Close()

	game := chess.NewGame()
	result := analyzePosition(eng, game.Position())

	if result.BestMove == "" {
		t.Error("expected a best move, got empty string")
	}
	if len(result.PV) == 0 {
		t.Error("expected at least one PV move")
	}
	if result.Eval < -1.0 || result.Eval > 1.0 {
		t.Errorf("expected starting eval near 0, got %.2f", result.Eval)
	}
}

func TestAnalyzePosition_MateInOne(t *testing.T) {
	eng := newTestEngine(t)
	defer eng.Close()

	// Scholar's mate setup — white can play Qxf7#
	fen, err := chess.FEN("r1bqkb1r/pppp1Qpp/2n2n2/4p3/2B1P3/8/PPPP1PPP/RNB1K1NR b KQkq - 0 4")
	if err != nil {
		t.Fatal(err)
	}
	game := chess.NewGame(fen)
	result := analyzePosition(eng, game.Position())

	// Black is in mate, eval should be heavily in white's favour
	if result.Eval < 90 {
		t.Errorf("expected large positive eval for white in mated position, got %.2f", result.Eval)
	}
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && go test -run TestAnalyzePosition -v
```
Expected: FAIL — `analyzePosition` returns empty `StockfishResult`

- [ ] **Step 3: Implement analyzePosition**

Replace `backend/stockfish.go`:
```go
package main

import (
	"github.com/notnil/chess"
	"github.com/notnil/chess/uci"
)

// StockfishResult holds engine output for one position.
type StockfishResult struct {
	Eval     float64
	BestMove string
	PV       []string // up to 5 moves in UCI notation
}

func analyzePosition(eng *uci.Engine, pos *chess.Position) StockfishResult {
	eng.Run(uci.CmdPosition{Position: pos})
	eng.Run(uci.CmdGo{Depth: 15})
	res := eng.SearchResults()

	eval := float64(res.Info.Score.CP) / 100.0
	if res.Info.Score.Mate > 0 {
		eval = 99.0
	} else if res.Info.Score.Mate < 0 {
		eval = -99.0
	}

	bestMove := ""
	if res.BestMove != nil {
		bestMove = res.BestMove.String()
	}

	pv := make([]string, 0, 5)
	for i, m := range res.Info.PV {
		if i >= 5 {
			break
		}
		pv = append(pv, m.String())
	}

	return StockfishResult{Eval: eval, BestMove: bestMove, PV: pv}
}
```

- [ ] **Step 4: Run tests to verify they pass**

```bash
cd backend && go test -run TestAnalyzePosition -v
```
Expected: PASS for both tests

- [ ] **Step 5: Commit**

```bash
git add backend/stockfish.go backend/stockfish_test.go
git commit -m "feat: implement stockfish wrapper with PV extraction"
```

---

### Task 3: board_analysis.go — Attack Detection + Material Balance

**Files:**
- Modify: `backend/board_analysis.go`
- Create: `backend/board_analysis_test.go`

- [ ] **Step 1: Write the failing tests**

Create `backend/board_analysis_test.go`:
```go
package main

import (
	"testing"

	"github.com/notnil/chess"
)

func posFromFEN(t *testing.T, fen string) *chess.Position {
	t.Helper()
	opt, err := chess.FEN(fen)
	if err != nil {
		t.Fatalf("invalid FEN %q: %v", fen, err)
	}
	return chess.NewGame(opt).Position()
}

func TestMaterialBalance_StartingPosition(t *testing.T) {
	pos := posFromFEN(t, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
	balance := materialBalance(pos.Board())
	if balance != 0.0 {
		t.Errorf("expected 0.0 for starting position, got %.1f", balance)
	}
}

func TestMaterialBalance_WhiteAheadByKnight(t *testing.T) {
	// Black is missing a knight (removed from b8)
	pos := posFromFEN(t, "r1bqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
	balance := materialBalance(pos.Board())
	if balance != 3.0 {
		t.Errorf("expected 3.0 (white up a knight), got %.1f", balance)
	}
}

func TestMaterialBalance_BlackAheadByRook(t *testing.T) {
	// White is missing a rook (removed from a1)
	pos := posFromFEN(t, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/1NBQKBNR w Kkq - 0 1")
	balance := materialBalance(pos.Board())
	if balance != -5.0 {
		t.Errorf("expected -5.0 (black up a rook), got %.1f", balance)
	}
}

func TestIsAttackedByPiece_PawnAttack(t *testing.T) {
	pos := posFromFEN(t, "8/8/8/4n3/3P4/8/8/4K3 w - - 0 1")
	board := pos.Board()
	// White pawn on d4 (D=3, Rank4=3) attacks e5 (E=4, Rank5=4)
	d4 := chess.NewSquare(chess.FileD, chess.Rank4)
	e5 := chess.NewSquare(chess.FileE, chess.Rank5)
	if !isAttackedByPiece(board, d4, e5) {
		t.Error("expected white pawn on d4 to attack e5")
	}
}

func TestIsAttackedByPiece_KnightAttack(t *testing.T) {
	pos := posFromFEN(t, "8/8/8/8/3N4/8/8/4K3 w - - 0 1")
	board := pos.Board()
	// White knight on d4 attacks e6, c6, f5, b5, f3, b3, e2, c2
	d4 := chess.NewSquare(chess.FileD, chess.Rank4)
	e6 := chess.NewSquare(chess.FileE, chess.Rank6)
	if !isAttackedByPiece(board, d4, e6) {
		t.Error("expected white knight on d4 to attack e6")
	}
}

func TestIsAttackedByPiece_RookBlockedByPiece(t *testing.T) {
	pos := posFromFEN(t, "8/8/8/8/R2P4/8/8/4K3 w - - 0 1")
	board := pos.Board()
	// White rook on a4, white pawn on d4 — rook cannot attack e4 (pawn blocks)
	a4 := chess.NewSquare(chess.FileA, chess.Rank4)
	e4 := chess.NewSquare(chess.FileE, chess.Rank4)
	if isAttackedByPiece(board, a4, e4) {
		t.Error("rook on a4 should NOT attack e4 when pawn on d4 blocks")
	}
}
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && go test -run "TestMaterial|TestIsAttacked" -v
```
Expected: FAIL — functions not implemented

- [ ] **Step 3: Implement attack helpers + materialBalance**

Replace `backend/board_analysis.go`:
```go
package main

import (
	"fmt"
	"strings"

	"github.com/notnil/chess"
)

// BoardAnalysis holds human-readable facts about a board position.
type BoardAnalysis struct {
	HangingPieces []string
	KingSafety    string
	Material      float64
	Phase         string
}

var pieceValues = map[chess.PieceType]float64{
	chess.Pawn:   1.0,
	chess.Knight: 3.0,
	chess.Bishop: 3.0,
	chess.Rook:   5.0,
	chess.Queen:  9.0,
}

var pieceNames = map[chess.PieceType]string{
	chess.Pawn:   "Pawn",
	chess.Knight: "Knight",
	chess.Bishop: "Bishop",
	chess.Rook:   "Rook",
	chess.Queen:  "Queen",
	chess.King:   "King",
}

func analyzeBoard(pos *chess.Position) BoardAnalysis {
	board := pos.Board()
	return BoardAnalysis{
		HangingPieces: findHangingPieces(board),
		KingSafety:    checkKingSafety(board),
		Material:      materialBalance(board),
		Phase:         gamePhase(board),
	}
}

func materialBalance(board *chess.Board) float64 {
	balance := 0.0
	for sq := chess.A1; sq <= chess.H8; sq++ {
		p := board.Piece(sq)
		if p == chess.NoPiece || p.Type() == chess.King {
			continue
		}
		val := pieceValues[p.Type()]
		if p.Color() == chess.White {
			balance += val
		} else {
			balance -= val
		}
	}
	return balance
}

func absInt(x int) int {
	if x < 0 {
		return -x
	}
	return x
}

func sign(x int) int {
	if x > 0 {
		return 1
	}
	if x < 0 {
		return -1
	}
	return 0
}

// isAttackedByPiece returns true if the piece on `from` attacks square `to`.
func isAttackedByPiece(board *chess.Board, from, to chess.Square) bool {
	p := board.Piece(from)
	if p == chess.NoPiece {
		return false
	}

	fr, ff := int(from.Rank()), int(from.File())
	tr, tf := int(to.Rank()), int(to.File())
	rd, fd := tr-fr, tf-ff
	ar, af := absInt(rd), absInt(fd)

	switch p.Type() {
	case chess.Pawn:
		if p.Color() == chess.White {
			return rd == 1 && af == 1
		}
		return rd == -1 && af == 1
	case chess.Knight:
		return (ar == 2 && af == 1) || (ar == 1 && af == 2)
	case chess.King:
		return ar <= 1 && af <= 1 && ar+af > 0
	case chess.Bishop:
		if ar != af || ar == 0 {
			return false
		}
		return isDiagonalClear(board, from, to)
	case chess.Rook:
		if rd != 0 && fd != 0 {
			return false
		}
		if ar+af == 0 {
			return false
		}
		return isStraightClear(board, from, to)
	case chess.Queen:
		if ar == af && ar > 0 {
			return isDiagonalClear(board, from, to)
		}
		if (rd == 0 || fd == 0) && ar+af > 0 {
			return isStraightClear(board, from, to)
		}
	}
	return false
}

func isDiagonalClear(board *chess.Board, from, to chess.Square) bool {
	rs := sign(int(to.Rank()) - int(from.Rank()))
	fs := sign(int(to.File()) - int(from.File()))
	r, f := int(from.Rank())+rs, int(from.File())+fs
	for r != int(to.Rank()) || f != int(to.File()) {
		sq := chess.NewSquare(chess.File(f), chess.Rank(r))
		if board.Piece(sq) != chess.NoPiece {
			return false
		}
		r += rs
		f += fs
	}
	return true
}

func isStraightClear(board *chess.Board, from, to chess.Square) bool {
	rs := sign(int(to.Rank()) - int(from.Rank()))
	fs := sign(int(to.File()) - int(from.File()))
	r, f := int(from.Rank())+rs, int(from.File())+fs
	for r != int(to.Rank()) || f != int(to.File()) {
		sq := chess.NewSquare(chess.File(f), chess.Rank(r))
		if board.Piece(sq) != chess.NoPiece {
			return false
		}
		r += rs
		f += fs
	}
	return true
}

// squareAttackedBy returns true if any piece of color attacks sq.
func squareAttackedBy(board *chess.Board, sq chess.Square, color chess.Color) bool {
	for s := chess.A1; s <= chess.H8; s++ {
		p := board.Piece(s)
		if p == chess.NoPiece || p.Color() != color {
			continue
		}
		if isAttackedByPiece(board, s, sq) {
			return true
		}
	}
	return false
}

func findHangingPieces(board *chess.Board) []string {
	var result []string
	for sq := chess.A1; sq <= chess.H8; sq++ {
		p := board.Piece(sq)
		if p == chess.NoPiece || p.Type() == chess.King {
			continue
		}
		opp := p.Color().Other()
		if squareAttackedBy(board, sq, opp) && !squareAttackedBy(board, sq, p.Color()) {
			colorName := "White"
			if p.Color() == chess.Black {
				colorName = "Black"
			}
			result = append(result, fmt.Sprintf("%s %s on %s is undefended", colorName, pieceNames[p.Type()], sq.String()))
		}
	}
	return result
}

func checkKingSafety(board *chess.Board) string {
	var issues []string
	for _, color := range []chess.Color{chess.White, chess.Black} {
		kingSq := chess.Square(-1)
		for sq := chess.A1; sq <= chess.H8; sq++ {
			p := board.Piece(sq)
			if p.Type() == chess.King && p.Color() == color {
				kingSq = sq
				break
			}
		}
		if kingSq < 0 {
			continue
		}
		kFile := kingSq.File()
		hasPawn := false
		for r := chess.Rank1; r <= chess.Rank8; r++ {
			p := board.Piece(chess.NewSquare(kFile, r))
			if p.Type() == chess.Pawn {
				hasPawn = true
				break
			}
		}
		if !hasPawn {
			colorName := "White"
			if color == chess.Black {
				colorName = "Black"
			}
			issues = append(issues, fmt.Sprintf("%s King is exposed on open %s-file", colorName, kFile.String()))
		}
	}
	if len(issues) == 0 {
		return "Both kings appear safe"
	}
	return strings.Join(issues, "; ")
}

func gamePhase(board *chess.Board) string {
	count := 0
	for sq := chess.A1; sq <= chess.H8; sq++ {
		p := board.Piece(sq)
		if p == chess.NoPiece {
			continue
		}
		switch p.Type() {
		case chess.Knight, chess.Bishop, chess.Rook, chess.Queen:
			count++
		}
	}
	if count >= 12 {
		return "opening"
	} else if count >= 6 {
		return "middlegame"
	}
	return "endgame"
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test -run "TestMaterial|TestIsAttacked" -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/board_analysis.go backend/board_analysis_test.go
git commit -m "feat: implement board analysis with attack detection and material balance"
```

---

### Task 4: board_analysis.go — Hanging Pieces + King Safety Tests

**Files:**
- Modify: `backend/board_analysis_test.go`

- [ ] **Step 1: Add hanging piece and king safety tests**

Append to `backend/board_analysis_test.go`:
```go
func TestFindHangingPieces_HangingKnight(t *testing.T) {
	// Black knight on e5, attacked by white pawn on d4, no defenders
	pos := posFromFEN(t, "8/8/8/4n3/3P4/8/8/4K3 w - - 0 1")
	hanging := findHangingPieces(pos.Board())
	if len(hanging) == 0 {
		t.Fatal("expected at least one hanging piece")
	}
	found := false
	for _, h := range hanging {
		if strings.Contains(h, "Black") && strings.Contains(h, "Knight") {
			found = true
		}
	}
	if !found {
		t.Errorf("expected Black Knight to be listed as hanging, got: %v", hanging)
	}
}

func TestFindHangingPieces_StartingPosition(t *testing.T) {
	// In the starting position no pieces are hanging
	pos := posFromFEN(t, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
	hanging := findHangingPieces(pos.Board())
	if len(hanging) != 0 {
		t.Errorf("expected no hanging pieces in starting position, got: %v", hanging)
	}
}

func TestCheckKingSafety_ExposedKing(t *testing.T) {
	// Kings on open files (no pawns on e-file or e-file)
	pos := posFromFEN(t, "8/pppppppp/8/8/8/8/PPPPPPPP/4K3 w - - 0 1")
	safety := checkKingSafety(pos.Board())
	if !strings.Contains(safety, "White King") {
		t.Errorf("expected white king safety warning, got: %q", safety)
	}
}

func TestCheckKingSafety_SafeKings(t *testing.T) {
	pos := posFromFEN(t, "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")
	safety := checkKingSafety(pos.Board())
	if safety != "Both kings appear safe" {
		t.Errorf("expected safe kings in starting position, got: %q", safety)
	}
}
```

Add `"strings"` import to `board_analysis_test.go` (top of file):
```go
import (
	"strings"
	"testing"
	"github.com/notnil/chess"
)
```

- [ ] **Step 2: Run all board analysis tests**

```bash
cd backend && go test -run "TestFind|TestCheck|TestMaterial|TestIsAttacked" -v
```
Expected: all PASS

- [ ] **Step 3: Commit**

```bash
git add backend/board_analysis_test.go
git commit -m "test: add hanging pieces and king safety tests"
```

---

### Task 5: situation_report.go — Prompt Assembly

**Files:**
- Modify: `backend/situation_report.go`
- Create: `backend/situation_report_test.go`

- [ ] **Step 1: Write the failing tests**

Create `backend/situation_report_test.go`:
```go
package main

import (
	"strings"
	"testing"
)

func TestBuildSituationReport_ContainsVerifiedFacts(t *testing.T) {
	sr := SituationReport{
		SF: StockfishResult{
			Eval:     2.1,
			BestMove: "Rd1",
			PV:       []string{"Rd1", "Qe7", "Rxd8"},
		},
		Board: BoardAnalysis{
			HangingPieces: []string{"Black Knight on f6 is undefended"},
			KingSafety:    "Black King is exposed on open g-file",
			Material:      1.0,
			Phase:         "middlegame",
		},
		UserMove:    "Nf3",
		EvalBefore:  0.3,
		Personality: "mentor",
	}

	report := buildSituationReport(sr)

	mustContain := []string{
		"VERIFIED FACTS",
		"Rd1",
		"Rd1 Qe7 Rxd8",
		"Black Knight on f6",
		"Nf3",
		"mentor",
	}
	for _, s := range mustContain {
		if !strings.Contains(report, s) {
			t.Errorf("report missing %q\nFull report:\n%s", s, report)
		}
	}
}

func TestBuildSituationReport_BlunderLabelled(t *testing.T) {
	sr := SituationReport{
		SF:         StockfishResult{Eval: -1.0, BestMove: "Qd5"},
		Board:      BoardAnalysis{KingSafety: "Both kings appear safe"},
		UserMove:   "Bd4",
		EvalBefore: 1.0, // eval drop of 2.0 → blunder
		Personality: "roast",
	}
	report := buildSituationReport(sr)
	if !strings.Contains(report, "BLUNDER") {
		t.Errorf("expected BLUNDER label in report, got:\n%s", report)
	}
	if !strings.Contains(report, "roast") {
		t.Errorf("expected roast personality in report, got:\n%s", report)
	}
}

func TestBuildHintPrompt_ContainsBestMove(t *testing.T) {
	sf := StockfishResult{Eval: 0.5, BestMove: "d2d4", PV: []string{"d2d4", "d7d5"}}
	board := BoardAnalysis{KingSafety: "Both kings appear safe"}
	prompt := buildHintPrompt(sf, board)
	if !strings.Contains(prompt, "d2d4") {
		t.Errorf("hint prompt missing best move d2d4, got:\n%s", prompt)
	}
}
```

- [ ] **Step 2: Run to verify they fail**

```bash
cd backend && go test -run "TestBuildSituation|TestBuildHint" -v
```
Expected: FAIL — functions return empty strings

- [ ] **Step 3: Implement situation_report.go**

Replace `backend/situation_report.go`:
```go
package main

import (
	"fmt"
	"strings"
)

// SituationReport bundles engine data + board facts for prompt assembly.
type SituationReport struct {
	SF          StockfishResult
	Board       BoardAnalysis
	UserMove    string
	EvalBefore  float64
	Personality string
}

func buildSituationReport(sr SituationReport) string {
	evalDrop := sr.EvalBefore - sr.SF.Eval

	evalCtx := "position is roughly equal"
	switch {
	case sr.SF.Eval >= 1.0:
		evalCtx = "White is winning"
	case sr.SF.Eval <= -1.0:
		evalCtx = "Black is winning"
	}

	pvStr := strings.Join(sr.SF.PV, " ")
	if pvStr == "" {
		pvStr = sr.SF.BestMove
	}

	var facts []string
	for _, h := range sr.Board.HangingPieces {
		facts = append(facts, "- "+h)
	}
	facts = append(facts, "- "+sr.Board.KingSafety)

	matStr := "Material is balanced"
	switch {
	case sr.Board.Material > 0:
		matStr = fmt.Sprintf("White leads by %.1f points", sr.Board.Material)
	case sr.Board.Material < 0:
		matStr = fmt.Sprintf("Black leads by %.1f points", -sr.Board.Material)
	}
	facts = append(facts, "- "+matStr)
	facts = append(facts, fmt.Sprintf("- Game phase: %s", sr.Board.Phase))

	quality := "normal move"
	switch {
	case evalDrop > 1.5:
		quality = "BLUNDER"
	case evalDrop > 0.5:
		quality = "MISTAKE"
	case evalDrop < -0.3:
		quality = "EXCELLENT move"
	}

	personality := "blunt Grandmaster"
	switch sr.Personality {
	case "roast":
		personality = "savage roast comedian who mocks blunders but stays factually accurate"
	case "mentor":
		personality = "warm and encouraging mentor"
	}

	return fmt.Sprintf(`### VERIFIED FACTS (never contradict these) ###
Eval: %.1f (%s) | Phase: %s
Best Move: %s
Top Line: %s

Board Facts:
%s

User played: %s [%s, eval drop: %.1f]

### TASK ###
You are a %s chess coach. Using ONLY the facts above, explain in 2-3 sentences why %s is the best move. Reference specific pieces or squares. Do NOT invent moves not listed above.`,
		sr.SF.Eval, evalCtx, sr.Board.Phase,
		sr.SF.BestMove,
		pvStr,
		strings.Join(facts, "\n"),
		sr.UserMove, quality, evalDrop,
		personality,
		sr.SF.BestMove,
	)
}

func buildHintPrompt(sf StockfishResult, board BoardAnalysis) string {
	pvStr := strings.Join(sf.PV, " ")
	return fmt.Sprintf(`### VERIFIED FACTS ###
Best Move: %s | Eval: %.1f
Top Line: %s
King Safety: %s

Give ONLY the best move (%s) and one tactical reason in under 10 words. No spoilers beyond the first move.`,
		sf.BestMove, sf.Eval, pvStr,
		board.KingSafety,
		sf.BestMove,
	)
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test -run "TestBuildSituation|TestBuildHint" -v
```
Expected: all PASS

- [ ] **Step 5: Commit**

```bash
git add backend/situation_report.go backend/situation_report_test.go
git commit -m "feat: implement situation report prompt assembly"
```

---

### Task 6: game.go — WebSocket JSON Protocol

**Files:**
- Modify: `backend/game.go`

- [ ] **Step 1: Implement game.go**

Replace `backend/game.go`:
```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/gorilla/websocket"
	"github.com/notnil/chess"
	"github.com/notnil/chess/uci"
	"google.golang.org/api/iterator"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type clientMsg struct {
	Type        string `json:"type"`        // "new_game" | "move" | "hint" | "set_personality"
	Move        string `json:"move"`        // UCI notation e.g. "e2e4"
	Personality string `json:"mode"`        // "mentor" | "roast"
	Color       string `json:"color"`       // "white" | "black" (for new_game)
}

type serverMsg struct {
	Type      string  `json:"type"`
	FEN       string  `json:"fen,omitempty"`
	AIMove    string  `json:"ai_move,omitempty"`
	Eval      float64 `json:"eval,omitempty"`
	Text      string  `json:"text,omitempty"`
	IsBlunder bool    `json:"is_blunder,omitempty"`
	Move      string  `json:"move,omitempty"`
	Result    string  `json:"result,omitempty"`
	Message   string  `json:"message,omitempty"`
}

func sendJSON(ws *websocket.Conn, msg serverMsg) {
	data, err := json.Marshal(msg)
	if err != nil {
		log.Println("sendJSON marshal error:", err)
		return
	}
	ws.WriteMessage(websocket.TextMessage, data)
}

func handleChessGame(geminiClient *genai.Client, db *SupabaseClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		token := c.Query("token")
		if token == "" {
			token = extractToken(c)
		}
		userID, _ := verifyJWT(token) // empty string = guest mode

		ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
		if err != nil {
			return
		}
		defer ws.Close()

		stockfishPath := os.Getenv("STOCKFISH_PATH")
		if stockfishPath == "" {
			stockfishPath = "./stockfish/stockfish-windows-x86-64-avx2.exe"
		}
		eng, err := uci.New(stockfishPath)
		if err != nil {
			sendJSON(ws, serverMsg{Type: "error", Message: "Engine unavailable"})
			return
		}
		defer eng.Close()
		eng.Run(uci.CmdUCI, uci.CmdIsReady)

		game := chess.NewGame()
		personality := "mentor"
		var moves []string

		for {
			_, raw, err := ws.ReadMessage()
			if err != nil {
				break
			}

			var msg clientMsg
			if err := json.Unmarshal(raw, &msg); err != nil {
				sendJSON(ws, serverMsg{Type: "error", Message: "Invalid JSON"})
				continue
			}

			switch msg.Type {
			case "new_game":
				game = chess.NewGame()
				moves = nil
				sendJSON(ws, serverMsg{Type: "board_update", FEN: game.FEN(), Eval: 0})

			case "set_personality":
				personality = msg.Personality

			case "hint":
				sf := analyzePosition(eng, game.Position())
				board := analyzeBoard(game.Position())
				prompt := buildHintPrompt(sf, board)
				streamCoach(c.Request.Context(), geminiClient, ws, prompt, "hint_chunk", false)
				sendJSON(ws, serverMsg{Type: "hint", Move: sf.BestMove, Eval: sf.Eval})

			case "move":
				var userMove *chess.Move
				for _, m := range game.ValidMoves() {
					if m.String() == msg.Move {
						userMove = m
						break
					}
				}
				if userMove == nil {
					sendJSON(ws, serverMsg{Type: "error", Message: "Invalid move: " + msg.Move})
					continue
				}

				sfBefore := analyzePosition(eng, game.Position())
				game.Move(userMove)
				moves = append(moves, msg.Move)

				if game.Outcome() != chess.NoOutcome {
					saveGameRecord(db, userID, game, moves)
					sendJSON(ws, serverMsg{Type: "game_over", Result: game.Outcome().String(), FEN: game.FEN()})
					return
				}

				sfAfter := analyzePosition(eng, game.Position())
				boardData := analyzeBoard(game.Position())
				evalDrop := sfBefore.Eval - sfAfter.Eval
				isBlunder := evalDrop > 1.5

				if isBlunder && userID != "" {
					db.insert("missed_moves", map[string]interface{}{
						"user_id":   userID,
						"fen":       game.FEN(),
						"user_move": msg.Move,
						"best_move": sfBefore.BestMove,
						"eval_drop": evalDrop,
						"theme":     boardData.Phase,
					})
				}

				// Engine plays its response
				aiMoveStr := ""
				for _, m := range game.ValidMoves() {
					if m.String() == sfAfter.BestMove {
						game.Move(m)
						aiMoveStr = m.String()
						moves = append(moves, aiMoveStr)
						break
					}
				}

				sendJSON(ws, serverMsg{
					Type:   "board_update",
					FEN:    game.FEN(),
					AIMove: aiMoveStr,
					Eval:   sfAfter.Eval,
				})

				prompt := buildSituationReport(SituationReport{
					SF:          sfAfter,
					Board:       boardData,
					UserMove:    msg.Move,
					EvalBefore:  sfBefore.Eval,
					Personality: personality,
				})
				streamCoach(c.Request.Context(), geminiClient, ws, prompt, "coach_chunk", isBlunder)
				sendJSON(ws, serverMsg{Type: "coach_done"})
			}
		}
	}
}

func streamCoach(ctx context.Context, client *genai.Client, ws *websocket.Conn, prompt, msgType string, isBlunder bool) {
	model := client.GenerativeModel("gemma-3-27b-it")
	model.SetTemperature(0.1)

	streamCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	iter := model.GenerateContentStream(streamCtx, genai.Text(prompt))
	for {
		resp, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			break
		}
		if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
			for _, part := range resp.Candidates[0].Content.Parts {
				sendJSON(ws, serverMsg{
					Type:      msgType,
					Text:      fmt.Sprintf("%v", part),
					IsBlunder: isBlunder,
				})
			}
		}
	}
}

func saveGameRecord(db *SupabaseClient, userID string, game *chess.Game, moves []string) {
	if userID == "" || db.BaseURL == "" {
		return
	}
	db.insert("games", map[string]interface{}{
		"user_id": userID,
		"pgn":     game.String(),
		"moves":   moves,
		"result":  game.Outcome().String(),
	})
}
```

- [ ] **Step 2: Verify it compiles**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add backend/game.go
git commit -m "feat: refactor WebSocket handler to JSON protocol with Situation Report"
```

---

### Task 7: supabase.go — JWT Verification + DB Helpers

**Files:**
- Modify: `backend/supabase.go`
- Create: `backend/supabase_test.go`

- [ ] **Step 1: Write the failing test**

Create `backend/supabase_test.go`:
```go
package main

import (
	"testing"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func TestVerifyJWT_ValidToken(t *testing.T) {
	secret := "test_secret_minimum_32_chars_ok!!"
	t.Setenv("SUPABASE_JWT_SECRET", secret)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user-abc-123",
		"exp": float64(time.Now().Add(time.Hour).Unix()),
	})
	tokenStr, err := token.SignedString([]byte(secret))
	if err != nil {
		t.Fatal("failed to sign token:", err)
	}

	userID, err := verifyJWT(tokenStr)
	if err != nil {
		t.Fatalf("expected no error, got: %v", err)
	}
	if userID != "user-abc-123" {
		t.Errorf("expected user-abc-123, got: %s", userID)
	}
}

func TestVerifyJWT_ExpiredToken(t *testing.T) {
	secret := "test_secret_minimum_32_chars_ok!!"
	t.Setenv("SUPABASE_JWT_SECRET", secret)

	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user-xyz",
		"exp": float64(time.Now().Add(-time.Hour).Unix()), // expired
	})
	tokenStr, _ := token.SignedString([]byte(secret))

	_, err := verifyJWT(tokenStr)
	if err == nil {
		t.Error("expected error for expired token, got nil")
	}
}

func TestVerifyJWT_WrongSecret(t *testing.T) {
	t.Setenv("SUPABASE_JWT_SECRET", "correct_secret_minimum_32_chars!!")
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, jwt.MapClaims{
		"sub": "user-xyz",
		"exp": float64(time.Now().Add(time.Hour).Unix()),
	})
	tokenStr, _ := token.SignedString([]byte("wrong_secret_minimum_32_chars!!!"))

	_, err := verifyJWT(tokenStr)
	if err == nil {
		t.Error("expected error for wrong secret, got nil")
	}
}
```

- [ ] **Step 2: Run to verify it fails**

```bash
cd backend && go test -run "TestVerifyJWT" -v
```
Expected: FAIL

- [ ] **Step 3: Implement supabase.go**

Replace `backend/supabase.go`:
```go
package main

import (
	"bytes"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

// SupabaseClient wraps Supabase PostgREST API calls.
type SupabaseClient struct {
	BaseURL    string
	ServiceKey string
}

func newSupabaseClient() *SupabaseClient {
	return &SupabaseClient{
		BaseURL:    os.Getenv("SUPABASE_URL"),
		ServiceKey: os.Getenv("SUPABASE_SERVICE_KEY"),
	}
}

func (s *SupabaseClient) insert(table string, data interface{}) error {
	if s.BaseURL == "" {
		return nil // no-op in dev without Supabase configured
	}
	body, err := json.Marshal(data)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("POST", s.BaseURL+"/rest/v1/"+table, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", s.ServiceKey)
	req.Header.Set("Authorization", "Bearer "+s.ServiceKey)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Prefer", "return=minimal")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("supabase insert error: %d", resp.StatusCode)
	}
	return nil
}

func (s *SupabaseClient) query(table, filter string, result interface{}) error {
	if s.BaseURL == "" {
		return nil
	}
	req, err := http.NewRequest("GET", s.BaseURL+"/rest/v1/"+table+"?"+filter, nil)
	if err != nil {
		return err
	}
	req.Header.Set("apikey", s.ServiceKey)
	req.Header.Set("Authorization", "Bearer "+s.ServiceKey)
	req.Header.Set("Accept", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return json.NewDecoder(resp.Body).Decode(result)
}

func (s *SupabaseClient) update(table, filter string, data interface{}) error {
	if s.BaseURL == "" {
		return nil
	}
	body, err := json.Marshal(data)
	if err != nil {
		return err
	}
	req, err := http.NewRequest("PATCH", s.BaseURL+"/rest/v1/"+table+"?"+filter, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("apikey", s.ServiceKey)
	req.Header.Set("Authorization", "Bearer "+s.ServiceKey)
	req.Header.Set("Content-Type", "application/json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// verifyJWT validates a Supabase JWT and returns the user ID (sub claim).
func verifyJWT(tokenStr string) (string, error) {
	secret := os.Getenv("SUPABASE_JWT_SECRET")
	if secret == "" {
		return "", fmt.Errorf("SUPABASE_JWT_SECRET not set")
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected signing method: %v", t.Header["alg"])
		}
		return []byte(secret), nil
	})
	if err != nil {
		return "", err
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok || !token.Valid {
		return "", fmt.Errorf("invalid token claims")
	}
	sub, ok := claims["sub"].(string)
	if !ok || sub == "" {
		return "", fmt.Errorf("missing sub claim")
	}
	return sub, nil
}

// extractToken pulls the Bearer token from the Authorization header.
func extractToken(c *gin.Context) string {
	auth := c.GetHeader("Authorization")
	if strings.HasPrefix(auth, "Bearer ") {
		return strings.TrimPrefix(auth, "Bearer ")
	}
	return ""
}
```

- [ ] **Step 4: Run tests**

```bash
cd backend && go test -run "TestVerifyJWT" -v
```
Expected: all PASS

- [ ] **Step 5: Build check**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 6: Commit**

```bash
git add backend/supabase.go backend/supabase_test.go
git commit -m "feat: implement Supabase client with JWT verification"
```

---

### Task 8: chat.go — POST /api/chat with SSE Streaming

**Files:**
- Modify: `backend/chat.go`

- [ ] **Step 1: Implement chat.go**

Replace `backend/chat.go`:
```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/iterator"
)

func chatHandler(db *SupabaseClient, client *genai.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := verifyJWT(extractToken(c))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		var req struct {
			Message string `json:"message" binding:"required"`
			GameID  string `json:"game_id"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		gameContext := ""
		if req.GameID != "" {
			var games []struct {
				PGN string `json:"pgn"`
			}
			if err := db.query("games", "id=eq."+req.GameID+"&user_id=eq."+userID+"&select=pgn", &games); err == nil && len(games) > 0 {
				gameContext = "\n\nGame context (PGN):\n" + games[0].PGN
			}
		}

		prompt := fmt.Sprintf("You are a helpful chess coach. Answer concisely and accurately.%s\n\nQuestion: %s", gameContext, req.Message)

		model := client.GenerativeModel("gemma-3-27b-it")
		model.SetTemperature(0.3)

		c.Header("Content-Type", "text/event-stream")
		c.Header("Cache-Control", "no-cache")
		c.Header("Connection", "keep-alive")
		c.Header("Access-Control-Allow-Origin", "*")

		ctx, cancel := context.WithTimeout(c.Request.Context(), 30*time.Second)
		defer cancel()

		iter := model.GenerateContentStream(ctx, genai.Text(prompt))
		c.Stream(func(w io.Writer) bool {
			resp, err := iter.Next()
			if err == iterator.Done {
				fmt.Fprintf(w, "data: [DONE]\n\n")
				return false
			}
			if err != nil {
				return false
			}
			if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
				for _, part := range resp.Candidates[0].Content.Parts {
					chunk, _ := json.Marshal(map[string]string{"chunk": fmt.Sprintf("%v", part)})
					fmt.Fprintf(w, "data: %s\n\n", chunk)
				}
			}
			return true
		})
	}
}
```

- [ ] **Step 2: Build check**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/chat.go
git commit -m "feat: implement POST /api/chat with SSE streaming"
```

---

### Task 9: analyze.go — POST /api/analyze

**Files:**
- Modify: `backend/analyze.go`

- [ ] **Step 1: Implement analyze.go**

Replace `backend/analyze.go`:
```go
package main

import (
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/notnil/chess"
	"github.com/notnil/chess/uci"
)

type moveAnalysis struct {
	Move    string  `json:"move"`
	Eval    float64 `json:"eval"`
	Grade   string  `json:"grade"`
	Comment string  `json:"comment"`
}

func analyzeGameHandler(db *SupabaseClient, stockfishPath string) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := verifyJWT(extractToken(c))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		var req struct {
			GameID string `json:"game_id" binding:"required"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		var games []struct {
			PGN string `json:"pgn"`
		}
		if err := db.query("games", "id=eq."+req.GameID+"&user_id=eq."+userID+"&select=pgn", &games); err != nil || len(games) == 0 {
			c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
			return
		}

		pgn, err := chess.PGN(strings.NewReader(games[0].PGN))
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse game PGN"})
			return
		}
		game := chess.NewGame(pgn)

		eng, err := uci.New(stockfishPath)
		if err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "engine unavailable"})
			return
		}
		defer eng.Close()
		eng.Run(uci.CmdUCI, uci.CmdIsReady)

		var analyses []moveAnalysis
		var weakPhases []string
		blunders, mistakes := 0, 0

		replay := chess.NewGame()
		for _, move := range game.Moves() {
			sfBefore := analyzePosition(eng, replay.Position())
			replay.Move(move)
			sfAfter := analyzePosition(eng, replay.Position())

			evalDrop := sfBefore.Eval - sfAfter.Eval
			grade := "good"
			comment := "Solid move."

			switch {
			case evalDrop > 1.5:
				grade = "blunder"
				comment = fmt.Sprintf("Blunder! Best was %s (eval dropped %.1f).", sfBefore.BestMove, evalDrop)
				blunders++
			case evalDrop > 0.5:
				grade = "mistake"
				comment = fmt.Sprintf("Mistake. Consider %s instead.", sfBefore.BestMove)
				mistakes++
			case evalDrop > 0.2:
				grade = "inaccuracy"
				comment = "Slight inaccuracy."
			}

			analyses = append(analyses, moveAnalysis{
				Move:    move.String(),
				Eval:    sfAfter.Eval,
				Grade:   grade,
				Comment: comment,
			})
		}

		if blunders+mistakes >= 3 {
			board := game.Position().Board()
			weakPhases = append(weakPhases, gamePhase(board))
		}

		summary := fmt.Sprintf("Game complete. %d blunder(s), %d mistake(s).", blunders, mistakes)

		db.update("games", "id=eq."+req.GameID, map[string]interface{}{"analyzed": true})

		c.JSON(http.StatusOK, gin.H{
			"moves":      analyses,
			"summary":    summary,
			"weak_areas": weakPhases,
		})
	}
}
```

- [ ] **Step 2: Build check**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/analyze.go
git commit -m "feat: implement POST /api/analyze for post-game analysis"
```

---

### Task 10: puzzles.go — GET /api/puzzles + POST /api/puzzles/complete

**Files:**
- Modify: `backend/puzzles.go`

- [ ] **Step 1: Implement puzzles.go**

Replace `backend/puzzles.go`:
```go
package main

import (
	"fmt"
	"net/http"
	"time"

	"github.com/gin-gonic/gin"
)

type puzzle struct {
	ID         string   `json:"id"`
	FEN        string   `json:"fen"`
	Solution   []string `json:"solution"`
	Theme      string   `json:"theme"`
	Difficulty int      `json:"difficulty"`
}

func getPuzzlesHandler(db *SupabaseClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := verifyJWT(extractToken(c))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		theme := c.Query("theme")
		limit := c.DefaultQuery("limit", "5")

		filter := fmt.Sprintf("user_id=eq.%s&order=next_review_at.asc&limit=%s", userID, limit)
		if theme != "" {
			filter += "&theme=eq." + theme
		}

		var puzzles []puzzle
		db.query("puzzles", filter, &puzzles)

		// Fill remainder from general pool if under limit
		if len(puzzles) < 5 {
			needed := 5 - len(puzzles)
			var general []puzzle
			genFilter := fmt.Sprintf("user_id=is.null&limit=%d", needed)
			if theme != "" {
				genFilter += "&theme=eq." + theme
			}
			db.query("puzzles", genFilter, &general)
			puzzles = append(puzzles, general...)
		}

		if puzzles == nil {
			puzzles = []puzzle{}
		}
		c.JSON(http.StatusOK, puzzles)
	}
}

func completePuzzleHandler(db *SupabaseClient) gin.HandlerFunc {
	return func(c *gin.Context) {
		userID, err := verifyJWT(extractToken(c))
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}

		var req struct {
			PuzzleID    string `json:"puzzle_id" binding:"required"`
			Solved      bool   `json:"solved"`
			TimeTakenMs int    `json:"time_taken_ms"`
		}
		if err := c.ShouldBindJSON(&req); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}

		// Simple spaced repetition: solved → review in 3 days, failed → 1 day
		nextReview := time.Now().Add(24 * time.Hour)
		if req.Solved {
			nextReview = time.Now().Add(3 * 24 * time.Hour)
		}

		db.update(
			"puzzles",
			fmt.Sprintf("id=eq.%s&user_id=eq.%s", req.PuzzleID, userID),
			map[string]interface{}{"next_review_at": nextReview.Format(time.RFC3339)},
		)

		c.JSON(http.StatusOK, gin.H{"ok": true})
	}
}
```

- [ ] **Step 2: Build check**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/puzzles.go
git commit -m "feat: implement puzzle endpoints with spaced repetition"
```

---

### Task 11: openings.go — GET /api/learn + YouTube Search

**Files:**
- Modify: `backend/openings.go`

- [ ] **Step 1: Implement openings.go**

Replace `backend/openings.go`:
```go
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
)

type youTubeResult struct {
	Title   string `json:"title"`
	URL     string `json:"url"`
	Channel string `json:"channel"`
}

type learnResponse struct {
	Topic    string         `json:"topic"`
	Summary  string         `json:"summary"`
	KeyIdeas []string       `json:"key_ideas"`
	YouTube  *youTubeResult `json:"youtube,omitempty"`
}

func learnHandler(client *genai.Client) gin.HandlerFunc {
	return func(c *gin.Context) {
		topic := c.Query("topic")
		learnType := c.DefaultQuery("type", "opening")

		if topic == "" {
			c.JSON(http.StatusBadRequest, gin.H{"error": "topic is required"})
			return
		}

		summary, keyIdeas := getAISummary(client, topic, learnType, c.Request.Context())
		yt, _ := searchYouTube(topic + " " + learnType)

		resp := learnResponse{
			Topic:    topic,
			Summary:  summary,
			KeyIdeas: keyIdeas,
		}
		if yt.URL != "" {
			resp.YouTube = &yt
		}

		c.JSON(http.StatusOK, resp)
	}
}

func getAISummary(client *genai.Client, topic, learnType string, ctx context.Context) (string, []string) {
	prompt := fmt.Sprintf(`You are a chess teacher. Explain the chess %s "%s" in under 80 words.
Return ONLY valid JSON (no markdown fences) with these exact keys:
{"summary": "...", "key_ideas": ["...", "...", "..."]}`, learnType, topic)

	model := client.GenerativeModel("gemma-3-27b-it")
	model.SetTemperature(0.2)

	reqCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	resp, err := model.GenerateContent(reqCtx, genai.Text(prompt))
	if err != nil || len(resp.Candidates) == 0 {
		return fmt.Sprintf("The %s %s is a well-known chess strategy.", topic, learnType), nil
	}

	raw := fmt.Sprintf("%v", resp.Candidates[0].Content.Parts[0])
	raw = strings.TrimPrefix(raw, "```json")
	raw = strings.TrimPrefix(raw, "```")
	raw = strings.TrimSuffix(raw, "```")
	raw = strings.TrimSpace(raw)

	var parsed struct {
		Summary  string   `json:"summary"`
		KeyIdeas []string `json:"key_ideas"`
	}
	if err := json.Unmarshal([]byte(raw), &parsed); err != nil {
		return raw, nil // return raw text if JSON parse fails
	}
	return parsed.Summary, parsed.KeyIdeas
}

func searchYouTube(query string) (youTubeResult, error) {
	apiKey := os.Getenv("YOUTUBE_API_KEY")
	if apiKey == "" {
		return youTubeResult{}, fmt.Errorf("YOUTUBE_API_KEY not set")
	}

	escaped := url.QueryEscape(query + " chess tutorial")
	endpoint := "https://www.googleapis.com/youtube/v3/search?part=snippet&type=video&maxResults=1&q=" + escaped + "&key=" + apiKey

	resp, err := http.Get(endpoint) //nolint:noctx
	if err != nil {
		return youTubeResult{}, err
	}
	defer resp.Body.Close()

	var result struct {
		Items []struct {
			ID struct {
				VideoID string `json:"videoId"`
			} `json:"id"`
			Snippet struct {
				Title        string `json:"title"`
				ChannelTitle string `json:"channelTitle"`
			} `json:"snippet"`
		} `json:"items"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return youTubeResult{}, err
	}
	if len(result.Items) == 0 {
		return youTubeResult{}, fmt.Errorf("no videos found")
	}

	item := result.Items[0]
	return youTubeResult{
		Title:   item.Snippet.Title,
		URL:     "https://youtube.com/watch?v=" + item.ID.VideoID,
		Channel: item.Snippet.ChannelTitle,
	}, nil
}
```

- [ ] **Step 2: Build check**

```bash
cd backend && go build ./...
```
Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add backend/openings.go
git commit -m "feat: implement GET /api/learn with Gemini summary and YouTube search"
```

---

### Task 12: Final Wiring + .env Setup

**Files:**
- Modify: `backend/main.go`
- Create: `backend/.env.example`

- [ ] **Step 1: Create .env.example**

Create `backend/.env.example`:
```
GEMINI_API_KEY=your_gemini_api_key_here
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_KEY=your_service_role_key_here
SUPABASE_JWT_SECRET=your_jwt_secret_here
YOUTUBE_API_KEY=your_youtube_data_api_v3_key_here
STOCKFISH_PATH=./stockfish/stockfish-windows-x86-64-avx2.exe
```

- [ ] **Step 2: Add .env to .gitignore**

Check `backend/.gitignore` exists. If not, create it with:
```
.env
*.exe
```
If it exists, add `.env` if not already present.

- [ ] **Step 3: Full build + test run**

```bash
cd backend && go build ./... && go test ./... -v
```
Expected:
- `go build` exits 0
- All unit tests PASS (Stockfish tests skip if binary not in path)

- [ ] **Step 4: Smoke test the server**

Copy `.env.example` to `.env`, fill in real keys, then:
```bash
cd backend && go run .
```
Expected output:
```
Chess Trainer starting on :8080
```

Test the WebSocket with `wscat` or similar:
```bash
wscat -c "ws://localhost:8080/ws/game"
# send: {"type":"new_game"}
# expect: {"type":"board_update","fen":"rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1","eval":0}
```

Test REST:
```bash
curl -X GET "http://localhost:8080/api/learn?topic=sicilian+defense&type=opening" \
  -H "Authorization: Bearer YOUR_JWT"
```
Expected: JSON with `topic`, `summary`, `key_ideas`, `youtube` fields

- [ ] **Step 5: Final commit**

```bash
git add backend/main.go backend/.env.example backend/.gitignore
git commit -m "feat: complete chess trainer backend with all endpoints wired"
```

---

## Environment Variables Required

| Variable | Where to get it |
|---|---|
| `GEMINI_API_KEY` | Google AI Studio |
| `SUPABASE_URL` | Supabase project Settings → API |
| `SUPABASE_SERVICE_KEY` | Supabase project Settings → API → service_role key |
| `SUPABASE_JWT_SECRET` | Supabase project Settings → API → JWT Secret |
| `YOUTUBE_API_KEY` | Google Cloud Console → YouTube Data API v3 |
| `STOCKFISH_PATH` | Path to Stockfish binary (already in repo) |

## Supabase Setup (run once in Supabase SQL editor)

```sql
CREATE TABLE profiles (
  user_id     UUID PRIMARY KEY REFERENCES auth.users(id),
  username    TEXT UNIQUE NOT NULL,
  rating      INT DEFAULT 800,
  personality TEXT DEFAULT 'mentor',
  created_at  TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE games (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id    UUID REFERENCES auth.users(id),
  pgn        TEXT,
  moves      TEXT[],
  result     TEXT,
  color      TEXT,
  analyzed   BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE missed_moves (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id),
  fen            TEXT NOT NULL,
  user_move      TEXT NOT NULL,
  best_move      TEXT NOT NULL,
  eval_drop      FLOAT NOT NULL,
  theme          TEXT,
  next_review_at TIMESTAMPTZ DEFAULT NOW(),
  created_at     TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE puzzles (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) NULL,
  fen            TEXT NOT NULL,
  solution       TEXT[],
  theme          TEXT,
  difficulty     INT DEFAULT 1,
  next_review_at TIMESTAMPTZ DEFAULT NOW(),
  source         TEXT DEFAULT 'auto'
);
```
