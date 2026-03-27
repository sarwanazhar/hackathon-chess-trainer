"use client";
import React, { useEffect, useRef, useCallback } from 'react';
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

interface GameBoardProps {
  onMove: (move: string) => void;
  isPlaying: boolean;
  externalFen?: string;
  evaluation?: number;
}

export default function GameBoard({ onMove, isPlaying, externalFen, evaluation }: GameBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chess = useRef(new Chess(externalFen));
  const cg = useRef<any>(null);

  // Debug evaluation prop
  useEffect(() => {
    console.log("📊 GameBoard evaluation prop:", evaluation);
  }, [evaluation]);

  // Helper to calculate legal moves for Chessground
  const getDests = useCallback(() => {
    const dests = new Map();
    chess.current.moves({ verbose: true }).forEach(m => {
      if (!dests.has(m.from)) dests.set(m.from, []);
      dests.get(m.from).push(m.to);
    });
    return dests;
  }, []);

  // Initialize Chessground
  useEffect(() => {
    if (!containerRef.current) return;

    cg.current = Chessground(containerRef.current, {
      fen: chess.current.fen(),
      movable: {
        free: false,
        color: 'white',
        dests: getDests(),
      },
      events: {
        move: (orig, dest) => {
          const uciMove = `${orig}${dest}`;
          const move = chess.current.move({ from: orig as any, to: dest as any, promotion: 'q' });

          if (move) {
            onMove(uciMove);
            // Immediately lock board and update visuals after user move
            cg.current.set({
              check: chess.current.inCheck(),
              movable: { color: 'none' }
            });
          }
        }
      }
    });

    const handleResize = () => {
      if (cg.current) {
        cg.current.set({
          fen: chess.current.fen(),
          movable: {
            color: isPlaying ? (chess.current.turn() === 'w' ? 'white' : 'black') : 'none',
            dests: getDests(),
          }
        });
      }
    };
    window.addEventListener('resize', handleResize);

    return () => {
      cg.current?.destroy();
      window.removeEventListener('resize', handleResize);
    };
  }, [onMove, getDests]);

  // Sync board when FEN or Playing state changes
  useEffect(() => {
    if (cg.current) {
      // Update internal chess logic if FEN changed from outside
      if (externalFen && externalFen !== chess.current.fen()) {
        chess.current.load(externalFen);
      }

      const turn = chess.current.turn() === 'w' ? 'white' : 'black';

      cg.current.set({
        fen: chess.current.fen(),
        turnColor: turn,
        check: chess.current.inCheck(),
        movable: {
          // If isPlaying is true, allow the current turn's color to move
          color: isPlaying ? turn : 'none',
          dests: getDests(),
        }
      });
    }
  }, [externalFen, isPlaying, getDests]);

  return (
    <div className="w-full h-full flex flex-col items-center justify-center p-2">
      <div
        ref={containerRef}
        className="w-full max-w-[90vw] max-h-[90vw] sm:max-w-[550px] sm:max-h-[550px] aspect-square shadow-2xl border-4 border-[#262a31] rounded-sm bg-[#212121]"
      />
      {evaluation !== undefined && (
        <div className="mt-4 w-full max-w-[550px] h-3 bg-[#262a31] rounded-full overflow-hidden relative border border-[#414754]/30">
          {/* Black Bar (Background) */}
          <div className="absolute inset-0 bg-[#ef4444]" />

          {/* White Bar (Foreground) */}
          <div
            className="h-full bg-[#10b981] transition-all duration-500 ease-out"
            style={{
              // Convert eval to percentage: 0 is -10 (Black wins), 100 is +10 (White wins)
              // 50% is 0.0 (Equal)
              width: `${Math.min(Math.max(50 + (evaluation * 5), 0), 100)}%`
            }}
          />

          <div className="absolute inset-0 flex items-center justify-between px-3 text-[10px] font-bold uppercase tracking-tighter text-white drop-shadow-md pointer-events-none">
            <span>White</span>
            <span>{evaluation > 0 ? `+${evaluation.toFixed(1)}` : evaluation.toFixed(1)}</span>
            <span>Black</span>
          </div>
        </div>
      )}
    </div>
  );
}