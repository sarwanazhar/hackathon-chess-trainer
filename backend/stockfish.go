package main

import (
	"strings"

	"github.com/notnil/chess"
	"github.com/notnil/chess/uci"
)

// StockfishResult holds the engine's analysis of a position.
type StockfishResult struct {
	Eval     float64  // centipawns/100, from White's perspective
	BestMove string   // UCI notation e.g. "d1d8"
	BestSAN  string   // SAN notation e.g. "Rd8+"
	PVLine   []string // top 5 moves in SAN
}

// GetAnalysis runs Stockfish at the given depth and returns evaluation + best move + PV line.
func GetAnalysis(eng *uci.Engine, game *chess.Game, depth int) StockfishResult {
	eng.Run(uci.CmdPosition{Position: game.Position()})
	eng.Run(uci.CmdGo{Depth: depth})
	res := eng.SearchResults()

	result := StockfishResult{}
	if res.BestMove == nil {
		return result
	}

	result.Eval = float64(res.Info.Score.CP) / 100.0
	result.BestMove = res.BestMove.String()

	// Convert best move to SAN
	for _, m := range game.ValidMoves() {
		if m.String() == result.BestMove {
			result.BestSAN = chess.AlgebraicNotation{}.Encode(game.Position(), m)
			break
		}
	}

	// Convert PV line to SAN by simulating moves on a scratch game
	if len(res.Info.PV) > 0 {
		scratch := cloneGame(game)
		for i, pvMove := range res.Info.PV {
			if i >= 5 {
				break
			}
			for _, valid := range scratch.ValidMoves() {
				if valid.String() == pvMove.String() {
					san := chess.AlgebraicNotation{}.Encode(scratch.Position(), valid)
					result.PVLine = append(result.PVLine, san)
					scratch.Move(valid)
					break
				}
			}
		}
	}

	return result
}

// cloneGame returns a new game replaying all moves from g.
func cloneGame(g *chess.Game) *chess.Game {
	clone := chess.NewGame()
	for _, m := range g.Moves() {
		clone.Move(m)
	}
	return clone
}

// evalLabel returns a human-readable description of the eval (from White's perspective).
func evalLabel(eval float64) string {
	switch {
	case eval > 3.0:
		return "White winning"
	case eval > 0.5:
		return "White better"
	case eval > -0.5:
		return "Equal"
	case eval > -3.0:
		return "Black better"
	default:
		return "Black winning"
	}
}

// moveGrade converts an eval drop (in pawns) to a grade label.
func moveGrade(drop float64) string {
	switch {
	case drop > 1.5:
		return "blunder"
	case drop > 0.8:
		return "mistake"
	case drop > 0.3:
		return "inaccuracy"
	default:
		return "good"
	}
}

// pieceTypeName returns the display name of a piece type.
func pieceTypeName(pt chess.PieceType) string {
	names := map[chess.PieceType]string{
		chess.Pawn:   "Pawn",
		chess.Knight: "Knight",
		chess.Bishop: "Bishop",
		chess.Rook:   "Rook",
		chess.Queen:  "Queen",
		chess.King:   "King",
	}
	if n, ok := names[pt]; ok {
		return n
	}
	return "Piece"
}

// colorName returns "White" or "Black".
func colorName(c chess.Color) string {
	if c == chess.White {
		return "White"
	}
	return "Black"
}

// squareName returns the lowercase algebraic square name.
func squareName(sq chess.Square) string {
	return strings.ToLower(sq.String())
}

// detectTheme infers the game phase from the half-move number.
func detectTheme(halfMove int) string {
	switch {
	case halfMove < 20:
		return "opening"
	case halfMove < 60:
		return "tactic"
	default:
		return "endgame"
	}
}
