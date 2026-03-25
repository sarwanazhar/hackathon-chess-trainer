package routes

import (
	"backend/controllers"

	"github.com/gin-gonic/gin"
)

// SetupRoutes sets up all the routes for the application
func SetupRoutes(r *gin.Engine) {
	// Game routes
	r.GET("/game", controllers.GameHandler)
}
