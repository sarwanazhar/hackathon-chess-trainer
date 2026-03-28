"use client";

import React, { useEffect, useRef, useCallback } from 'react';

import { Chessground } from 'chessground';

import { Chess } from 'chess.js';

import type { Key } from 'chessground/types'; // <-- Imported Key type



import 'chessground/assets/chessground.base.css';

import 'chessground/assets/chessground.brown.css';

import 'chessground/assets/chessground.cburnett.css';



interface GameBoardProps {

  onMove: (move: string) => void;

  isPlaying: boolean;

  externalFen?: string;

  evaluation?: number;

  playerColor?: 'white' | 'black';

}



export default function GameBoard({ onMove, isPlaying, externalFen, evaluation, playerColor = 'white' }: GameBoardProps) {

  const containerRef = useRef<HTMLDivElement>(null);

  // Single source of truth: always driven by externalFen from server

  const chess = useRef(new Chess());

  const cg = useRef<any>(null);

  // Track whether user has moved locally but server hasn't confirmed yet

  const pendingUserMove = useRef<string | null>(null);



  const getDests = useCallback((chessInstance: Chess) => {

    // Typed the map specifically using Chessground's Key type

    const dests = new Map<Key, Key[]>();

    chessInstance.moves({ verbose: true }).forEach(m => {

      const from = m.from as Key;

      const to = m.to as Key;

      if (!dests.has(from)) dests.set(from, []);

      dests.get(from)!.push(to);

    });

    return dests;

  }, []);



  // Initialize Chessground once

  useEffect(() => {

    if (!containerRef.current) return;



    const cgInstance = Chessground(containerRef.current, {

      orientation: playerColor,

      fen: chess.current.fen(),

      turnColor: 'white',

      movable: {

        free: false,

        color: playerColor,

        dests: getDests(chess.current),

        showDests: true,

      },

      draggable: { enabled: true },

      animation: { enabled: true, duration: 200 },

      highlight: { lastMove: true, check: true },

      events: {

        move: (orig, dest) => {

          // Optimistically apply the move locally for smooth UX

          const move = chess.current.move({

            from: orig as string,

            to: dest as string,

            promotion: 'q',

          });



          if (move) {

            const uci = `${orig}${dest}`;

            pendingUserMove.current = uci;



            // Lock the board while waiting for server confirmation

            cgInstance.set({

              turnColor: chess.current.turn() === 'w' ? 'white' : 'black',

              check: chess.current.inCheck() ? (chess.current.turn() === 'w' ? 'white' : 'black') : undefined,

              movable: { color: undefined, dests: new Map() },

            });



            onMove(uci);

          } else {

            // Invalid move — reset board to current chess state

            cgInstance.set({ fen: chess.current.fen() });

          }

        },

      },

    });



    cg.current = cgInstance;



    const handleResize = () => {

      if (cgInstance) cgInstance.set({});

    };

    window.addEventListener('resize', handleResize);



    return () => {

      window.removeEventListener('resize', handleResize);

      if (cgInstance) cgInstance.destroy();

    };

  }, []); // eslint-disable-line react-hooks/exhaustive-deps



  // Sync board when server sends a new FEN (authoritative state)

  useEffect(() => {

    if (!cg.current || !externalFen) return;



    const currentFen = chess.current.fen();

    if (externalFen === currentFen) return; // No change needed



    // Load the authoritative server FEN

    chess.current.load(externalFen);

    pendingUserMove.current = null;



    const turn = chess.current.turn() === 'w' ? 'white' : 'black';

    const isUserTurn = turn === playerColor;



    cg.current.set({

      fen: chess.current.fen(),

      turnColor: turn,

      check: chess.current.inCheck() ? turn : undefined,

      movable: {

        color: isPlaying && isUserTurn ? playerColor : undefined,

        dests: isPlaying && isUserTurn ? getDests(chess.current) : new Map(),

      },

    });

  }, [externalFen, isPlaying, playerColor, getDests]);



  // Update movability when isPlaying changes (without reloading FEN)

  useEffect(() => {

    if (!cg.current) return;

    if (externalFen) return; // handled by above effect



    const turn = chess.current.turn() === 'w' ? 'white' : 'black';

    const isUserTurn = turn === playerColor;



    cg.current.set({

      movable: {

        color: isPlaying && isUserTurn ? playerColor : undefined,

        dests: isPlaying && isUserTurn ? getDests(chess.current) : new Map(),

      },

    });

  }, [isPlaying]); // eslint-disable-line react-hooks/exhaustive-deps



  // Eval bar calculation: clamp to [-10, +10] and map to 0–100%

  const evalPercent = evaluation !== undefined

    ? Math.min(Math.max(50 + evaluation * 5, 0), 100)

    : 50;



  const evalDisplay = evaluation !== undefined

    ? (evaluation > 0 ? `+${evaluation.toFixed(1)}` : evaluation.toFixed(1))

    : '0.0';



  return (

    <div className="w-full h-full flex flex-col items-center justify-center p-2 gap-3">

      <div

        ref={containerRef}

        className="w-full max-w-[90vw] max-h-[90vw] sm:max-w-[560px] sm:max-h-[560px] aspect-square shadow-2xl border-2 border-[#2a2f3a] rounded-sm"

        style={{ background: '#212121' }}

      />



      {/* Evaluation Bar */}

      <div className="w-full max-w-[560px] flex flex-col gap-1">

        <div className="h-2.5 bg-[#1a1f2a] rounded-full overflow-hidden relative border border-[#30363d]">

          <div className="absolute inset-0 bg-[#374151]" />

          <div

            className="h-full bg-[#e2e8f0] transition-all duration-700 ease-out rounded-full"

            style={{ width: `${evalPercent}%` }}

          />

          {/* Center line */}

          <div className="absolute top-0 bottom-0 left-1/2 w-px bg-[#6b7280]/40" />

        </div>

        <div className="flex items-center justify-between text-[10px] font-mono text-[#6b7280] px-0.5">

          <span>White</span>

          <span className={`font-bold ${evaluation !== undefined && evaluation > 0.3 ? 'text-[#e2e8f0]' : evaluation !== undefined && evaluation < -0.3 ? 'text-[#6b7280]' : 'text-[#9ca3af]'}`}>

            {evalDisplay}

          </span>

          <span>Black</span>

        </div>

      </div>

    </div>

  );

}