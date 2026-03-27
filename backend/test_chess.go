package main

import (
	"fmt"

	"github.com/notnil/chess"
)

func main() {
	game := chess.NewGame()
	// White moves e2e4
	moves := game.ValidMoves()
	for _, m := range moves {
		if m.String() == "e2e4" {
			game.Move(m)
			break
		}
	}
	fmt.Printf("After e2e4, FEN: %s\n", game.FEN())
	fmt.Printf("Black valid moves:\n")
	for _, m := range game.ValidMoves() {
		fmt.Printf("- %s\n", m.String())
	}
}
