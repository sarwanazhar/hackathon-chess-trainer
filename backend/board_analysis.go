package main

import (
	"fmt"
	"strings"

	"github.com/notnil/chess"
)

// BoardFacts holds verified board-level facts for the situation report.
type BoardFacts struct {
	HangingPieces []string
	KingSafety    string
	MaterialDiff  string
}

var pieceValues = map[chess.PieceType]int{
	chess.Pawn:   1,
	chess.Knight: 3,
	chess.Bishop: 3,
	chess.Rook:   5,
	chess.Queen:  9,
}

// AnalyzeBoard returns all board facts for a position.
func AnalyzeBoard(pos *chess.Position) BoardFacts {
	return BoardFacts{
		HangingPieces: FindHangingPieces(pos),
		KingSafety:    KingSafety(pos),
		MaterialDiff:  MaterialBalance(pos),
	}
}

// FindHangingPieces returns pieces that can be captured by a less-valuable (or equal-value) attacker.
// Checks both sides by flipping the turn in the FEN.
func FindHangingPieces(pos *chess.Position) []string {
	var results []string
	seen := map[chess.Square]bool{}

	// Current side's captures
	collectCaptures(pos, pos.ValidMoves(), &results, &seen)

	// Opponent's captures — flip the turn via FEN manipulation
	if fg := safeGameFromFEN(flipTurnFEN(pos.String())); fg != nil {
		collectCaptures(fg.Position(), fg.ValidMoves(), &results, &seen)
	}

	if len(results) == 0 {
		return []string{"No obvious hanging pieces"}
	}
	return results
}

func collectCaptures(pos *chess.Position, moves []*chess.Move, results *[]string, seen *map[chess.Square]bool) {
	for _, m := range moves {
		dest := m.S2()
		if (*seen)[dest] {
			continue
		}
		captured := pos.Board().Piece(dest)
		if captured == chess.NoPiece {
			continue
		}
		attacker := pos.Board().Piece(m.S1())
		if pieceValues[attacker.Type()] <= pieceValues[captured.Type()] {
			*results = append(*results, fmt.Sprintf(
				"%s %s on %s is attacked by %s %s (may be undefended)",
				colorName(captured.Color()), pieceTypeName(captured.Type()), squareName(dest),
				colorName(attacker.Color()), pieceTypeName(attacker.Type()),
			))
			(*seen)[dest] = true
		}
	}
}

// KingSafety returns a string describing king safety for both sides.
func KingSafety(pos *chess.Position) string {
	squareMap := pos.Board().SquareMap()
	var issues []string

	for _, color := range []chess.Color{chess.White, chess.Black} {
		var kingSq chess.Square
		found := false
		for sq, p := range squareMap {
			if p.Type() == chess.King && p.Color() == color {
				kingSq = sq
				found = true
				break
			}
		}
		if !found {
			continue
		}

		kingFile := kingSq.File()
		hasPawn := false
		hasOwnPawn := false
		for sq, p := range squareMap {
			if p.Type() == chess.Pawn && sq.File() == kingFile {
				hasPawn = true
				if p.Color() == color {
					hasOwnPawn = true
				}
			}
		}

		if !hasPawn {
			issues = append(issues, fmt.Sprintf(
				"%s King is exposed on open %c-file", colorName(color), 'a'+byte(kingFile),
			))
		} else if !hasOwnPawn {
			issues = append(issues, fmt.Sprintf(
				"%s King is on semi-open %c-file", colorName(color), 'a'+byte(kingFile),
			))
		}
	}

	if len(issues) == 0 {
		return "Both kings are reasonably safe"
	}
	return strings.Join(issues, "; ")
}

// MaterialBalance returns a human-readable material count difference.
func MaterialBalance(pos *chess.Position) string {
	whiteMat, blackMat := 0, 0
	for _, p := range pos.Board().SquareMap() {
		if p.Type() == chess.King {
			continue
		}
		val := pieceValues[p.Type()]
		if p.Color() == chess.White {
			whiteMat += val
		} else {
			blackMat += val
		}
	}
	diff := whiteMat - blackMat
	switch {
	case diff == 0:
		return "Material is equal"
	case diff > 0:
		return fmt.Sprintf("White is up +%d pawn(s) in material", diff)
	default:
		return fmt.Sprintf("Black is up +%d pawn(s) in material", -diff)
	}
}

// flipTurnFEN swaps the active color in a FEN string and clears en passant.
func flipTurnFEN(fen string) string {
	parts := strings.Fields(fen)
	if len(parts) < 2 {
		return fen
	}
	if parts[1] == "w" {
		parts[1] = "b"
	} else {
		parts[1] = "w"
	}
	if len(parts) >= 4 {
		parts[3] = "-" // clear en passant to avoid illegal position after flip
	}
	return strings.Join(parts, " ")
}

// safeGameFromFEN parses a FEN string into a new game, returning nil on any error.
func safeGameFromFEN(fenStr string) *chess.Game {
	opt, err := chess.FEN(fenStr)
	if err != nil {
		return nil
	}
	return chess.NewGame(opt)
}
