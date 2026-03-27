"use client";
import React, { useState, useEffect } from "react";
import { Chess } from "chess.js";
import { Chessboard } from "react-chessboard";

export default function TestGame() {
  const [game, setGame] = useState(new Chess());
  const [isClient, setIsClient] = useState(false);

  // Wait for the browser to be ready
  useEffect(() => {
    setIsClient(true);
  }, []);

  function onDrop(sourceSquare: string, targetSquare: string) {
    try {
      const move = game.move({
        from: sourceSquare,
        to: targetSquare,
        promotion: "q",
      });

      if (move === null) return false;

      // SUCCESS: Create a new instance to force React 19 to re-render
      setGame(new Chess(game.fen()));
      return true;
    } catch (e) {
      return false;
    }
  }

  if (!isClient) return <div>Loading Client Assets...</div>;

  return (
    <div className="flex flex-col items-center justify-center h-screen bg-slate-900 text-white gap-4">
      <h1 className="text-2xl font-bold text-blue-400">DEBUG_MODE: LOCAL_CHESS</h1>
      
      <div className="w-[500px] aspect-square shadow-2xl border-4 border-slate-700">
        <Chessboard 
          position={game.fen()} 
          onPieceDrop={onDrop} 
          boardOrientation="white"
        />
      </div>

      <div className="bg-slate-800 p-4 rounded font-mono text-xs">
        <p>Current FEN: {game.fen()}</p>
        <button 
          onClick={() => setGame(new Chess())}
          className="mt-4 bg-blue-600 px-4 py-2 rounded hover:bg-blue-500"
        >
          RESET_BOARD
        </button>
      </div>
    </div>
  );
}