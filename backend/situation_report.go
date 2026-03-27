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
	level string,
	opening string,
	fen string,
	opponentReply string,
	userColor string, // "white" or "black"
) string {
	var sb strings.Builder

	// System instruction — must appear before facts so it frames everything.
	fmt.Fprintf(&sb, "### SYSTEM ###\n")
	fmt.Fprintf(&sb, "You are a %s chess coach. %s\n", personalityLabel(personality), levelInstruction(level))
	fmt.Fprintf(&sb, "The player is playing as %s.\n", userColor)
	fmt.Fprintln(&sb, "RULES YOU MUST FOLLOW:")
	fmt.Fprintln(&sb, "- Use ONLY the information in VERIFIED FACTS below.")
	fmt.Fprintln(&sb, "- Do NOT name any square, piece, or move that is not explicitly listed in VERIFIED FACTS.")
	fmt.Fprintln(&sb, "- Do NOT invent threats, tactics, variations, or continuations not shown below.")
	fmt.Fprintln(&sb, "- Do NOT reference pawn structure beyond what is stated below.")
	fmt.Fprintln(&sb, "- If a fact is not listed, do not mention it.")

	fmt.Fprintln(&sb, "\n### VERIFIED FACTS (do not contradict or extend) ###")

	if fen != "" {
		fmt.Fprintf(&sb, "Position (FEN): %s\n", fen)
	}

	evalStr := fmt.Sprintf("%.1f", result.Eval)
	if result.Eval > 0 {
		evalStr = "+" + evalStr
	}
	fmt.Fprintf(&sb, "Eval: %s (%s)\n", evalStr, evalLabel(result.Eval))

	if opening != "" {
		fmt.Fprintf(&sb, "Opening: %s\n", opening)
	}

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
	fmt.Fprintf(&sb, "- Pawn Structure: %s\n", facts.PawnStructure)

	if userMoveSAN != "" {
		grade := moveGrade(evalDrop)
		fmt.Fprintf(&sb, "\nUser played: %s | Eval drop: %.1f (%s)\n", userMoveSAN, evalDrop, grade)
		if opponentReply != "" && evalDrop > 0.3 {
			fmt.Fprintf(&sb, "Opponent's best punishing reply: %s\n", opponentReply)
		}
	}

	fmt.Fprintln(&sb, "\n### TASK ###")
	if userMoveSAN != "" && evalDrop > 0.3 {
		fmt.Fprintf(&sb, "In exactly 3 sentences:\n")
		fmt.Fprintf(&sb, "1. State concretely what %s allowed (use only facts above).\n", userMoveSAN)
		fmt.Fprintf(&sb, "2. Explain why %s is the correct move instead.\n", bestMove)
		fmt.Fprintf(&sb, "3. Name the concrete threat or gain %s creates.\n", bestMove)
	} else {
		fmt.Fprintf(&sb, "In 2 sentences, explain why %s is the best move, using only the facts above.", bestMove)
	}
	if opening != "" {
		fmt.Fprintf(&sb, " Reference the %s only if directly relevant.", opening)
	}

	return sb.String()
}

func personalityLabel(p string) string {
	if p == "roast" {
		return "roast comedian"
	}
	return "supportive Grandmaster"
}

func levelInstruction(level string) string {
	switch level {
	case "beginner":
		return "The player is a BEGINNER: use simple words, no jargon, explain what pieces do and why the move helps. Short sentences."
	case "advanced":
		return "The player is ADVANCED: assume expert knowledge, focus on tactical/strategic nuances, pawn structure, and tempo. Be concise and technical."
	default:
		return "The player is INTERMEDIATE: use standard chess terminology with clear strategic/tactical reasoning."
	}
}
