package controllers

import (
	"backend/libs"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// GameHandler handles the chess game WebSocket connection
func GameHandler(c *gin.Context) {
	ws, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer ws.Close()

	// Initialize AI Service
	aiService, err := libs.NewAIService()
	if err != nil {
		log.Printf("Failed to create AI service: %v", err)
		ws.WriteMessage(websocket.TextMessage, []byte("SENSEI_CHUNK|Error: Failed to initialize AI service."))
		return
	}
	defer aiService.Close()

	// Initialize Chess Engine
	chessEngine, err := libs.NewChessEngine("./stockfish/stockfish-linux")
	if err != nil {
		log.Printf("Failed to create chess engine: %v", err)
		ws.WriteMessage(websocket.TextMessage, []byte("SENSEI_CHUNK|Error: Failed to initialize chess engine."))
		return
	}
	defer chessEngine.Close()

	// Handle the WebSocket connection
	if err := aiService.HandleWebSocketConnection(ws, chessEngine); err != nil {
		log.Printf("WebSocket connection error: %v", err)
	}
}
