package libs

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"

	"github.com/google/generative-ai-go/genai"
	"github.com/gorilla/websocket"
	"github.com/notnil/chess"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

type WSRequest struct {
	Type    string `json:"type"`
	Content string `json:"content"`
}

type AIService struct {
	client *genai.Client
	model  *genai.GenerativeModel
}

func NewAIService() (*AIService, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY is missing")
	}
	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, err
	}
	model := client.GenerativeModel("gemma-3-27b-it")
	model.SetTemperature(0.1)
	return &AIService{client: client, model: model}, nil
}

func (ai *AIService) Close() error { return ai.client.Close() }

func (ai *AIService) HandleWebSocketConnection(ws *websocket.Conn, chessEngine *ChessEngine) error {
	game := chess.NewGame()
	for {
		var req WSRequest
		if err := ws.ReadJSON(&req); err != nil {
			log.Printf("WS Read Error: %v", err)
			return err
		}

		if req.Type == "move" {
			userMoveStr := strings.TrimSpace(req.Content)
			engineSuggestion, evalBefore := chessEngine.GetBestMoveAndEval(game)

			var userMove *chess.Move
			pieceName := "piece"
			for _, m := range game.ValidMoves() {
				if m.String() == userMoveStr {
					userMove = m
					p := game.Position().Board().Piece(m.S1())
					pieceName = GetPieceName(p)
					break
				}
			}

			if userMove == nil {
				ws.WriteJSON(map[string]interface{}{"type": "error", "content": "Invalid Move"})
				continue
			}

			// 1. Apply User Move
			game.Move(userMove)

			// 2. Get AI Response
			aiResponseMove, evalAfter := chessEngine.GetBestMoveAndEval(game)
			isBlunder := IsBlunder(evalBefore, evalAfter)

			// 3. Apply AI Move to the internal game state
			aiPieceName := "piece"
			for _, m := range game.ValidMoves() {
				if m.String() == aiResponseMove {
					p := game.Position().Board().Piece(m.S1())
					aiPieceName = GetPieceName(p)
					game.Move(m)
					break
				}
			}

			// 4. Send the FINAL Board state (After both moves)
			// This ensures the board is ready for White's next turn immediately
			ws.WriteJSON(map[string]interface{}{
				"type": "board_update",
				"move": aiResponseMove,
				"fen":  game.FEN(),
			})

			// 5. Run tactical roast in background
			go ai.GenerateTacticalInsight(context.Background(), userMoveStr, pieceName, engineSuggestion, aiResponseMove, aiPieceName, evalAfter, isBlunder, ws)

		} else if req.Type == "chat_message" {
			go ai.GenerateChatResponse(context.Background(), req.Content, ws)
		}
	}
}

func (ai *AIService) HandleChatWebSocketConnection(ws *websocket.Conn) error {
	for {
		var req WSRequest
		if err := ws.ReadJSON(&req); err != nil {
			return err
		}
		if req.Type == "chat_message" {
			go ai.GenerateChatResponse(context.Background(), req.Content, ws)
		}
	}
}

func (ai *AIService) GenerateTacticalInsight(ctx context.Context, userMove, userPiece, suggest, aiMove, aiPiece string, eval float64, blunder bool, ws *websocket.Conn) error {
	prompt := fmt.Sprintf("GM Coach Roast: You moved %s (%s). Engine wanted %s. I played %s. Eval: %.1f. Be blunt, max 15 words.", userMove, userPiece, suggest, aiMove, aiPiece, eval)
	iter := ai.model.GenerateContentStream(ctx, genai.Text(prompt))
	for {
		resp, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return err
		}
		for _, part := range resp.Candidates[0].Content.Parts {
			ws.WriteJSON(map[string]interface{}{"type": "ai_response", "content": fmt.Sprintf("%v", part)})
		}
	}
	return nil
}

func (ai *AIService) GenerateChatResponse(ctx context.Context, msg string, ws *websocket.Conn) error {
	iter := ai.model.GenerateContentStream(ctx, genai.Text("Chess Coach: "+msg))
	for {
		resp, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return err
		}
		for _, part := range resp.Candidates[0].Content.Parts {
			ws.WriteJSON(map[string]interface{}{"type": "ai_response", "content": fmt.Sprintf("%v", part)})
		}
	}
	return nil
}
