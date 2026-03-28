package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"regexp"
	"strings"
	"testing"
	"time"

	"github.com/notnil/chess"
)

// LichessPuzzleResp is the shape returned by GET /api/puzzle/next (and /api/puzzle/{id}).
type LichessPuzzleResp struct {
	Game struct {
		PGN string `json:"pgn"`
	} `json:"game"`
	Puzzle struct {
		ID         string   `json:"id"`
		Rating     int      `json:"rating"`
		Solution   []string `json:"solution"` // UCI moves
		Themes     []string `json:"themes"`
		InitialPly int      `json:"initialPly"`
	} `json:"puzzle"`
}

// lichessThemeMap converts Lichess theme names to our theme schema.
var lichessThemeMap = map[string]string{
	"mateIn1":          "checkmate",
	"mateIn2":          "checkmate",
	"mateIn3":          "checkmate",
	"mateIn4":          "checkmate",
	"mateIn5":          "checkmate",
	"backRankMate":     "back_rank",
	"fork":             "fork",
	"pin":              "pin",
	"skewer":           "skewer",
	"discoveredAttack": "discovered_attack",
	"doubleCheck":      "combination",
	"deflection":       "combination",
	"sacrifice":        "combination",
	"trappedPiece":     "combination",
	"endgame":          "endgame",
	"promotion":        "promotion",
	"underPromotion":   "promotion",
	"opening":          "opening",
	"middlegame":       "tactic",
	"long":             "tactic",
	"short":            "tactic",
}

// mapLichessTheme returns the first matching theme in our schema, or "tactic" as fallback.
func mapLichessTheme(themes []string) string {
	for _, t := range themes {
		if mapped, ok := lichessThemeMap[t]; ok {
			return mapped
		}
	}
	return "tactic"
}

// lichessDifficulty converts a Lichess puzzle rating to our 1-3 difficulty scale.
func lichessDifficulty(rating int) int {
	switch {
	case rating < 1300:
		return 1
	case rating < 1800:
		return 2
	default:
		return 3
	}
}

// fetchLichessPuzzle calls the Lichess puzzle API for a single puzzle filtered by theme.
// theme is a Lichess theme name e.g. "fork", "mateIn1". Pass "" for any theme.
func fetchLichessPuzzle(theme string) (*LichessPuzzleResp, error) {
	url := "https://lichess.org/api/puzzle/next"
	if theme != "" {
		url += "?themes=" + theme
	}
	req, err := http.NewRequest("GET", url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Accept", "application/json")

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("lichess API returned status %d", resp.StatusCode)
	}

	var p LichessPuzzleResp
	if err := json.NewDecoder(resp.Body).Decode(&p); err != nil {
		return nil, fmt.Errorf("JSON decode error: %v", err)
	}
	if p.Puzzle.ID == "" || len(p.Puzzle.Solution) == 0 {
		return nil, fmt.Errorf("empty puzzle in response")
	}
	return &p, nil
}

// getFENAtPly replays PGN moves up to `ply` half-moves and returns the resulting FEN.
// Handles PGN move text with or without move numbers and annotations.
func getFENAtPly(pgnMoves string, ply int) (string, error) {
	// Strip annotations {comment}, move numbers "1." "1...", result markers, and symbols
	cleaned := regexp.MustCompile(`\{[^}]*\}`).ReplaceAllString(pgnMoves, "")
	cleaned = regexp.MustCompile(`\d+\.+`).ReplaceAllString(cleaned, "")
	for _, result := range []string{"1-0", "0-1", "1/2-1/2", "*"} {
		cleaned = strings.ReplaceAll(cleaned, result, "")
	}
	cleaned = regexp.MustCompile(`[?!]+`).ReplaceAllString(cleaned, "")

	tokens := strings.Fields(cleaned)
	if ply > len(tokens) {
		return "", fmt.Errorf("initialPly %d exceeds game length %d", ply, len(tokens))
	}

	game := chess.NewGame()
	for i := 0; i < ply; i++ {
		san := tokens[i]
		found := false
		for _, m := range game.ValidMoves() {
			moveSAN := chess.AlgebraicNotation{}.Encode(game.Position(), m)
			if moveSAN == san {
				game.Move(m)
				found = true
				break
			}
		}
		if !found {
			return "", fmt.Errorf("could not apply SAN move %q at ply %d", san, i)
		}
	}
	return game.Position().String(), nil
}

// convertUCISolutionToSAN converts a slice of UCI moves to SAN starting from fenStr.
// Each move is applied in sequence — the full solution chain is returned.
func convertUCISolutionToSAN(fenStr string, uciMoves []string) ([]string, error) {
	opt, err := chess.FEN(fenStr)
	if err != nil {
		return nil, fmt.Errorf("invalid FEN: %v", err)
	}
	game := chess.NewGame(opt)
	sanMoves := make([]string, 0, len(uciMoves))

	for _, uciStr := range uciMoves {
		var matched *chess.Move
		for _, m := range game.ValidMoves() {
			if m.String() == uciStr {
				matched = m
				break
			}
		}
		if matched == nil {
			return nil, fmt.Errorf("UCI move %q not valid in current position", uciStr)
		}
		san := chess.AlgebraicNotation{}.Encode(game.Position(), matched)
		sanMoves = append(sanMoves, san)
		game.Move(matched)
	}
	return sanMoves, nil
}

// TestSeedLichessPuzzles fetches puzzles from the Lichess open puzzle database
// and seeds them into the general puzzle pool (user_id = NULL).
//
// Run once:
//
//	go test -v -run TestSeedLichessPuzzles -timeout 300s
//
// Safe to re-run — skips if 100+ Lichess puzzles already exist.
func TestSeedLichessPuzzles(t *testing.T) {
	// Load .env only if running locally (PORT not set)
	loadEnvIfLocal()

	sbClient := NewSupabaseClient()
	// Skip if already seeded.
	existing, err := sbClient.dbRequest("GET", "puzzles", nil, "source=eq.lichess&select=id")
	if err != nil {
		t.Fatalf("could not check existing Lichess puzzles: %v", err)
	}
	if strings.Count(string(existing), `"id"`) >= 100 {
		t.Logf("Already have 100+ Lichess puzzles — skipping seed.")
		return
	}

	// Lichess theme → how many puzzles to fetch for each.
	themeFetch := []struct {
		theme string
		count int
	}{
		{"mateIn1", 20},
		{"mateIn2", 15},
		{"fork", 20},
		{"pin", 15},
		{"skewer", 10},
		{"backRankMate", 10},
		{"endgame", 15},
		{"promotion", 10},
		{"discoveredAttack", 10},
		{"deflection", 10},
	}

	seen := map[string]bool{} // Lichess puzzle IDs we've already processed
	inserted := 0
	skipped := 0
	failed := 0

	for _, tf := range themeFetch {
		t.Logf("─── Fetching %d puzzles for theme: %s", tf.count, tf.theme)
		fetched := 0
		attempts := 0
		maxAttempts := tf.count * 4 // allow up to 4x retries for duplicates/errors

		for fetched < tf.count && attempts < maxAttempts {
			attempts++
			time.Sleep(400 * time.Millisecond) // be polite to Lichess API

			p, err := fetchLichessPuzzle(tf.theme)
			if err != nil {
				t.Logf("  API error: %v", err)
				continue
			}

			if seen[p.Puzzle.ID] {
				skipped++
				continue
			}
			seen[p.Puzzle.ID] = true

			// Extract FEN at the puzzle start position.
			fen, err := getFENAtPly(p.Game.PGN, p.Puzzle.InitialPly)
			if err != nil {
				t.Logf("  [SKIP] %s — FEN extraction failed: %v", p.Puzzle.ID, err)
				failed++
				continue
			}

			// Convert UCI solution to SAN.
			sanSolution, err := convertUCISolutionToSAN(fen, p.Puzzle.Solution)
			if err != nil {
				t.Logf("  [SKIP] %s — solution conversion failed: %v", p.Puzzle.ID, err)
				failed++
				continue
			}

			ourTheme := mapLichessTheme(p.Puzzle.Themes)
			difficulty := lichessDifficulty(p.Puzzle.Rating)

			body := map[string]interface{}{
				"fen":        fen,
				"solution":   sanSolution,
				"theme":      ourTheme,
				"difficulty": difficulty,
				"source":     "lichess",
				// user_id omitted → NULL (general pool)
			}

			data, err := sbClient.dbRequest("POST", "puzzles", body, "")
			if err != nil || strings.Contains(string(data), `"code"`) {
				t.Logf("  [FAIL] DB insert for %s: %v / %s", p.Puzzle.ID, err, string(data))
				failed++
				continue
			}

			inserted++
			fetched++
			t.Logf("  [OK] %s | rating=%d | theme=%s(%s) | solution=%v",
				p.Puzzle.ID, p.Puzzle.Rating, ourTheme, tf.theme, sanSolution)
		}
	}

	t.Logf("\n══════════════════════════════════")
	t.Logf("Seed complete: %d inserted | %d skipped (dup) | %d failed", inserted, skipped, failed)
	fmt.Printf("\nLichess seed: %d puzzles added to general pool.\n", inserted)
}
