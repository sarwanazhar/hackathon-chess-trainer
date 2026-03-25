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
	"github.com/joho/godotenv"
	"github.com/notnil/chess"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

// AIService handles AI interactions with Gemini API
type AIService struct {
	client *genai.Client
	model  *genai.GenerativeModel
}

// NewAIService creates a new AI service instance
func NewAIService() (*AIService, error) {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found, using system environment variables")
	}

	// Fetch API Key from environment
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

// Close closes the AI service client
func (ai *AIService) Close() error {
	return ai.client.Close()
}

// GenerateTacticalInsight generates tactical analysis for a chess move
func (ai *AIService) GenerateTacticalInsight(
	ctx context.Context,
	userMoveStr, userPieceName, engineSuggestion, aiResponseMove, aiPieceName string,
	evalAfter float64,
	isBlunder bool,
	ws *websocket.Conn,
) error {
	// The prompt
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

	streamCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
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
				prefix := "SENSEI_CHUNK|"
				if isBlunder {
					prefix = "BLUNDER_CHUNK|"
				}
				ws.WriteMessage(websocket.TextMessage, []byte(prefix+chunk))
			}
		}
	}

	return nil
}

// HandleWebSocketConnection handles the main WebSocket game loop
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

		// 1. Get Engine Suggestion BEFORE move
		engineSuggestion, evalBefore := chessEngine.GetBestMoveAndEval(game)

		// 2. Identify the exact piece moved
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
			ws.WriteMessage(websocket.TextMessage, []byte("ERROR|Invalid Move"))
			continue
		}

		// 3. Apply User Move
		game.Move(userMove)

		// 4. Get AI response and evaluation
		aiResponseMove, evalAfter := chessEngine.GetBestMoveAndEval(game)

		// Logic: If eval drops significantly for the user, it's a blunder
		isBlunder := IsBlunder(evalBefore, evalAfter)

		// Capture AI piece type for prompt context
		aiPieceName := "piece"
		for _, m := range game.ValidMoves() {
			if m.String() == aiResponseMove {
				p := game.Position().Board().Piece(m.S1())
				aiPieceName = GetPieceName(p)
				game.Move(m) // Apply AI move
				break
			}
		}

		// 5. Push immediate board update
		ws.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("BOARD_UPDATE|%s|%s", aiResponseMove, game.FEN())))

		// 6. Generate tactical insight
		if err := ai.GenerateTacticalInsight(
			context.Background(),
			userMoveStr, pieceName, engineSuggestion, aiResponseMove, aiPieceName,
			evalAfter, isBlunder, ws,
		); err != nil {
			log.Printf("Failed to generate tactical insight: %v", err)
			ws.WriteMessage(websocket.TextMessage, []byte("ERROR|Failed to generate insight"))
		}
	}
}
