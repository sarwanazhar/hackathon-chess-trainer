package main

import (
	"fmt"
	"strings"
)

// BuildSituationReport assembles the grounded prompt fed to Gemini.
// All facts come from Stockfish + board analysis — the LLM is only asked to explain, never to invent.
func BuildSituationReport(
	result StockfishResult,
	facts BoardFacts,
	userMoveSAN string,
	evalDrop float64,
	personality string,
) string {
	var sb strings.Builder

	// Eval sign
	evalStr := fmt.Sprintf("%.1f", result.Eval)
	if result.Eval > 0 {
		evalStr = "+" + evalStr
	}

	fmt.Fprintln(&sb, "### VERIFIED FACTS (do not contradict) ###")
	fmt.Fprintf(&sb, "Eval: %s (%s)\n", evalStr, evalLabel(result.Eval))

	bestMove := result.BestSAN
	if bestMove == "" {
		bestMove = result.BestMove
	}
	fmt.Fprintf(&sb, "Best Move: %s\n", bestMove)

	if len(result.PVLine) > 0 {
		fmt.Fprintf(&sb, "Top Line: %s\n", strings.Join(result.PVLine, " "))
	}

	fmt.Fprintln(&sb, "\nBoard Facts:")
	for _, h := range facts.HangingPieces {
		fmt.Fprintf(&sb, "- %s\n", h)
	}
	fmt.Fprintf(&sb, "- King Safety: %s\n", facts.KingSafety)
	fmt.Fprintf(&sb, "- %s\n", facts.MaterialDiff)

	if userMoveSAN != "" {
		grade := moveGrade(evalDrop)
		fmt.Fprintf(&sb, "\nUser played: %s | Eval drop: %.1f (%s)\n", userMoveSAN, evalDrop, grade)
	}

	fmt.Fprintln(&sb, "\n### TASK ###")
	fmt.Fprintf(&sb, "You are a %s chess coach.\n", personalityLabel(personality))
	fmt.Fprintf(&sb, "Using ONLY the facts above (do not invent moves or positions), explain in 2-3 sentences why %s is the best move. Be direct.\n", bestMove)

	return sb.String()
}

func personalityLabel(p string) string {
	if p == "roast" {
		return "roast comedian"
	}
	return "supportive Grandmaster"
}
