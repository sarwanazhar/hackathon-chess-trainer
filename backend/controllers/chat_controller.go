package controllers

import (
	"backend/libs"
	"log"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ChatHandler handles the chat WebSocket connection
func ChatHandler(c *gin.Context) {
	ws, err := Upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("Upgrade error:", err)
		return
	}
	defer ws.Close()

	// Initialize AI Service
	aiService, err := libs.NewAIService()
	if err != nil {
		log.Printf("Failed to create AI service: %v", err)
		ws.WriteMessage(websocket.TextMessage, []byte("CHAT_ERROR|Failed to initialize AI service"))
		return
	}
	defer aiService.Close()

	// Handle the WebSocket connection
	if err := aiService.HandleChatWebSocketConnection(ws); err != nil {
		log.Printf("WebSocket connection error: %v", err)
	}
}
