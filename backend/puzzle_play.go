package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/notnil/chess"
)

// --- Request / Response types ---

type PuzzleAttemptRequest struct {
	PuzzleID  string `json:"puzzle_id" binding:"required"`
	Move      string `json:"move" binding:"required"` // UCI e.g. "g1f3"
	MoveIndex int    `json:"move_index"`               // 0-based index into solution[]
	FEN       string `json:"fen" binding:"required"`   // current board FEN (client-tracked)
}

type PuzzleAttemptResponse struct {
	Correct         bool   `json:"correct"`
	Complete        bool   `json:"complete,omitempty"`
	OpponentMoveSAN string `json:"opponent_move_san,omitempty"`
	OpponentMoveUCI string `json:"opponent_move_uci,omitempty"`
	NextFEN         string `json:"next_fen,omitempty"`   // FEN after opponent responds
	NextIndex       int    `json:"next_index,omitempty"` // next move_index for the user
	BestMoveSAN     string `json:"best_move_san,omitempty"`
	BestMoveUCI     string `json:"best_move_uci,omitempty"`
}

type PuzzleCoachRequest struct {
	FEN       string `json:"fen" binding:"required"`
	WrongMove string `json:"wrong_move" binding:"required"` // UCI move user played
	BestMove  string `json:"best_move" binding:"required"`  // UCI correct move
	Theme     string `json:"theme"`
}

type PuzzleCoachResponse struct {
	WrongMoveSAN string   `json:"wrong_move_san"`
	BestMoveSAN  string   `json:"best_move_san"`
	EvalDrop     float64  `json:"eval_drop"`
	Grade        string   `json:"grade"`
	Eval         float64  `json:"eval"`
	EvalLabel    string   `json:"eval_label"`
	PVLine       []string `json:"pv_line"`   // top continuation after best move
	Coaching     string   `json:"coaching"`  // human-readable explanation (no LLM)
	BoardFacts   []string `json:"board_facts"`
}

// HandlePuzzleAttempt validates a user's puzzle move and returns the result.
//
//	POST /api/puzzles/attempt
//
// • Correct + more moves → returns opponent response + next FEN/index.
// • Correct + last move  → complete: true.
// • Wrong               → returns best_move_san/uci; client calls /api/puzzles/coach.
func HandlePuzzleAttempt(c *gin.Context) {
	var req PuzzleAttemptRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")
	puzzle, err := fetchPuzzleByID(req.PuzzleID, userID)
	if err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "puzzle not found"})
		return
	}
	if req.MoveIndex >= len(puzzle.Solution) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "move_index out of range"})
		return
	}

	// Convert the expected solution move from SAN → UCI for robust comparison.
	expectedUCI, err := sanToUCI(req.FEN, puzzle.Solution[req.MoveIndex])
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "solution conversion failed: " + err.Error()})
		return
	}

	if req.Move != expectedUCI {
		c.JSON(http.StatusOK, PuzzleAttemptResponse{
			Correct:     false,
			BestMoveSAN: puzzle.Solution[req.MoveIndex],
			BestMoveUCI: expectedUCI,
		})
		return
	}

	// Correct. Check if puzzle is finished.
	nextIndex := req.MoveIndex + 1
	if nextIndex >= len(puzzle.Solution) {
		c.JSON(http.StatusOK, PuzzleAttemptResponse{Correct: true, Complete: true})
		return
	}

	// Apply user's correct move to get the post-move FEN.
	afterUserFEN, err := applyUCIMove(req.FEN, req.Move)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not apply user move"})
		return
	}

	// Opponent response (solution[nextIndex]).
	opponentSAN := puzzle.Solution[nextIndex]
	opponentUCI, err := sanToUCI(afterUserFEN, opponentSAN)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "opponent move conversion failed"})
		return
	}

	// Apply opponent's move to get the FEN the user will play from next.
	nextFEN, err := applyUCIMove(afterUserFEN, opponentUCI)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "could not apply opponent move"})
		return
	}

	c.JSON(http.StatusOK, PuzzleAttemptResponse{
		Correct:         true,
		Complete:        false,
		OpponentMoveSAN: opponentSAN,
		OpponentMoveUCI: opponentUCI,
		NextFEN:         nextFEN,
		NextIndex:       nextIndex + 1,
	})
}

// HandlePuzzleCoach returns engine-based coaching for a wrong puzzle move.
// No LLM is used — all facts come from Stockfish and the board analyzer.
//
//	POST /api/puzzles/coach
func HandlePuzzleCoach(c *gin.Context) {
	var req PuzzleCoachRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	posOpt, err := chess.FEN(req.FEN)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid FEN"})
		return
	}
	game := chess.NewGame(posOpt)

	puzzleEngMu.Lock()
	defer puzzleEngMu.Unlock()
	eng := puzzleEng
	if eng == nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "stockfish not available"})
		return
	}

	// Analysis at current position (before any move).
	beforeAnalysis := GetAnalysis(eng, game, 12)
	facts := AnalyzeBoard(game.Position())

	// Convert wrong move to SAN and calculate eval drop.
	wrongMoveSAN := req.WrongMove
	evalDrop := 0.0
	for _, m := range game.ValidMoves() {
		if m.String() == req.WrongMove {
			wrongMoveSAN = chess.AlgebraicNotation{}.Encode(game.Position(), m)
			wrongGame := cloneGame(game)
			wrongGame.Move(m)
			afterWrong := GetAnalysis(eng, wrongGame, 10)
			if game.Position().Turn() == chess.White {
				evalDrop = beforeAnalysis.Eval - afterWrong.Eval
			} else {
				evalDrop = afterWrong.Eval - beforeAnalysis.Eval
			}
			break
		}
	}

	// Resolve best move SAN from the puzzle's solution (override engine choice).
	bestMoveSAN := beforeAnalysis.BestSAN
	if req.BestMove != "" {
		for _, m := range game.ValidMoves() {
			if m.String() == req.BestMove {
				bestMoveSAN = chess.AlgebraicNotation{}.Encode(game.Position(), m)
				// Re-run analysis after the correct move for accurate PV line.
				bestGame := cloneGame(game)
				bestGame.Move(m)
				afterBest := GetAnalysis(eng, bestGame, 10)
				beforeAnalysis.PVLine = afterBest.PVLine
				break
			}
		}
	}

	coaching := buildCoachingText(wrongMoveSAN, bestMoveSAN, evalDrop, beforeAnalysis, facts, req.Theme)

	var boardFacts []string
	boardFacts = append(boardFacts, facts.HangingPieces...)
	boardFacts = append(boardFacts, facts.KingSafety)
	boardFacts = append(boardFacts, facts.MaterialDiff)

	c.JSON(http.StatusOK, PuzzleCoachResponse{
		WrongMoveSAN: wrongMoveSAN,
		BestMoveSAN:  bestMoveSAN,
		EvalDrop:     evalDrop,
		Grade:        moveGrade(evalDrop),
		Eval:         beforeAnalysis.Eval,
		EvalLabel:    evalLabel(beforeAnalysis.Eval),
		PVLine:       beforeAnalysis.PVLine,
		Coaching:     coaching,
		BoardFacts:   boardFacts,
	})
}

// buildCoachingText produces a deterministic, engine-grounded coaching message
// with no LLM involved. Fast, rate-limit-free, always accurate.
func buildCoachingText(
	wrongSAN, bestSAN string,
	evalDrop float64,
	analysis StockfishResult,
	facts BoardFacts,
	theme string,
) string {
	var sb strings.Builder

	grade := moveGrade(evalDrop)

	// Opening line — what the user did wrong.
	switch grade {
	case "blunder":
		fmt.Fprintf(&sb, "%s was a blunder (%.1f pawn drop). ", wrongSAN, evalDrop)
	case "mistake":
		fmt.Fprintf(&sb, "%s was a mistake (%.1f pawn drop). ", wrongSAN, evalDrop)
	case "inaccuracy":
		fmt.Fprintf(&sb, "%s was an inaccuracy (%.1f pawn drop). ", wrongSAN, evalDrop)
	default:
		fmt.Fprintf(&sb, "%s was not the best move here. ", wrongSAN)
	}

	// What the correct move does.
	fmt.Fprintf(&sb, "The correct move is %s", bestSAN)
	evalStr := fmt.Sprintf("%.1f", analysis.Eval)
	if analysis.Eval > 0 {
		evalStr = "+" + evalStr
	}
	fmt.Fprintf(&sb, " (eval: %s, %s).", evalStr, evalLabel(analysis.Eval))

	// Key board facts that explain the position.
	var keyFacts []string
	for _, h := range facts.HangingPieces {
		if h != "No obvious hanging pieces" {
			keyFacts = append(keyFacts, h)
		}
	}
	if facts.KingSafety != "Both kings are reasonably safe" {
		keyFacts = append(keyFacts, facts.KingSafety)
	}
	if facts.MaterialDiff != "Material is equal" {
		keyFacts = append(keyFacts, facts.MaterialDiff)
	}
	if len(keyFacts) > 0 {
		sb.WriteString(" Key factors: ")
		sb.WriteString(strings.Join(keyFacts, "; "))
		sb.WriteString(".")
	}

	// Best continuation.
	if len(analysis.PVLine) > 0 {
		fmt.Fprintf(&sb, " Best line: %s.", strings.Join(analysis.PVLine, " "))
	}

	// Theme tip.
	if theme != "" {
		tip := themeTip(theme)
		if tip != "" {
			fmt.Fprintf(&sb, " Tip: %s", tip)
		}
	}

	return sb.String()
}

// themeTip returns a one-line study tip for a given tactical theme.
func themeTip(theme string) string {
	tips := map[string]string{
		"fork":             "Look for a piece that can attack two enemy pieces at once.",
		"pin":              "A pinned piece cannot move without exposing a more valuable piece behind it.",
		"skewer":           "A skewer forces the high-value piece to move, exposing the piece behind it.",
		"discovered_attack": "Moving one piece uncovers an attack from another piece on the same line.",
		"back_rank":        "A back-rank weakness appears when the king has no escape squares behind its pawns.",
		"checkmate":        "Look for checks that leave the king with no legal escape.",
		"endgame":          "In endgames, king activity and pawn advancement are key.",
		"promotion":        "A passed pawn that promotes wins decisive material.",
		"combination":      "Combinations often involve a sacrifice to open lines or expose the king.",
	}
	return tips[theme]
}

// --- Helpers ---

// fetchPuzzleByID looks up a puzzle by ID, checking the puzzles table first
// then missed_moves (personal puzzles). Personal puzzles are filtered by user_id.
func fetchPuzzleByID(id, userID string) (*Puzzle, error) {
	data, err := sb.dbRequest("GET", "puzzles", nil, "id=eq."+id)
	if err == nil && len(data) > 2 {
		var puzzles []Puzzle
		if json.Unmarshal(data, &puzzles) == nil && len(puzzles) > 0 {
			return &puzzles[0], nil
		}
	}

	// Try personal puzzles from missed_moves.
	data, err = sb.dbRequest("GET", "missed_moves", nil, "id=eq."+id+"&user_id=eq."+userID)
	if err == nil && len(data) > 2 {
		var rows []struct {
			ID       string  `json:"id"`
			FEN      string  `json:"fen"`
			BestMove string  `json:"best_move"`
			EvalDrop float64 `json:"eval_drop"`
			Theme    string  `json:"theme"`
		}
		if json.Unmarshal(data, &rows) == nil && len(rows) > 0 {
			r := rows[0]
			diff := 1
			if r.EvalDrop > 3 {
				diff = 3
			} else if r.EvalDrop > 1.5 {
				diff = 2
			}
			return &Puzzle{
				ID:         r.ID,
				FEN:        r.FEN,
				Solution:   []string{r.BestMove},
				Theme:      r.Theme,
				Difficulty: diff,
			}, nil
		}
	}
	return nil, fmt.Errorf("puzzle %s not found", id)
}

// sanToUCI converts a SAN move to UCI notation for a given FEN position.
func sanToUCI(fenStr, sanMove string) (string, error) {
	opt, err := chess.FEN(fenStr)
	if err != nil {
		return "", fmt.Errorf("invalid FEN: %v", err)
	}
	game := chess.NewGame(opt)
	for _, m := range game.ValidMoves() {
		moveSAN := chess.AlgebraicNotation{}.Encode(game.Position(), m)
		if moveSAN == sanMove {
			return m.String(), nil
		}
	}
	return "", fmt.Errorf("SAN move %q not found in position", sanMove)
}

// applyUCIMove applies a single UCI move to a FEN position and returns the new FEN.
func applyUCIMove(fenStr, uciMove string) (string, error) {
	opt, err := chess.FEN(fenStr)
	if err != nil {
		return "", fmt.Errorf("invalid FEN: %v", err)
	}
	game := chess.NewGame(opt)
	for _, m := range game.ValidMoves() {
		if m.String() == uciMove {
			game.Move(m)
			return game.Position().String(), nil
		}
	}
	return "", fmt.Errorf("UCI move %q is not valid in position", uciMove)
}
