package main

import (
	"backend/routes"
	"log"

	"github.com/gin-gonic/gin"
)

func main() {
	r := gin.Default()

	// Setup routes
	routes.SetupRoutes(r)

	log.Println("🚀 God-Mode Chess Sensei starting on :8080...")
	if err := r.Run(":8080"); err != nil {
		log.Fatal("Failed to start server:", err)
	}
}
