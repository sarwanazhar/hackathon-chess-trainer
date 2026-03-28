package main

import (
	"log"
	"os"

	"github.com/joho/godotenv"
)

// loadEnvIfLocal loads .env only if running locally (PORT not set)
func loadEnvIfLocal() {
	if os.Getenv("PORT") == "8989" {
		err := godotenv.Load()
		if err != nil {
			log.Println("⚠️  No .env file found, continuing...")
		} else {
			log.Println("✅ .env loaded")
		}
	}
}
