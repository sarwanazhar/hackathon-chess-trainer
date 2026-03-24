package main

import (
	"context"
	"fmt"
	"log"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/notnil/chess"
	"github.com/notnil/chess/uci"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func main() {
	// Load .env file at the very beginning
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found, using system environment variables")
	}

	r := gin.Default()
	r.GET("/game", handleChessGame)

	log.Println("🚀 God-Mode Chess Sensei starting on :8080...")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func handleChessGame(c *gin.Context) {
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer ws.Close()

	// Fetch API Key from environment
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey == "" {
		log.Println("ERROR: GEMINI_API_KEY is not set in .env or environment")
		ws.WriteMessage(websocket.TextMessage, []byte("SENSEI_CHUNK|Error: API Key missing."))
		return
	}

	ctx := context.Background()
	client, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		log.Println("GenAI Client error:", err)
		return
	}
	defer client.Close()

	// Using Gemini 1.5 Flash for speed, or Gemma-3 as you requested
	model := client.GenerativeModel("gemma-3-27b-it")
	model.SetTemperature(0.1)

	// Initialize Stockfish (Ensure path is correct for your OS)
	eng, err := uci.New("./stockfish/stockfish-linux")
	if err != nil {
		log.Println("Stockfish Error: Ensure the binary exists at ./stockfish/stockfish-linux")
		return
	}
	defer eng.Close()
	eng.Run(uci.CmdUCI, uci.CmdIsReady)

	game := chess.NewGame()

	for {
		_, msg, err := ws.ReadMessage()
		if err != nil {
			break
		}
		userMoveStr := strings.TrimSpace(string(msg))

		// 1. Get Engine Suggestion BEFORE move
		engineSuggestion, evalBefore := getBestMoveAndEval(eng, game)

		// 2. Identify the exact piece moved
		var userMove *chess.Move
		pieceName := "piece"
		for _, m := range game.ValidMoves() {
			if m.String() == userMoveStr {
				userMove = m
				p := game.Position().Board().Piece(m.S1())
				pieceMap := map[chess.PieceType]string{
					chess.Pawn: "pawn", chess.Knight: "knight", chess.Bishop: "bishop",
					chess.Rook: "rook", chess.Queen: "queen", chess.King: "king",
				}
				pieceName = pieceMap[p.Type()]
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
		aiResponseMove, evalAfter := getBestMoveAndEval(eng, game)

		// Logic: If eval drops significantly for the user, it's a blunder
		isBlunder := (evalBefore - evalAfter) > 1.5

		// Capture AI piece type for prompt context
		aiPieceName := "piece"
		for _, m := range game.ValidMoves() {
			if m.String() == aiResponseMove {
				p := game.Position().Board().Piece(m.S1())
				aiPieceName = map[chess.PieceType]string{
					chess.Pawn: "pawn", chess.Knight: "knight", chess.Bishop: "bishop",
					chess.Rook: "rook", chess.Queen: "queen", chess.King: "king",
				}[p.Type()]
				game.Move(m) // Apply AI move
				break
			}
		}

		// 5. Push immediate board update
		ws.WriteMessage(websocket.TextMessage, []byte(fmt.Sprintf("BOARD_UPDATE|%s|%s", aiResponseMove, game.FEN())))

		// 6. THE PROMPT
		prompt := fmt.Sprintf(`### DATA ###
You moved: %s (%s)
Engine Choice: %s
My Response: %s (%s)
Eval: %.1f

### TASK ###
You are a blunt Grandmaster Coach. 
1. If Eval < -1.0, you MUST roast the user for losing material or position.
2. Address me as "You". 
3. Explain why my %s response is tactically better than your %s.
4. Max 15 words. Be direct. No pleasantries.`,
			userMoveStr, pieceName, engineSuggestion, aiResponseMove, aiPieceName, evalAfter, aiPieceName, pieceName)

		log.Println("--- Generating Tactical Insight ---")

		streamCtx, cancel := context.WithTimeout(ctx, 12*time.Second)
		iter := model.GenerateContentStream(streamCtx, genai.Text(prompt))
		for {
			resp, err := iter.Next()
			if err == iterator.Done {
				cancel()
				break
			}
			if err != nil {
				cancel()
				break
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
	}
}

func getBestMoveAndEval(eng *uci.Engine, game *chess.Game) (string, float64) {
	eng.Run(uci.CmdPosition{Position: game.Position()})
	eng.Run(uci.CmdGo{Depth: 12})
	res := eng.SearchResults()
	// Convert centipawns to float eval
	eval := float64(res.Info.Score.CP) / 100.0
	if res.BestMove == nil {
		return "", 0.0
	}
	return res.BestMove.String(), eval
}
