package main

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
)

// HandleGetGames — GET /api/games
// Returns the user's game history, most recent first.
// Query params: limit (default 20, max 100).
func HandleGetGames(c *gin.Context) {
	userID := c.GetString("user_id")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "20"))
	if limit <= 0 || limit > 100 {
		limit = 20
	}

	games, err := sb.GetGames(userID, limit)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch games"})
		return
	}
	c.JSON(http.StatusOK, games)
}
