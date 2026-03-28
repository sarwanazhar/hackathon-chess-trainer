package main

import (
	"fmt"
	"strings"
	"testing"
)

// TestSeedPuzzles inserts the general puzzle pool (user_id=NULL).
// Run once: go test -v -run TestSeedPuzzles
// Safe to re-run — skips if pool already has 10+ puzzles.
func TestSeedPuzzles(t *testing.T) {
	// Load .env only if running locally (PORT not set)
	loadEnvIfLocal()

	sb := NewSupabaseClient()
	// Check existing count
	data, err := sb.dbRequest("GET", "puzzles", nil, "user_id=is.null&select=id")
	if err != nil {
		t.Fatalf("could not check existing puzzles: %v", err)
	}
	if !strings.Contains(string(data), "[]") && strings.Count(string(data), `"id"`) >= 10 {
		t.Logf("Pool already has puzzles, skipping seed.")
		return
	}

	type PuzzleSeed struct {
		FEN        string   `json:"fen"`
		Solution   []string `json:"solution"`
		Theme      string   `json:"theme"`
		Difficulty int      `json:"difficulty"`
		Source     string   `json:"source"`
	}

	puzzles := []PuzzleSeed{
		// --- Checkmate in 1 (difficulty 1) ---
		{
			FEN:        "r1bqkb1r/pppp1ppp/2n2n2/4p2Q/2B1P3/8/PPPP1PPP/RNB1K1NR w KQkq - 4 4",
			Solution:   []string{"Qxf7#"},
			Theme:      "checkmate",
			Difficulty: 1,
			Source:     "seed",
		},
		{
			FEN:        "6k1/5ppp/8/8/8/8/8/4R2K w - - 0 1",
			Solution:   []string{"Re8#"},
			Theme:      "checkmate",
			Difficulty: 1,
			Source:     "seed",
		},
		{
			FEN:        "r5rk/5p1p/5R2/4B3/8/8/7P/7K w - - 0 1",
			Solution:   []string{"Rh6#"},
			Theme:      "checkmate",
			Difficulty: 1,
			Source:     "seed",
		},
		// --- Forks (difficulty 2) ---
		{
			FEN:        "r1bqkbnr/pppp1ppp/8/4p3/3nP3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
			Solution:   []string{"Nxe5"},
			Theme:      "fork",
			Difficulty: 2,
			Source:     "seed",
		},
		{
			FEN:        "r1bqkb1r/ppp2ppp/2np1n2/4p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 6",
			Solution:   []string{"Nd5"},
			Theme:      "fork",
			Difficulty: 2,
			Source:     "seed",
		},
		{
			FEN:        "r3k2r/ppp2ppp/2n5/3qp3/1b1P4/2NB1N2/PPP2PPP/R1BQK2R w KQkq - 0 1",
			Solution:   []string{"Nxe5"},
			Theme:      "fork",
			Difficulty: 2,
			Source:     "seed",
		},
		// --- Pins (difficulty 2) ---
		{
			FEN:        "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQK2R w KQkq - 0 1",
			Solution:   []string{"Bxf7+"},
			Theme:      "pin",
			Difficulty: 2,
			Source:     "seed",
		},
		{
			FEN:        "rnb1kbnr/pppp1ppp/8/4p3/5PPq/8/PPPPP2P/RNBQKBNR w KQkq - 1 3",
			Solution:   []string{"g3"},
			Theme:      "pin",
			Difficulty: 2,
			Source:     "seed",
		},
		// --- Back rank (difficulty 2) ---
		{
			FEN:        "6k1/5ppp/8/8/8/8/5PPP/1R4K1 w - - 0 1",
			Solution:   []string{"Rb8#"},
			Theme:      "back_rank",
			Difficulty: 2,
			Source:     "seed",
		},
		{
			FEN:        "2r3k1/5ppp/8/8/8/8/5PPP/R5K1 w - - 0 1",
			Solution:   []string{"Ra8"},
			Theme:      "back_rank",
			Difficulty: 2,
			Source:     "seed",
		},
		// --- Skewers (difficulty 2) ---
		{
			FEN:        "r5k1/5ppp/8/8/8/8/8/R3B2K w - - 0 1",
			Solution:   []string{"Ba5"},
			Theme:      "skewer",
			Difficulty: 2,
			Source:     "seed",
		},
		// --- Discovered attacks (difficulty 2) ---
		{
			FEN:        "r1bqk2r/pppp1ppp/2n2n2/2b1p3/2B1P3/3P1N2/PPP2PPP/RNBQ1RK1 b kq - 0 1",
			Solution:   []string{"Nxe4"},
			Theme:      "discovered_attack",
			Difficulty: 2,
			Source:     "seed",
		},
		// --- Endgame (difficulty 3) ---
		{
			FEN:        "8/8/8/4k3/8/4K3/4P3/8 w - - 0 1",
			Solution:   []string{"e4"},
			Theme:      "endgame",
			Difficulty: 1,
			Source:     "seed",
		},
		{
			FEN:        "8/8/8/8/8/3k4/3p4/3K4 b - - 0 1",
			Solution:   []string{"d1=Q+"},
			Theme:      "promotion",
			Difficulty: 1,
			Source:     "seed",
		},
		{
			FEN:        "8/1P6/8/8/8/8/8/k1K5 w - - 0 1",
			Solution:   []string{"b8=Q"},
			Theme:      "promotion",
			Difficulty: 1,
			Source:     "seed",
		},
		// --- Tactics combinations (difficulty 3) ---
		{
			FEN:        "r2q1rk1/ppp2ppp/2n1bn2/3pp3/1bB1P3/2NP1N1P/PPP2PP1/R1BQ1RK1 w - - 0 1",
			Solution:   []string{"Bxf7+", "Rxf7", "Ng5"},
			Theme:      "combination",
			Difficulty: 3,
			Source:     "seed",
		},
		{
			FEN:        "r1bqkb1r/ppp2ppp/2np1n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQ1RK1 w kq - 0 1",
			Solution:   []string{"Ng5", "d5", "Nxf7"},
			Theme:      "combination",
			Difficulty: 3,
			Source:     "seed",
		},
		// --- Zwischenzug / in-between (difficulty 3) ---
		{
			FEN:        "r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQR1K1 w - - 0 1",
			Solution:   []string{"Bxf7+", "Kxf7", "Ng5+"},
			Theme:      "zwischenzug",
			Difficulty: 3,
			Source:     "seed",
		},
		// --- Simple tactics (difficulty 1) ---
		{
			FEN:        "rnbqkbnr/ppp1pppp/8/3p4/4P3/8/PPPP1PPP/RNBQKBNR w KQkq - 0 2",
			Solution:   []string{"exd5"},
			Theme:      "capture",
			Difficulty: 1,
			Source:     "seed",
		},
		{
			FEN:        "r1bqkbnr/pppp1ppp/2n5/4p3/4P3/5N2/PPPP1PPP/RNBQKB1R w KQkq - 2 3",
			Solution:   []string{"Bb5"},
			Theme:      "pin",
			Difficulty: 1,
			Source:     "seed",
		},
	}

	inserted := 0
	for i, p := range puzzles {
		body := map[string]interface{}{
			"fen":        p.FEN,
			"solution":   p.Solution,
			"theme":      p.Theme,
			"difficulty": p.Difficulty,
			"source":     p.Source,
			// user_id omitted → NULL (general pool)
		}
		data, err := sb.dbRequest("POST", "puzzles", body, "")
		if err != nil || strings.Contains(string(data), `"code"`) {
			t.Logf("puzzle %d failed: %v / %s", i+1, err, string(data))
			continue
		}
		inserted++
	}
	t.Logf("PASS - seeded %d/%d puzzles into general pool", inserted, len(puzzles))
	fmt.Printf("\nSeeded %d puzzles.\n", inserted)
}
