package libs

import (
	"context"
	"fmt"
	"log"
	"os"
	"strings"
	"time"

	"github.com/google/generative-ai-go/genai"
	"github.com/gorilla/websocket"
	"github.com/notnil/chess"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

// AIService handles AI interactions with Gemini API
type AIService struct {
	client *genai.Client
	model  *genai.GenerativeModel
}

func NewAIService() (*AIService, error) {
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		return nil, fmt.Errorf("GEMINI_API_KEY is not set in .env or environment")
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		return nil, fmt.Errorf("failed to create GenAI client: %w", err)
	}

	// Using Gemma-3 as requested
	model := client.GenerativeModel("gemma-3-27b-it")
	model.SetTemperature(0.1)

	return &AIService{
		client: client,
		model:  model,
	}, nil
}

func (ai *AIService) Close() error {
	return ai.client.Close()
}

// GenerateTacticalInsight sends structured JSON chunks for game analysis
func (ai *AIService) GenerateTacticalInsight(
	ctx context.Context,
	userMoveStr, userPieceName, engineSuggestion, aiResponseMove, aiPieceName string,
	evalAfter float64,
	isBlunder bool,
	ws *websocket.Conn,
) error {
	prompt := fmt.Sprintf(`### DATA ###
You moved: %s (%s)
Engine Choice: %s
My Response: %s (%s)
Eval: %.1f

### TASK ###
You are a blunt Grandmaster Coach. 
1. If Eval < -1.0, you MUST roast the user for losing material or position.
2. Address me as "You". 
3. Explain what's happening in the position after my move.
4. Describe the current state and key features of the position.
5. Max 15 words. Be direct. No pleasantries.`,
		userMoveStr, userPieceName, engineSuggestion, aiResponseMove, aiPieceName, evalAfter)

	log.Println("--- Generating Tactical Insight ---")

	streamCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	iter := ai.model.GenerateContentStream(streamCtx, genai.Text(prompt))
	for {
		resp, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to generate content: %w", err)
		}

		if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
			for _, part := range resp.Candidates[0].Content.Parts {
				chunk := fmt.Sprintf("%v", part)

				// Send as JSON instead of raw string
				msgType := "ai_response"
				if isBlunder {
					msgType = "blunder_insight"
				}

				ws.WriteJSON(map[string]interface{}{
					"type":    msgType,
					"content": chunk,
				})
			}
		}
	}
	return nil
}

func (ai *AIService) HandleChatWebSocketConnection(ws *websocket.Conn) error {
	defer ws.Close()

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			return fmt.Errorf("WebSocket read error: %w", err)
		}

		userMessage := strings.TrimSpace(string(msg))

		if err := ai.GenerateChatResponse(context.Background(), userMessage, ws); err != nil {
			log.Printf("Failed to generate chat response: %v", err)
			ws.WriteJSON(map[string]interface{}{
				"type":    "error",
				"content": "Failed to generate response",
			})
			continue
		}
	}
}

func (ai *AIService) GenerateChatResponse(ctx context.Context, userMessage string, ws *websocket.Conn) error {
	prompt := fmt.Sprintf(`You are a friendly and knowledgeable chess AI assistant. 
        Answer the user's question about chess in a helpful and engaging way.
        User message: "%s"`, userMessage)

	log.Printf("Generating chat response for: %s", userMessage)

	streamCtx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()

	iter := ai.model.GenerateContentStream(streamCtx, genai.Text(prompt))
	for {
		resp, err := iter.Next()
		if err == iterator.Done {
			break
		}
		if err != nil {
			return fmt.Errorf("failed to generate content: %w", err)
		}

		if len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
			for _, part := range resp.Candidates[0].Content.Parts {
				chunk := fmt.Sprintf("%v", part)

				// Send as JSON
				ws.WriteJSON(map[string]interface{}{
					"type":    "ai_response",
					"content": chunk,
				})
			}
		}
	}
	return nil
}

func (ai *AIService) HandleWebSocketConnection(
	ws *websocket.Conn,
	chessEngine *ChessEngine,
) error {
	defer ws.Close()
	game := chess.NewGame()

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			return fmt.Errorf("WebSocket read error: %w", err)
		}
		userMoveStr := strings.TrimSpace(string(msg))

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
			ws.WriteJSON(map[string]interface{}{
				"type":    "error",
				"content": "Invalid Move",
			})
			continue
		}

		game.Move(userMove)
		aiResponseMove, evalAfter := chessEngine.GetBestMoveAndEval(game)
		isBlunder := IsBlunder(evalBefore, evalAfter)

		aiPieceName := "piece"
		for _, m := range game.ValidMoves() {
			if m.String() == aiResponseMove {
				p := game.Position().Board().Piece(m.S1())
				aiPieceName = GetPieceName(p)
				game.Move(m)
				break
			}
		}

		// Push Board Update as JSON
		ws.WriteJSON(map[string]interface{}{
			"type": "board_update",
			"move": aiResponseMove,
			"fen":  game.FEN(),
		})

		if err := ai.GenerateTacticalInsight(
			context.Background(),
			userMoveStr, pieceName, engineSuggestion, aiResponseMove, aiPieceName,
			evalAfter, isBlunder, ws,
		); err != nil {
			log.Printf("Failed to generate tactical insight: %v", err)
		}
	}
}
