package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
)

// HandleGetPuzzles returns personalized puzzles from the user's blunders,
// topped up from the general pool if fewer than 3 are available.
func HandleGetPuzzles(c *gin.Context) {
	userID := c.GetString("user_id")
	theme := c.Query("theme")
	limit, _ := strconv.Atoi(c.DefaultQuery("limit", "5"))
	if limit <= 0 {
		limit = 5
	}

	// Fetch user-specific puzzles from missed_moves.
	q := fmt.Sprintf("user_id=eq.%s&order=next_review_at.asc&limit=%d", userID, limit)
	if theme != "" {
		q += "&theme=eq." + url.QueryEscape(theme)
	}

	userPuzzles := fetchPuzzlesFromMissedMoves(q)

	// Fill remainder from general pool if fewer than 3 personal puzzles.
	if len(userPuzzles) < 3 {
		remaining := limit - len(userPuzzles)
		poolQ := fmt.Sprintf("user_id=is.null&limit=%d", remaining)
		if theme != "" {
			poolQ += "&theme=eq." + url.QueryEscape(theme)
		}
		data, err := sb.dbRequest("GET", "puzzles", nil, poolQ)
		if err == nil {
			var pool []Puzzle
			json.Unmarshal(data, &pool)
			userPuzzles = append(userPuzzles, pool...)
		}
	}

	c.JSON(http.StatusOK, userPuzzles)
}

// fetchPuzzlesFromMissedMoves queries missed_moves and converts rows to Puzzle shape.
func fetchPuzzlesFromMissedMoves(query string) []Puzzle {
	data, err := sb.dbRequest("GET", "missed_moves", nil, query)
	if err != nil {
		return nil
	}
	var rows []struct {
		ID       string  `json:"id"`
		FEN      string  `json:"fen"`
		BestMove string  `json:"best_move"`
		EvalDrop float64 `json:"eval_drop"`
		Theme    string  `json:"theme"`
	}
	if err := json.Unmarshal(data, &rows); err != nil {
		return nil
	}
	puzzles := make([]Puzzle, 0, len(rows))
	for _, r := range rows {
		diff := 1
		if r.EvalDrop > 3 {
			diff = 3
		} else if r.EvalDrop > 1.5 {
			diff = 2
		}
		puzzles = append(puzzles, Puzzle{
			ID:         r.ID,
			FEN:        r.FEN,
			Solution:   []string{r.BestMove},
			Theme:      r.Theme,
			Difficulty: diff,
		})
	}
	return puzzles
}

type CompleteRequest struct {
	PuzzleID    string `json:"puzzle_id" binding:"required"`
	Solved      bool   `json:"solved"`
	TimeTakenMS int    `json:"time_taken_ms"`
}

// HandlePuzzleComplete records a puzzle attempt and schedules the next review.
// Intervals grow with each successful solve: 1d → 3d → 7d → 14d → 30d.
// A failed attempt always schedules a 24-hour retry.
func HandlePuzzleComplete(c *gin.Context) {
	var req CompleteRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Fetch current attempt count for interval calculation.
	var attemptCount int
	data, err := sb.dbRequest("GET", "missed_moves", nil,
		"id=eq."+req.PuzzleID+"&select=attempt_count")
	if err == nil {
		var rows []struct {
			AttemptCount int `json:"attempt_count"`
		}
		if json.Unmarshal(data, &rows) == nil && len(rows) > 0 {
			attemptCount = rows[0].AttemptCount
		}
	}

	srsIntervals := []time.Duration{
		1 * 24 * time.Hour,
		3 * 24 * time.Hour,
		7 * 24 * time.Hour,
		14 * 24 * time.Hour,
		30 * 24 * time.Hour,
	}

	var nextReview time.Time
	if !req.Solved {
		nextReview = time.Now().Add(24 * time.Hour)
	} else {
		idx := attemptCount
		if idx >= len(srsIntervals) {
			idx = len(srsIntervals) - 1
		}
		nextReview = time.Now().Add(srsIntervals[idx])
	}

	updates := map[string]interface{}{
		"next_review_at": nextReview.Format(time.RFC3339),
		"attempt_count":  attemptCount + 1,
	}

	_, err = sb.dbRequest("PATCH", "missed_moves", updates, "id=eq."+req.PuzzleID)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "DB update failed"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "next_review": nextReview.Format(time.RFC3339)})
}
