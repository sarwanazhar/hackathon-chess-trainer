package main

import (
	"strings"
	"testing"

	"github.com/notnil/chess"
)

// TestDetectTheme verifies phase detection thresholds.
func TestDetectTheme(t *testing.T) {
	tests := []struct {
		halfMove int
		want     string
	}{
		{0, "opening"}, {19, "opening"},
		{20, "tactic"}, {59, "tactic"},
		{60, "endgame"}, {100, "endgame"},
	}
	for _, tt := range tests {
		got := detectTheme(tt.halfMove)
		if got != tt.want {
			t.Errorf("detectTheme(%d) = %q, want %q", tt.halfMove, got, tt.want)
		}
	}
}

// TestPassedPawnNoOpponentPawns verifies that a pawn is detected as passed
// even when the opponent has no pawns at all.
func TestPassedPawnNoOpponentPawns(t *testing.T) {
	// White king e1, white pawn e5, black king e8 — white pawn is passed.
	opt, err := chess.FEN("4k3/8/8/4P3/8/8/8/4K3 w - - 0 1")
	if err != nil {
		t.Fatal(err)
	}
	pos := chess.NewGame(opt).Position()
	notes := PawnStructureAnalysis(pos)
	if notes == "No notable pawn weaknesses" {
		t.Errorf("expected passed pawn to be detected when opponent has no pawns, got %q", notes)
	}
	if !strings.Contains(notes, "passed pawn") {
		t.Errorf("expected 'passed pawn' in notes, got %q", notes)
	}
}

// TestMoveGrade verifies move grade thresholds.
func TestMoveGrade(t *testing.T) {
	tests := []struct {
		drop float64
		want string
	}{
		{0.0, "good"}, {0.2, "good"},
		{0.31, "inaccuracy"}, {0.8, "inaccuracy"},
		{0.81, "mistake"}, {1.5, "mistake"},
		{1.51, "blunder"}, {3.0, "blunder"},
	}
	for _, tt := range tests {
		got := moveGrade(tt.drop)
		if got != tt.want {
			t.Errorf("moveGrade(%.2f) = %q, want %q", tt.drop, got, tt.want)
		}
	}
}
