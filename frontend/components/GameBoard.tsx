"use client";
import React, { useEffect, useRef, useState } from 'react';
import { Chessground } from 'chessground';
import { Chess } from 'chess.js';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

interface GameBoardProps {
  onMove: (move: string) => void;
  isPlaying: boolean;
  externalFen?: string;
}

export default function GameBoard({ onMove, isPlaying, externalFen }: GameBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const chess = useRef(new Chess(externalFen));
  const cg = useRef<any>(null);

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
          // Convert to UCI format (e.g., "e2e4") for the Go backend
          const uciMove = `${orig}${dest}`;
          
          const move = chess.current.move({ from: orig, to: dest, promotion: 'q' });
          if (move) {
            onMove(uciMove);
            cg.current.set({
              check: chess.current.inCheck(),
              movable: { dests: getDests() }
            });
          }
        }
      }
    });

    const handleResize = () => cg.current?.redraw();
    window.addEventListener('resize', handleResize);

    return () => {
      cg.current?.destroy();
      window.removeEventListener('resize', handleResize);
    };
  }, []);

  useEffect(() => {
    if (externalFen && externalFen !== chess.current.fen()) {
      chess.current.load(externalFen);
      cg.current?.set({ 
        fen: externalFen,
        movable: { dests: getDests() }
      });
    }
  }, [externalFen]);

  function getDests() {
    const dests = new Map();
    chess.current.moves({ verbose: true }).forEach(m => {
      if (!dests.has(m.from)) dests.set(m.from, []);
      dests.get(m.from).push(m.to);
    });
    return dests;
  }

  return (
    <div className="w-full h-full flex items-center justify-center p-2">
      <div 
        ref={containerRef} 
        className="w-full max-w-[90vw] max-h-[90vw] sm:max-w-[550px] sm:max-h-[550px] aspect-square shadow-2xl border-4 border-[#262a31] rounded-sm bg-[#212121]"
      />
    </div>
  );
}