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
	// Load .env only if running locally (PORT not set)
	loadEnvIfLocal()

	var req AnalyzeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	userID := c.GetString("user_id")

	var uciMoves []string

	if req.PGN != "" {
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

	// Initialize Gemini client once for the whole analysis.
	var aiModel *genai.GenerativeModel
	apiKey := os.Getenv("GEMINI_API_KEY")
	analysisCtx, analysisCancel := context.WithTimeout(context.Background(), 120*time.Second)
	defer analysisCancel()
	if apiKey != "" {
		aiClient, err := genai.NewClient(analysisCtx, option.WithAPIKey(apiKey))
		if err == nil {
			defer aiClient.Close()
			m := aiClient.GenerativeModel("gemma-3-27b-it")
			m.SetTemperature(0.2)
			aiModel = m
		}
	}
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

		drop := 0.0
		if i%2 == 0 {
			drop = prevEval - evalNow
		} else {
			drop = evalNow - prevEval
		}

		grade := moveGrade(drop)

		// Generate per-move comment for blunders and mistakes.
		var comment string
		if aiModel != nil && (grade == "blunder" || grade == "mistake") {
			bestSAN := result.BestSAN
			if bestSAN == "" {
				bestSAN = result.BestMove
			}
			prompt := fmt.Sprintf(
				"Chess move %s was a %s (%.1f pawn drop). Best was %s. In one sentence, explain what went wrong.",
				moveSAN, grade, drop, bestSAN,
			)
			commentCtx, commentCancel := context.WithTimeout(context.Background(), 8*time.Second)
			resp, err := aiModel.GenerateContent(commentCtx, genai.Text(prompt))
			commentCancel()
			if err == nil && len(resp.Candidates) > 0 && resp.Candidates[0].Content != nil {
				for _, p := range resp.Candidates[0].Content.Parts {
					comment = fmt.Sprintf("%v", p)
					break
				}
			}
		}

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
			Move:    moveSAN,
			Eval:    evalNow,
			Grade:   grade,
			Comment: comment,
		})

		prevEval = evalNow
	}

	// Collect weak areas.
	var weakAreas []string
	for theme := range themeCounts {
		weakAreas = append(weakAreas, theme)
	}

	// Generate summary.
	summary := "Analysis complete."
	if aiModel != nil {
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
		resp, err := aiModel.GenerateContent(analysisCtx, genai.Text(prompt))
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

	if req.GameID != "" {
		sb.UpdateGame(req.GameID, map[string]interface{}{"analyzed": true})
	}

	c.JSON(http.StatusOK, AnalyzeResponse{
		Moves:     analyses,
		Summary:   summary,
		WeakAreas: weakAreas,
	})
}
