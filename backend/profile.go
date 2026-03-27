package main

import (
	"net/http"

	"github.com/gin-gonic/gin"
)

// HandleSyncProfile — POST /api/profile
// Frontend calls this once after Clerk login to ensure a profile row exists.
func HandleSyncProfile(c *gin.Context) {
	userID := c.GetString("user_id")

	var req struct {
		Username string `json:"username"`
	}
	c.ShouldBindJSON(&req)
	if req.Username == "" {
		req.Username = "player"
	}

	if err := sb.UpsertProfile(userID, req.Username); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to sync profile"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"user_id": userID, "username": req.Username})
}
