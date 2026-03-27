package libs

import (
	"github.com/notnil/chess"
	"github.com/notnil/chess/uci"
)

// ChessEngine handles chess engine operations
type ChessEngine struct {
	engine *uci.Engine
}

// NewChessEngine creates a new chess engine instance
func NewChessEngine(enginePath string) (*ChessEngine, error) {
	eng, err := uci.New(enginePath)
	if err != nil {
		return nil, err
	}

	// Initialize engine
	eng.Run(uci.CmdUCI, uci.CmdIsReady)

	return &ChessEngine{
		engine: eng,
	}, nil
}

// Close closes the chess engine
func (ce *ChessEngine) Close() error {
	return ce.engine.Close()
}

// GetBestMoveAndEval gets the best move and evaluation from the engine
func (ce *ChessEngine) GetBestMoveAndEval(game *chess.Game) (string, float64) {
	ce.engine.Run(uci.CmdPosition{Position: game.Position()})
	ce.engine.Run(uci.CmdGo{Depth: 12})
	res := ce.engine.SearchResults()

	// Convert centipawns to float eval
	eval := float64(res.Info.Score.CP) / 100.0
	if res.BestMove == nil {
		return "", 0.0
	}

	return res.BestMove.String(), eval
}

// GetPieceName returns the name of a chess piece
func GetPieceName(piece chess.Piece) string {
	if piece == 0 {
		return "piece"
	}

	pieceMap := map[chess.PieceType]string{
		chess.Pawn:   "pawn",
		chess.Knight: "knight",
		chess.Bishop: "bishop",
		chess.Rook:   "rook",
		chess.Queen:  "queen",
		chess.King:   "king",
	}

	return pieceMap[piece.Type()]
}

// IsBlunder determines if a move is a blunder based on evaluation change
func IsBlunder(evalBefore, evalAfter float64) bool {
	return (evalBefore - evalAfter) > 1.5
}
