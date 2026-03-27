package controllers

import (
	"backend/libs"
	"backend/middleware"
	"log"
	"net/http"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
)

// ChatHandler handles the chat WebSocket connection with authentication
func ChatHandler(c *gin.Context) {
	// 1. Simply get the ID from context. The middleware already verified the token!
	userID, exists := middleware.GetUserIDFromContext(c)
	if !exists {
		// This shouldn't happen if you used .Use(middleware.ClerkAuthMiddleware())
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	log.Printf("Starting Chat session for user: %s", userID)

	// 2. Upgrade to WebSocket
	ws, err := Upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Println("WebSocket upgrade error:", err)
		return
	}
	defer ws.Close()

	// 3. Initialize AI Service
	aiService, err := libs.NewAIService()
	if err != nil {
		log.Printf("Failed to create AI service: %v", err)
		ws.WriteMessage(websocket.TextMessage, []byte("CHAT_ERROR|Failed to initialize AI service"))
		return
	}
	defer aiService.Close()

	// 4. Handle connection
	if err := aiService.HandleChatWebSocketConnection(ws); err != nil {
		log.Printf("WebSocket connection error: %v", err)
	}
}
