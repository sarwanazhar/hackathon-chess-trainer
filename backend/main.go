package main

import (
	"log"
	"net/http"
	"os"
	"strings"
	"sync"

	"github.com/clerk/clerk-sdk-go/v2"
	clerkjwt "github.com/clerk/clerk-sdk-go/v2/jwt"
	"github.com/gin-gonic/gin"
	"github.com/gorilla/websocket"
	"github.com/joho/godotenv"
	"github.com/notnil/chess/uci"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

// sb is the package-level Supabase client shared by all handlers.
var sb *SupabaseClient

// puzzleEng is a shared Stockfish engine for puzzle coaching (P2).
var (
	puzzleEng   *uci.Engine
	puzzleEngMu sync.Mutex
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("Note: .env file not found, using system environment variables")
	}

	clerk.SetKey(os.Getenv("CLERK_SECRET_KEY"))
	sb = NewSupabaseClient()

	// Initialize shared Stockfish engine for puzzle coaching.
	sfPath := os.Getenv("STOCKFISH_PATH")
	if sfPath == "" {
		sfPath = "./stockfish/stockfish-windows-x86-64-avx2.exe"
	}
	if eng, err := uci.New(sfPath); err == nil {
		eng.Run(uci.CmdUCI, uci.CmdIsReady)
		puzzleEng = eng
	} else {
		log.Printf("Warning: shared Stockfish engine failed to start: %v", err)
	}

	r := gin.Default()

	// CORS — allow all origins (hackathon / local testing).
	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", "*")
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Authorization, Content-Type")
		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}
		c.Next()
	})

	// WebSocket — auth via ?token= query param.
	r.GET("/ws/game", func(c *gin.Context) {
		token := c.Query("token")
		claims, err := clerkjwt.Verify(c.Request.Context(), &clerkjwt.VerifyParams{Token: token})
		if err != nil {
			c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			return
		}
		HandleGame(c, claims.Subject)
	})

	// REST — auth via Authorization: Bearer <jwt> header.
	api := r.Group("/api", authMiddleware())
	api.POST("/profile", HandleSyncProfile)
	api.GET("/profile", HandleGetProfile)
	api.POST("/chat", HandleChat)
	api.POST("/analyze", HandleAnalyze)
	api.GET("/puzzles", HandleGetPuzzles)
	api.POST("/puzzles/complete", HandlePuzzleComplete)
	api.POST("/puzzles/attempt", HandlePuzzleAttempt)
	api.POST("/puzzles/coach", HandlePuzzleCoach)
	api.GET("/learn", HandleLearn)
	api.GET("/games", HandleGetGames)

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
		claims, err := clerkjwt.Verify(c.Request.Context(), &clerkjwt.VerifyParams{Token: token})
		if err != nil {
			c.AbortWithStatusJSON(http.StatusUnauthorized, gin.H{"error": "invalid token"})
			return
		}
		c.Set("user_id", claims.Subject)
		c.Next()
	}
}
