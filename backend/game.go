package main

import (
	"context"
	"encoding/json"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/gorilla/websocket"
	"github.com/notnil/chess"
	chessopening "github.com/notnil/chess/opening"
	"github.com/notnil/chess/uci"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

// GameSession holds per-connection state.
type GameSession struct {
	Game        *chess.Game
	Eng         *uci.Engine
	UserID      string
	GameID      string
	Color       chess.Color
	Personality string
	Level       string   // beginner | intermediate | advanced
	Moves       []string // UCI move history
}

// --- Inbound JSON ---
type ClientMsg struct {
	Type  string `json:"type"`  // new_game | move | hint | set_personality | set_level
	Move  string `json:"move"`  // UCI e.g. "e2e4"
	Color string `json:"color"` // white | black
	Mode  string `json:"mode"`  // roast | mentor
	Level string `json:"level"` // beginner | intermediate | advanced
}

// --- Outbound JSON ---
type BoardUpdateMsg struct {
	Type    string  `json:"type"`
	FEN     string  `json:"fen"`
	AIMove  string  `json:"ai_move,omitempty"`
	Eval    float64 `json:"eval"`
	Opening string  `json:"opening,omitempty"`
}

type DebugPromptMsg struct {
	Type   string `json:"type"`
	Prompt string `json:"prompt"`
}

type CoachChunkMsg struct {
	Type      string `json:"type"`
	Text      string `json:"text"`
	IsBlunder bool   `json:"is_blunder"`
}

type CoachDoneMsg struct {
	Type string `json:"type"`
}

type HintMsg struct {
	Type   string  `json:"type"`
	Move   string  `json:"move"`
	Eval   float64 `json:"eval"`
	Reason string  `json:"reason"`
}

type GameOverMsg struct {
	Type   string `json:"type"`
	Result string `json:"result"`
	Winner string `json:"winner"`
}

type WSErrorMsg struct {
	Type    string `json:"type"`
	Message string `json:"message"`
}

func sendJSON(ws *websocket.Conn, v interface{}) error {
	b, err := json.Marshal(v)
	if err != nil {
		log.Printf("sendJSON marshal error: %v", err)
		return err
	}
	if err := ws.WriteMessage(websocket.TextMessage, b); err != nil {
		log.Printf("sendJSON write error: %v", err)
		return err
	}
	return nil
}

// HandleGame is the WebSocket handler for /ws/game.
func HandleGame(c *gin.Context, userID string) {
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer ws.Close()

	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		sendJSON(ws, WSErrorMsg{Type: "error", Message: "API key missing"})
		return
	}

	ctx := context.Background()
	aiClient, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		sendJSON(ws, WSErrorMsg{Type: "error", Message: "AI client error"})
		return
	}
	defer aiClient.Close()
	model := aiClient.GenerativeModel("gemma-3-27b-it")
	model.SetTemperature(0.1)

	stockfishPath := os.Getenv("STOCKFISH_PATH")
	if stockfishPath == "" {
		stockfishPath = "stockfish"
	}
	eng, err := uci.New(stockfishPath)
	if err != nil {
		sendJSON(ws, WSErrorMsg{Type: "error", Message: "Stockfish init failed"})
		return
	}
	defer eng.Close()
	eng.Run(uci.CmdUCI, uci.CmdIsReady)

	personality, _ := sb.GetUserPersonality(userID)
	level, _ := sb.GetUserLevel(userID)
	session := &GameSession{
		UserID:      userID,
		Eng:         eng,
		Personality: personality,
		Level:       level,
		Color:       chess.White,
	}

	for {
		_, raw, err := ws.ReadMessage()
		if err != nil {
			break
		}

		var msg ClientMsg
		if err := json.Unmarshal(raw, &msg); err != nil {
			sendJSON(ws, WSErrorMsg{Type: "error", Message: "Invalid JSON"})
			continue
		}

		switch msg.Type {
		case "new_game":
			session.Game = chess.NewGame()
			session.Moves = nil
			session.GameID = ""
			if msg.Color == "black" {
				session.Color = chess.Black
			} else {
				session.Color = chess.White
			}
			if gameID, err := sb.SaveGame(GameRecord{UserID: userID, Color: msg.Color}); err == nil {
				session.GameID = gameID
			}
			// Send initial board state (starting position).
			sendJSON(ws, BoardUpdateMsg{Type: "board_update", FEN: session.Game.Position().String()})
			// If user plays Black, AI (White) moves first.
			if session.Color == chess.Black {
				makeAIFirstMove(ws, session)
			}

		case "move":
			if session.Game == nil {
				sendJSON(ws, WSErrorMsg{Type: "error", Message: "No game started"})
				continue
			}
			if err := handleMove(ws, ctx, model, session, msg.Move); err != nil {
				return
			}

		case "hint":
			if session.Game == nil {
				sendJSON(ws, WSErrorMsg{Type: "error", Message: "No game started"})
				continue
			}
			if err := handleHint(ws, ctx, model, session); err != nil {
				return
			}

		case "set_personality":
			session.Personality = msg.Mode
			go sb.UpdateProfile(session.UserID, map[string]interface{}{"personality": msg.Mode})

		case "set_level":
			session.Level = msg.Level
			go sb.UpdateProfile(session.UserID, map[string]interface{}{"level": msg.Level})

		default:
			sendJSON(ws, WSErrorMsg{Type: "error", Message: "Unknown message type: " + msg.Type})
		}
	}

	// Persist final game state on disconnect.
	if session.GameID != "" && session.Game != nil {
		result := outcomeResult(session.Game.Outcome(), session.Color)
		sb.UpdateGame(session.GameID, map[string]interface{}{
			"moves":  session.Moves,
			"pgn":    session.Game.String(),
			"result": result,
		})
		// Update Elo after a decisive result.
		if result == "win" || result == "loss" || result == "draw" {
			go sb.UpdateRating(session.UserID, result)
		}
	}
}

// makeAIFirstMove is called when the user plays Black — the AI (White) must move first.
func makeAIFirstMove(ws *websocket.Conn, session *GameSession) {
	result := GetAnalysis(session.Eng, session.Game, 12)
	if result.BestMove == "" {
		return
	}
	moveFound := false
	for _, m := range session.Game.ValidMoves() {
		if m.String() == result.BestMove {
			session.Game.Move(m)
			session.Moves = append(session.Moves, result.BestMove)
			moveFound = true
			break
		}
	}
	if !moveFound {
		log.Printf("makeAIFirstMove: AI move %q not found in valid moves", result.BestMove)
		sendJSON(ws, WSErrorMsg{Type: "error", Message: "AI failed to make opening move"})
		return
	}
	book := chessopening.NewBookECO()
	openingName := ""
	if op := book.Find(session.Game.Moves()); op != nil {
		openingName = op.Title()
	}
	sendJSON(ws, BoardUpdateMsg{
		Type:    "board_update",
		FEN:     session.Game.Position().String(),
		AIMove:  result.BestMove,
		Eval:    result.Eval,
		Opening: openingName,
	})
}

func handleMove(ws *websocket.Conn, ctx context.Context, model *genai.GenerativeModel, session *GameSession, moveStr string) error {
	game := session.Game

	// Eval BEFORE the user's move → what the user SHOULD have played.
	preMovefen := game.Position().String()
	beforeResult := GetAnalysis(session.Eng, game, 12)

	// Validate move.
	var userMove *chess.Move
	for _, m := range game.ValidMoves() {
		if m.String() == moveStr {
			userMove = m
			break
		}
	}
	if userMove == nil {
		return sendJSON(ws, WSErrorMsg{Type: "error", Message: "Invalid move"})
	}

	userMoveSAN := chess.AlgebraicNotation{}.Encode(game.Position(), userMove)
	game.Move(userMove)
	session.Moves = append(session.Moves, moveStr)

	// Check game over after user move.
	if game.Outcome() != chess.NoOutcome {
		result, winner := outcomeStrings(game.Outcome(), game.Method())
		return sendJSON(ws, GameOverMsg{Type: "game_over", Result: result, Winner: winner})
	}

	// Eval AFTER user's move → opponent's best response + position quality.
	afterResult := GetAnalysis(session.Eng, game, 12)

	// Eval drop from the user's perspective (eval is from White's POV).
	evalDrop := beforeResult.Eval - afterResult.Eval
	if session.Color == chess.Black {
		evalDrop = afterResult.Eval - beforeResult.Eval
	}
	isBlunder := evalDrop > 1.5

	// Auto-save blunder.
	if isBlunder && session.GameID != "" {
		theme := detectTheme(len(game.Moves()))
		sb.SaveMissedMove(MissedMove{
			UserID:   session.UserID,
			GameID:   session.GameID,
			FEN:      game.Position().String(),
			UserMove: moveStr,
			BestMove: beforeResult.BestMove,
			EvalDrop: evalDrop,
			Theme:    theme,
		})
	}

	// Apply AI's best response.
	aiMoveStr := afterResult.BestMove
	aiApplied := false
	for _, m := range game.ValidMoves() {
		if m.String() == aiMoveStr {
			game.Move(m)
			session.Moves = append(session.Moves, aiMoveStr)
			aiApplied = true
			break
		}
	}
	if !aiApplied {
		log.Printf("AI move %q not found in valid moves for position %s", aiMoveStr, game.Position().String())
		return sendJSON(ws, WSErrorMsg{Type: "error", Message: "AI could not make a move — game state reset required"})
	}

	// Detect opening name.
	openingName := ""
	book := chessopening.NewBookECO()
	if op := book.Find(game.Moves()); op != nil {
		openingName = op.Title()
	}

	if err := sendJSON(ws, BoardUpdateMsg{
		Type:    "board_update",
		FEN:     game.Position().String(),
		AIMove:  aiMoveStr,
		Eval:    afterResult.Eval,
		Opening: openingName,
	}); err != nil {
		return err
	}

	// Check game over after AI move.
	if game.Outcome() != chess.NoOutcome {
		result, winner := outcomeStrings(game.Outcome(), game.Method())
		return sendJSON(ws, GameOverMsg{Type: "game_over", Result: result, Winner: winner})
	}

	// Build grounded situation report and stream coaching.
	facts := AnalyzeBoard(game.Position())
	userColorStr := "white"
	if session.Color == chess.Black {
		userColorStr = "black"
	}
	report := BuildSituationReport(beforeResult, facts, userMoveSAN, evalDrop, session.Personality, session.Level, openingName, preMovefen, afterResult.BestSAN, userColorStr)

	// Send prompt to client for transparency (fire-and-forget).
	sendJSON(ws, DebugPromptMsg{Type: "debug_prompt", Prompt: report})

	streamCtx, cancel := context.WithTimeout(ctx, 15*time.Second)
	defer cancel()

	iter := model.GenerateContentStream(streamCtx, genai.Text(report))
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
				if err := sendJSON(ws, CoachChunkMsg{
					Type:      "coach_chunk",
					Text:      fmt.Sprintf("%v", part),
					IsBlunder: isBlunder,
				}); err != nil {
					return err
				}
			}
		}
	}
	return sendJSON(ws, CoachDoneMsg{Type: "coach_done"})
}

func handleHint(ws *websocket.Conn, ctx context.Context, model *genai.GenerativeModel, session *GameSession) error {
	result := GetAnalysis(session.Eng, session.Game, 12)

	bestMove := result.BestSAN
	if bestMove == "" {
		bestMove = result.BestMove
	}

	prompt := fmt.Sprintf(
		"Best move: %s (eval: %+.1f). Top line: %s\nIn one sentence, explain why %s is best here. Be very direct.",
		bestMove, result.Eval, strings.Join(result.PVLine, " "), bestMove,
	)

	var reason strings.Builder
	streamCtx, cancel := context.WithTimeout(ctx, 8*time.Second)
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
				reason.WriteString(fmt.Sprintf("%v", part))
			}
		}
	}

	return sendJSON(ws, HintMsg{
		Type:   "hint",
		Move:   result.BestMove,
		Eval:   result.Eval,
		Reason: reason.String(),
	})
}

func outcomeResult(outcome chess.Outcome, userColor chess.Color) string {
	switch outcome {
	case chess.WhiteWon:
		if userColor == chess.White {
			return "win"
		}
		return "loss"
	case chess.BlackWon:
		if userColor == chess.Black {
			return "win"
		}
		return "loss"
	case chess.Draw:
		return "draw"
	}
	return ""
}

func outcomeStrings(outcome chess.Outcome, method chess.Method) (result, winner string) {
	switch method {
	case chess.Checkmate:
		result = "checkmate"
	case chess.Stalemate:
		result = "stalemate"
	default:
		result = "draw"
	}
	switch outcome {
	case chess.WhiteWon:
		winner = "white"
	case chess.BlackWon:
		winner = "black"
	}
	return
}
