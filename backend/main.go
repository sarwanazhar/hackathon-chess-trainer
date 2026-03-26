package main

import (
	"log"
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// sb is the package-level Supabase client shared by all handlers.
var sb *SupabaseClient

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found, using system environment variables")
	}

	sb = NewSupabaseClient()

	r := gin.Default()

	// WebSocket — auth via ?token= query param.
	r.GET("/ws/game", func(c *gin.Context) {
		token := c.Query("token")
		userID, err := sb.VerifyJWT(token)
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		HandleGame(c, userID)
	})

	// Public auth routes — no JWT required.
	r.POST("/auth/register", HandleRegister)
	r.POST("/auth/login", HandleLogin)

	// REST — auth via Authorization: Bearer <jwt> header.
	api := r.Group("/api", authMiddleware())
	api.POST("/chat", HandleChat)
	api.POST("/analyze", HandleAnalyze)
	api.GET("/puzzles", HandleGetPuzzles)
	api.POST("/puzzles/complete", HandlePuzzleComplete)
	api.GET("/learn", HandleLearn)

	log.Println("Chess Trainer Backend starting on :8080...")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}

func authMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		auth := c.GetHeader("Authorization")
		token := strings.TrimPrefix(auth, "Bearer ")
		if token == "" || token == auth {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			return
		}
		userID, err := sb.VerifyJWT(token)
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set("user_id", userID)
		c.Next()
	}
}
