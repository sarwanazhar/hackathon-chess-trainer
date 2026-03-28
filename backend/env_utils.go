package main

import (
	"log"

	"github.com/joho/godotenv"
)

// loadEnvIfLocal loads .env if present — does NOT override existing system env vars.
func loadEnvIfLocal() {
	err := godotenv.Load()
	if err != nil {
		log.Println("⚠️  No .env file found, continuing with system env...")
	} else {
		log.Println("✅ .env loaded")
	}
}
