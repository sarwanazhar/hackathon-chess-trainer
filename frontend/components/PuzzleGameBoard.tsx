"use client";
import React, { useEffect, useRef, useCallback } from 'react';
import { Chessground } from 'chessground';
import type { Key } from 'chessground/types';
import { Chess } from 'chess.js';

import 'chessground/assets/chessground.base.css';
import 'chessground/assets/chessground.brown.css';
import 'chessground/assets/chessground.cburnett.css';

interface GameBoardProps {
  onMove: (move: string) => void;
  isPlaying: boolean;
  externalFen?: string;
  evaluation?: number;
  size?: number;
  style?: React.CSSProperties;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getDests(chess: Chess): Map<Key, Key[]> {
  const dests = new Map<Key, Key[]>();
  chess.moves({ verbose: true }).forEach(m => {
    if (!dests.has(m.from as Key)) dests.set(m.from as Key, []);
    dests.get(m.from as Key)!.push(m.to as Key);
  });
  return dests;
}

// ─── Component ────────────────────────────────────────────────────────────────
// Design contract:
//   - The PARENT owns all chess logic. This component is a pure display layer.
//   - `externalFen` is the source of truth for what position to show.
//   - When the user drags a piece, `onMove(uciString)` fires and the component
//     immediately reverts its internal visual state. The parent decides whether
//     the move was legal/correct and feeds back a new `externalFen`.
//   - Remounting this component (via a `key` change on the parent) is the
//     recommended way to hard-reset the board to a new position.

export default function GameBoard({
  onMove,
  isPlaying,
  externalFen,
  evaluation,
  size,
  style,
}: GameBoardProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  // Single Chess instance that mirrors externalFen — never mutated by move logic
  const chessRef = useRef(new Chess(externalFen));
  const cgRef    = useRef<ReturnType<typeof Chessground> | null>(null);

  // Keep a stable ref to onMove so the Chessground closure never goes stale
  const onMoveRef = useRef(onMove);
  useEffect(() => { onMoveRef.current = onMove; }, [onMove]);

  // Keep a stable ref to isPlaying for the same reason
  const isPlayingRef = useRef(isPlaying);
  useEffect(() => { isPlayingRef.current = isPlaying; }, [isPlaying]);

  // ── Initialize Chessground once ──────────────────────────────────────────────
  useEffect(() => {
    if (!containerRef.current) return;

    const chess = chessRef.current;
    const turn  = chess.turn() === 'w' ? 'white' : 'black';

    const cg = Chessground(containerRef.current, {
      fen:       chess.fen(),
      turnColor: turn,
      check:     chess.inCheck(),
      movable: {
        free:  false,
        color: isPlayingRef.current ? turn : undefined,
        dests: getDests(chess),
        showDests: true,
      },
      draggable: { enabled: true },
      animation: { enabled: true, duration: 150 },
      highlight: { lastMove: true, check: true },
      events: {
        move: (orig, dest) => {
          // Fire the callback — parent will validate and send back a new externalFen
          const uci = `${orig}${dest}`;
          onMoveRef.current(uci);

          // Immediately revert the board to the last known good position.
          // The parent will push back the correct FEN (via externalFen changing
          // and the sync effect below) whether the move was right or wrong.
          // This prevents the board from showing a position the parent hasn't confirmed.
          const currentChess = chessRef.current;
          const currentTurn  = currentChess.turn() === 'w' ? 'white' : 'black';
          cg.set({
            fen:       currentChess.fen(),
            turnColor: currentTurn,
            check:     currentChess.inCheck(),
            movable: {
              color: isPlayingRef.current ? currentTurn : undefined,
              dests: getDests(currentChess),
            },
          });
        },
      },
    });

    cgRef.current = cg;

    return () => {
      cg.destroy();
      cgRef.current = null;
    };
  }, []); // intentionally empty — remount via key prop to reset

  // ── Sync to externalFen changes ──────────────────────────────────────────────
  // This is the only place that actually updates the board position.
  useEffect(() => {
    const cg    = cgRef.current;
    const chess = chessRef.current;
    if (!cg || !externalFen) return;

    // Load the new position into our mirror chess instance
    chess.load(externalFen);

    const turn = chess.turn() === 'w' ? 'white' : 'black';

    cg.set({
      fen:       chess.fen(),
      turnColor: turn,
      check:     chess.inCheck(),
      movable: {
        color: isPlaying ? turn : undefined,
        dests: getDests(chess),
      },
    });
  }, [externalFen, isPlaying]);

  return (
    <div
      className="w-full h-full flex flex-col items-center justify-center p-2"
      style={style}
    >
      <div
        ref={containerRef}
        style={
          size
            ? { width: size, height: size }
            : undefined
        }
        className={
          size
            ? 'shadow-2xl border-4 border-[#262a31] rounded-sm bg-[#212121]'
            : 'w-full max-w-[90vw] max-h-[90vw] sm:max-w-[550px] sm:max-h-[550px] aspect-square shadow-2xl border-4 border-[#262a31] rounded-sm bg-[#212121]'
        }
      />

      {evaluation !== undefined && (
        <div className="mt-4 w-full max-w-[550px] h-3 bg-[#262a31] rounded-full overflow-hidden relative border border-[#414754]/30">
          <div className="absolute inset-0 bg-[#ef4444]" />
          <div
            className="h-full bg-[#10b981] transition-all duration-500 ease-out"
            style={{
              width: `${Math.min(Math.max(50 + (evaluation * 5), 0), 100)}%`,
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