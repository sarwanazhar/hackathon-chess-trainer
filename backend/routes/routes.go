package routes

import (
	"backend/controllers"
	"backend/middleware"

	"github.com/gin-gonic/gin"
)

// SetupRoutes sets up all the routes for the application
func SetupRoutes(r *gin.Engine) {
	// CORS middleware
	r.Use(func(c *gin.Context) {
		c.Writer.Header().Set("Access-Control-Allow-Origin", "*")
		c.Writer.Header().Set("Access-Control-Allow-Credentials", "true")
		c.Writer.Header().Set("Access-Control-Allow-Headers", "Content-Type, Content-Length, Accept-Encoding, X-CSRF-Token, Authorization, accept, origin, Cache-Control, X-Requested-With")
		c.Writer.Header().Set("Access-Control-Allow-Methods", "POST, OPTIONS, GET, PUT, DELETE")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	// Game routes (public)
	r.GET("/game", controllers.GameHandler)

	// Chat routes (protected)
	chat := r.Group("/chat")
	chat.Use(middleware.ClerkAuthMiddleware())
	{
		chat.GET("", controllers.ChatHandler)
	}

	// Protected sample route for testing
	protected := r.Group("/api")
	protected.Use(middleware.ClerkAuthMiddleware())
	{
		protected.GET("/protected", func(c *gin.Context) {
			userID, exists := middleware.GetUserIDFromContext(c)
			if !exists {
				c.JSON(500, gin.H{"error": "User ID not found in context"})
				return
			}
			c.JSON(200, gin.H{
				"message": "This is a protected route",
				"userID":  userID,
				"status":  "authenticated",
			})
		})
	}
}
