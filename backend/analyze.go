package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/generative-ai-go/genai"
	"github.com/notnil/chess"
	"github.com/notnil/chess/uci"
	"google.golang.org/api/option"
)

type AnalyzeRequest struct {
	GameID string `json:"game_id"`
	PGN    string `json:"pgn"`
}

type MoveAnalysis struct {
	Move    string  `json:"move"`
	Eval    float64 `json:"eval"`
	Grade   string  `json:"grade"`
	Comment string  `json:"comment,omitempty"`
}

type AnalyzeResponse struct {
	Moves     []MoveAnalysis `json:"moves"`
	Summary   string         `json:"summary"`
	WeakAreas []string       `json:"weak_areas"`
}

// HandleAnalyze replays a saved game, grades every move, and saves blunders.
func HandleAnalyze(c *gin.Context) {
	var req AnalyzeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")

	var uciMoves []string

	if req.PGN != "" {
		// Parse PGN directly — no DB lookup needed.
		pgn, err := chess.PGN(strings.NewReader(req.PGN))
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid PGN: " + err.Error()})
			return
		}
		pgnGame := chess.NewGame(pgn)
		for _, m := range pgnGame.Moves() {
			uciMoves = append(uciMoves, m.String())
		}
	} else if req.GameID != "" {
		// Fetch game from DB.
		data, err := sb.dbRequest("GET", "games", nil,
			"id=eq."+req.GameID+"&user_id=eq."+userID+"&select=moves,pgn")
		if err != nil || len(data) < 3 {
			c.JSON(http.StatusNotFound, gin.H{"error": "game not found"})
			return
		}

		var rows []struct {
			Moves []string `json:"moves"`
			PGN   string   `json:"pgn"`
		}
		if err := json.Unmarshal(data, &rows); err != nil || len(rows) == 0 {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to parse game"})
			return
		}
		uciMoves = rows[0].Moves
	} else {
		c.JSON(http.StatusBadRequest, gin.H{"error": "game_id or pgn required"})
		return
	}

	if len(uciMoves) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "no moves in game"})
		return
	}

	stockfishPath := os.Getenv("STOCKFISH_PATH")
	if stockfishPath == "" {
		stockfishPath = "./stockfish/stockfish-windows-x86-64-avx2.exe"
	}
	eng, err := uci.New(stockfishPath)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "stockfish init failed"})
		return
	}
	defer eng.Close()
	eng.Run(uci.CmdUCI, uci.CmdIsReady)

	// Replay and analyse each move.
	game := chess.NewGame()
	var analyses []MoveAnalysis
	themeCounts := map[string]int{}
	prevEval := 0.0

	for i, uciMove := range uciMoves {
		var move *chess.Move
		for _, m := range game.ValidMoves() {
			if m.String() == uciMove {
				move = m
				break
			}
		}
		if move == nil {
			break
		}

		moveSAN := chess.AlgebraicNotation{}.Encode(game.Position(), move)
		game.Move(move)

		result := GetAnalysis(eng, game, 12)
		evalNow := result.Eval

		// Drop from perspective of the player who just moved.
		// Even half-moves = White moved, odd = Black moved.
		drop := 0.0
		if i%2 == 0 { // White's move
			drop = prevEval - evalNow
		} else { // Black's move
			drop = evalNow - prevEval
		}

		grade := moveGrade(drop)

		if grade == "blunder" || grade == "mistake" {
			theme := detectTheme(i)
			themeCounts[theme]++
			sb.SaveMissedMove(MissedMove{
				UserID:   userID,
				GameID:   req.GameID,
				FEN:      game.Position().String(),
				UserMove: uciMove,
				BestMove: result.BestMove,
				EvalDrop: drop,
				Theme:    theme,
			})
		}

		analyses = append(analyses, MoveAnalysis{
			Move:  moveSAN,
			Eval:  evalNow,
			Grade: grade,
		})

		prevEval = evalNow
	}

	// Collect weak areas.
	var weakAreas []string
	for theme := range themeCounts {
		weakAreas = append(weakAreas, theme)
	}

	// Generate a summary with Gemini.
	summary := "Analysis complete."
	apiKey := os.Getenv("GEMINI_API_KEY")
	if apiKey != "" {
		ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
		defer cancel()

		aiClient, err := genai.NewClient(ctx, option.WithAPIKey(apiKey))
		if err == nil {
			defer aiClient.Close()
			model := aiClient.GenerativeModel("gemma-3-27b-it")
			model.SetTemperature(0.2)

			blunderCount := 0
			for _, a := range analyses {
				if a.Grade == "blunder" || a.Grade == "mistake" {
					blunderCount++
				}
			}

			prompt := fmt.Sprintf(
				"Chess game: %d moves, %d mistakes/blunders, weak areas: %v. "+
					"Write a 2-sentence coaching summary. Be direct and specific.",
				len(analyses), blunderCount, weakAreas,
			)
			resp, err := model.GenerateContent(ctx, genai.Text(prompt))
			if err == nil && len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
				var parts []string
				for _, p := range resp.Candidates[0].Content.Parts {
					parts = append(parts, fmt.Sprintf("%v", p))
				}
				if len(parts) > 0 {
					summary = parts[0]
				}
			}
		}
	}

	// Mark game as analysed.
	if req.GameID != "" {
		sb.UpdateGame(req.GameID, map[string]interface{}{"analyzed": true})
	}

	c.JSON(http.StatusOK, AnalyzeResponse{
		Moves:     analyses,
		Summary:   summary,
		WeakAreas: weakAreas,
	})
}
