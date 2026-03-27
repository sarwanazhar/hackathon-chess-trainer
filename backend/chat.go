package main

import (
	"context"
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"google.golang.org/api/iterator"
	"google.golang.org/api/option"
)

type ChatRequest struct {
	Message string `json:"message" binding:"required"`
	GameID  string `json:"game_id"`
}

// HandleChat streams a coaching response via SSE (text/event-stream).
func HandleChat(c *gin.Context) {
	var req ChatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	apiKey := os.Getenv("GEMINI_API_KEY")
	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Second)
	defer cancel()

	aiClient, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "AI client error"})
		return
	}
	defer aiClient.Close()

	model := aiClient.GenerativeModel("gemma-3-27b-it")
	model.SetTemperature(0.3)

	systemPrompt := "You are a helpful chess coach. Answer chess questions concisely and accurately."

	// If game_id provided, add game context.
	if req.GameID != "" {
		userID := c.GetString("user_id")
		data, err := sb.dbRequest("GET", "games", nil,
			"id=eq."+req.GameID+"&user_id=eq."+userID+"&select=pgn,result,color")
		if err == nil && len(data) > 2 {
			systemPrompt += "\n\nGame context: " + string(data)
		}
	}

	fullPrompt := systemPrompt + "\n\nUser: " + req.Message

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("Access-Control-Allow-Origin", "*")

	iter := model.GenerateContentStream(ctx, genai.Text(fullPrompt))
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
				chunk := fmt.Sprintf("%v", part)
				fmt.Fprintf(c.Writer, "data: {\"chunk\": %q}\n\n", chunk)
				c.Writer.Flush()
			}
		}
	}
	fmt.Fprintf(c.Writer, "data: [DONE]\n\n")
	c.Writer.Flush()
}
