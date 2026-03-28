"use client";
import {
  Grid, Zap, Puzzle, User, Bot, Terminal,
  Clock, Brain, Shield, Target, CheckCircle,
  XCircle, ChevronRight, SkipForward, Lightbulb,
  RotateCcw, Trophy, Flame, Star,
} from "lucide-react";
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useState, useRef, useCallback } from "react";
import { Chess } from "chess.js";
import ReactMarkdown from "react-markdown";
import GameBoard from "@/components/PuzzleGameBoard";

// ─── Types ────────────────────────────────────────────────────────────────────
interface Puzzle {
  id: string;
  fen: string;
  solution: string[]; // SAN
  theme: string;
  difficulty: 1 | 2 | 3;
}

type MoveResult = "correct" | "wrong" | "idle";
type PuzzlePhase = "solving" | "correct" | "wrong" | "complete" | "gave_up";

// ─── Helpers ──────────────────────────────────────────────────────────────────
const difficultyLabel = (d: number) =>
  d === 1 ? "Beginner" : d === 2 ? "Intermediate" : "Advanced";

const difficultyColor = (d: number) =>
  d === 1 ? "#7bdb80" : d === 2 ? "#ffd700" : "#ff6b6b";

const formatTime = (s: number) => {
  const m = Math.floor(s / 60);
  return `${String(m).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;
};

// ─── Component ────────────────────────────────────────────────────────────────
export default function PuzzlesPage() {
  const { isLoaded, userId, getToken } = useAuth(); // FIX: get getToken directly from useAuth
  const { redirectToSignIn } = useClerk();

  // Puzzle state
  const [puzzles, setPuzzles]             = useState<Puzzle[]>([]);
  const [currentPuzzle, setCurrentPuzzle] = useState<Puzzle | null>(null);
  const [currentFen, setCurrentFen]       = useState<string>("");
  const [moveIndex, setMoveIndex]         = useState(0);
  const [phase, setPhase]                 = useState<PuzzlePhase>("solving");
  const [moveResult, setMoveResult]       = useState<MoveResult>("idle");
  const [streak, setStreak]               = useState(0);
  const [solvedCount, setSolvedCount]     = useState(0);

  // Force GameBoard to fully remount whenever the position changes.
  // GameBoard holds internal state and doesn't reliably sync to externalFen changes,
  // so we bump this key to tear it down and rebuild it from scratch.
  const [boardKey, setBoardKey] = useState(0);

  // FIX: store last wrong move UCI so coach endpoint gets proper data
  const [lastWrongMoveUci, setLastWrongMoveUci] = useState<string>("");
  const [lastBestMoveUci, setLastBestMoveUci]   = useState<string>("");

  // Move history display
  const [playedMoves, setPlayedMoves]     = useState<{ san: string; correct: boolean }[]>([]);

  // Coach
  const [coachText, setCoachText]         = useState("");
  const [isLoadingCoach, setIsLoadingCoach] = useState(false);
  const [showCoach, setShowCoach]         = useState(false);

  // Timer
  const [elapsed, setElapsed]             = useState(0);
  const [timerRunning, setTimerRunning]   = useState(false);
  const timerRef                          = useRef<ReturnType<typeof setInterval> | null>(null);
  const startTimeRef                      = useRef<number>(0);

  // Chess engine instance (tracks board state client-side)
  const chessRef = useRef(new Chess());

  // Board sizing
  const [boardSize, setBoardSize]   = useState(480);
  const mainRef                     = useRef<HTMLElement>(null);
  const boardContainerRef           = useRef<HTMLDivElement>(null);

  // ── Auth ────────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoaded && !userId) {
      redirectToSignIn({ signInFallbackRedirectUrl: "/puzzles" });
    }
  }, [isLoaded, userId, redirectToSignIn]);

  // ── Timer ───────────────────────────────────────────────────────────────────
  useEffect(() => {
    if (timerRunning) {
      startTimeRef.current = Date.now() - elapsed * 1000;
      timerRef.current = setInterval(() => {
        setElapsed(Math.floor((Date.now() - startTimeRef.current) / 1000));
      }, 500);
    } else {
      if (timerRef.current) clearInterval(timerRef.current);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [timerRunning]);

  // ── Board size ───────────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mainRef.current;
    if (!el) return;
    const observer = new ResizeObserver(entries => {
      for (const entry of entries) {
        const { width, height } = entry.contentRect;
        const available = Math.min(width - 32, height - 80);
        setBoardSize(Math.max(240, Math.floor(available)));
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // ── Load puzzles ────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!userId) return;
    (async () => {
      try {
        const token = await getToken(); // FIX: use getToken from useAuth directly
        const res   = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/puzzles?limit=10`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        const data: Puzzle[] = await res.json();
        setPuzzles(data);
        if (data.length > 0) beginPuzzle(data[0]);
      } catch (e) {
        console.error("Failed to load puzzles:", e);
      }
    })();
  }, [userId]);

  // ── Begin a puzzle ──────────────────────────────────────────────────────────
  const beginPuzzle = useCallback((puzzle: Puzzle) => {
    chessRef.current = new Chess(puzzle.fen);
    setCurrentPuzzle(puzzle);
    setCurrentFen(puzzle.fen);
    setBoardKey(k => k + 1); // force GameBoard remount with fresh starting FEN
    setMoveIndex(0);
    setPhase("solving");
    setMoveResult("idle");
    setPlayedMoves([]);
    setCoachText("");
    setShowCoach(false);
    setLastWrongMoveUci("");
    setLastBestMoveUci("");
    setElapsed(0);
    setTimerRunning(true);
  }, []);

  // ── Handle user move (called by GameBoard) ──────────────────────────────────
  const handleMove = useCallback(async (moveStr: string) => {
    if (!currentPuzzle || phase !== "solving") return;

    const chess = chessRef.current;

    // Snapshot the FEN *before* applying the move — this is what we send to the API
    const fenBeforeMove = chess.fen();

    // Try to apply the move — GameBoard may pass SAN or UCI
    let applied;
    try {
      applied = chess.move(moveStr);
    } catch {
      try {
        applied = chess.move({ from: moveStr.slice(0, 2), to: moveStr.slice(2, 4), promotion: moveStr[4] ?? "q" });
      } catch {
        return;
      }
    }
    if (!applied) return;

    const uciMove = applied.from + applied.to + (applied.promotion ?? "");
    const sanMove = applied.san;

    // FIX: update currentFen immediately after the user's move so the board
    // reflects the new position regardless of what the server says.
    const fenAfterUserMove = chess.fen();
    setCurrentFen(fenAfterUserMove);
    setBoardKey(k => k + 1);

    try {
      const token = await getToken(); // FIX: use getToken from useAuth
      const res   = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/puzzles/attempt`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          puzzle_id:  currentPuzzle.id,
          move:       uciMove,
          move_index: moveIndex,
          fen:        fenBeforeMove, // FIX: send the FEN *before* the move
        }),
      });
      const data = await res.json();

      if (data.correct) {
        setPlayedMoves(prev => [...prev, { san: sanMove, correct: true }]);
        setMoveResult("correct");
        setTimeout(() => setMoveResult("idle"), 800);

        if (data.complete) {
          // ✅ Puzzle solved — board is already showing the correct final position
          setTimerRunning(false);
          setPhase("complete");
          setStreak(s => s + 1);
          setSolvedCount(s => s + 1);
          recordComplete(currentPuzzle.id, true);
        } else {
          // Apply opponent's response after a short delay
          const nextIdx = data.next_index ?? moveIndex + 2;
          setMoveIndex(nextIdx);

          setTimeout(() => {
            try {
              let oppApplied;
              // Try SAN first
              try {
                oppApplied = chess.move(data.opponent_move_san);
              } catch {
                // Fallback to UCI
                const uci = data.opponent_move_uci ?? "";
                oppApplied = chess.move({
                  from: uci.slice(0, 2),
                  to:   uci.slice(2, 4),
                  promotion: uci[4] ?? "q",
                });
              }
              if (oppApplied) {
                // FIX: update the FEN after the opponent's response
                setCurrentFen(chess.fen());
                setBoardKey(k => k + 1);
              }
            } catch (e) {
              console.error("Failed to apply opponent move:", e);
            }
          }, 400);
        }
      } else {
        // ❌ Wrong move — undo it on the client
        chess.undo();
        // FIX: revert the FEN we optimistically set above
        setCurrentFen(fenBeforeMove);
        setBoardKey(k => k + 1);

        // Store UCI values for the coach endpoint
        setLastWrongMoveUci(uciMove);
        setLastBestMoveUci(data.best_move_uci ?? "");

        setPlayedMoves(prev => [...prev, { san: sanMove, correct: false }]);
        setMoveResult("wrong");
        setTimerRunning(false);
        setPhase("wrong");
        setStreak(0);
      }
    } catch (err) {
      console.error("Attempt error:", err);
      chess.undo();
      // FIX: also revert the optimistic FEN update on network error
      setCurrentFen(fenBeforeMove);
      setBoardKey(k => k + 1);
    }
  }, [currentPuzzle, phase, moveIndex, getToken]);
  // FIX: removed `currentFen` from deps — we capture it synchronously from chess.fen() before the move

  // ── Get coach help after a wrong move ────────────────────────────────────────
  const fetchCoach = useCallback(async () => {
    if (!currentPuzzle || phase !== "wrong") return;
    setIsLoadingCoach(true);
    setShowCoach(true);
    setCoachText("");

    try {
      const token = await getToken(); // FIX: use getToken from useAuth
      const res = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/puzzles/coach`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({
          fen:        currentFen,            // current board position (already reverted)
          wrong_move: lastWrongMoveUci,      // FIX: use stored UCI from attempt response
          best_move:  lastBestMoveUci || currentPuzzle.solution[moveIndex], // FIX: prefer UCI from server
          theme:      currentPuzzle.theme,
        }),
      });
      const data = await res.json();
      setCoachText(data.coaching ?? "No coaching available.");
    } catch {
      setCoachText("Sorry, coaching is unavailable right now.");
    } finally {
      setIsLoadingCoach(false);
    }
  }, [currentPuzzle, phase, currentFen, moveIndex, lastWrongMoveUci, lastBestMoveUci, getToken]);

  // ── Give up ──────────────────────────────────────────────────────────────────
  const giveUp = useCallback(() => {
    if (!currentPuzzle) return;
    setTimerRunning(false);
    setPhase("gave_up");
    setStreak(0);
    recordComplete(currentPuzzle.id, false);
  }, [currentPuzzle]);

  // ── Next puzzle ──────────────────────────────────────────────────────────────
  const nextPuzzle = useCallback(() => {
    if (!currentPuzzle) return;
    const idx  = puzzles.findIndex(p => p.id === currentPuzzle.id);
    const next = puzzles[idx + 1];
    if (next) {
      beginPuzzle(next);
    }
  }, [currentPuzzle, puzzles, beginPuzzle]);

  // ── Record completion ─────────────────────────────────────────────────────────
  const recordComplete = async (puzzleId: string, solved: boolean) => {
    try {
      const token = await getToken(); // FIX: use getToken from useAuth
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/puzzles/complete`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ puzzle_id: puzzleId, solved, time_taken_ms: elapsed * 1000 }),
      });
    } catch {}
  };

  // ── Retry puzzle ─────────────────────────────────────────────────────────────
  const retryPuzzle = useCallback(() => {
    if (currentPuzzle) beginPuzzle(currentPuzzle);
  }, [currentPuzzle, beginPuzzle]);

  // ── Guards ───────────────────────────────────────────────────────────────────
  if (!isLoaded) return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0D1117] text-[#8b909f]">
      <div className="animate-pulse font-mono text-sm tracking-widest uppercase">Verifying Session…</div>
    </div>
  );
  if (!userId) return null;

  const isFinished = phase === "complete" || phase === "gave_up";

  return (
    <>
      <style>{`
        @keyframes flashGreen { 0%,100%{background:transparent} 30%{background:rgba(123,219,128,0.12)} }
        @keyframes flashRed   { 0%,100%{background:transparent} 30%{background:rgba(255,107,107,0.12)} }
        @keyframes shakeX     { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-6px)} 60%{transform:translateX(6px)} }
        @keyframes popIn      { from{opacity:0;transform:scale(.94)} to{opacity:1;transform:scale(1)} }
        .flash-green { animation: flashGreen .7s ease; }
        .flash-red   { animation: flashRed .7s ease, shakeX .4s ease; }
        .pop-in      { animation: popIn .25s ease; }
      `}</style>

      <div className="h-screen w-screen bg-[#0D1117] text-[#dfe2eb] overflow-hidden flex flex-col min-h-0 select-none">

        {/* ── Top bar ──────────────────────────────────────────────────────── */}
        <header className="h-14 flex-shrink-0 bg-[#0a0e14] border-b border-[#414754]/20
                           flex items-center justify-between px-5 z-50">
          <div className="flex items-center gap-5">
            <span className="font-bold text-[#dfe2eb] tracking-tight flex items-center gap-2">
              <Puzzle size={16} className="text-[#acc7ff]" />
              Chess Senpai
            </span>

            <nav className="hidden md:flex items-center gap-1">
              {[
                { href: "/dashboard", icon: <Grid size={15}/>,  label: "Board" },
                { href: "/chat",      icon: <Zap  size={15}/>,  label: "Chat"  },
                { href: "/puzzles",   icon: <Puzzle size={15}/>, label: "Puzzles", active: true },
              ].map(({ href, icon, label, active }) => (
                <a key={href} href={href}
                   className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-mono transition-colors ${
                     active ? "bg-[#acc7ff]/10 text-[#acc7ff]" : "text-[#8b909f] hover:text-[#dfe2eb]"
                   }`}>
                  {icon}{label}
                </a>
              ))}
            </nav>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            bg-[#1a1f26] border border-[#414754]/20 text-xs font-mono">
              <Flame size={13} className={streak > 0 ? "text-orange-400" : "text-[#414754]"} />
              <span className={streak > 0 ? "text-orange-400" : "text-[#414754]"}>{streak}</span>
            </div>
            <div className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            bg-[#1a1f26] border border-[#414754]/20 text-xs font-mono text-[#7bdb80]">
              <Trophy size={13} />
              <span>{solvedCount}</span>
            </div>
            <div className="flex items-center gap-1.5 px-2.5 py-1 rounded-full
                            bg-[#1a1f26] border border-[#414754]/20 text-xs font-mono text-[#acc7ff]">
              <Clock size={13} />
              <span className="tabular-nums w-10 text-right">{formatTime(elapsed)}</span>
            </div>
            <UserButton afterSwitchSessionUrl="/puzzles" />
          </div>
        </header>

        {/* ── Body ─────────────────────────────────────────────────────────── */}
        <div className="flex flex-1 overflow-hidden min-h-0">

          {/* ── LEFT PANEL ─ puzzle info ─────────────────────────────────── */}
          <aside className="w-[260px] flex-shrink-0 bg-[#0a0e14] border-r border-[#414754]/15
                            flex flex-col overflow-y-auto">
            {currentPuzzle ? (
              <>
                <div className="p-5 border-b border-[#414754]/15">
                  <div className="text-[10px] font-mono text-[#414754] uppercase tracking-widest mb-3">
                    Tactical Puzzle
                  </div>

                  <div className="flex items-center justify-between mb-3">
                    <span className="text-xs font-mono text-[#8b909f] capitalize flex items-center gap-1.5">
                      <Target size={13} className="text-[#acc7ff]" />
                      {currentPuzzle.theme}
                    </span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full"
                          style={{
                            color: difficultyColor(currentPuzzle.difficulty),
                            background: `${difficultyColor(currentPuzzle.difficulty)}18`,
                          }}>
                      {difficultyLabel(currentPuzzle.difficulty)}
                    </span>
                  </div>

                  <div className="text-[10px] font-mono text-[#414754] mb-1.5 flex justify-between">
                    <span>Progress</span>
                    <span>{Math.min(moveIndex, currentPuzzle.solution.length)} / {currentPuzzle.solution.length}</span>
                  </div>
                  <div className="h-1 bg-[#1a1f26] rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#acc7ff] rounded-full transition-all duration-500"
                      style={{ width: `${(Math.min(moveIndex, currentPuzzle.solution.length) / currentPuzzle.solution.length) * 100}%` }}
                    />
                  </div>
                </div>

                <div className="px-5 py-4 border-b border-[#414754]/15">
                  <div className={`text-sm font-semibold flex items-center gap-2 ${
                    phase === "complete"  ? "text-[#7bdb80]" :
                    phase === "wrong"     ? "text-[#ff6b6b]"  :
                    phase === "gave_up"   ? "text-[#8b909f]"  :
                    "text-[#dfe2eb]"
                  }`}>
                    {phase === "solving"  && <><Brain size={15} className="text-[#acc7ff]" /> Find the best move</>}
                    {phase === "correct"  && <><CheckCircle size={15} /> Correct! Keep going…</>}
                    {phase === "wrong"    && <><XCircle size={15} /> Wrong move</>}
                    {phase === "complete" && <><CheckCircle size={15} /> Puzzle solved!</>}
                    {phase === "gave_up"  && <><SkipForward size={15} /> Solution revealed</>}
                  </div>
                </div>

                <div className="px-5 py-4 flex-1 border-b border-[#414754]/15">
                  <div className="text-[10px] font-mono text-[#414754] uppercase tracking-widest mb-3">
                    Move history
                  </div>
                  <div className="space-y-1">
                    {playedMoves.map((m, i) => (
                      <div key={i} className="flex items-center gap-2 text-xs font-mono pop-in">
                        <span className="text-[#414754] w-4">{i + 1}.</span>
                        {m.correct
                          ? <CheckCircle size={12} className="text-[#7bdb80] flex-shrink-0" />
                          : <XCircle     size={12} className="text-[#ff6b6b] flex-shrink-0" />
                        }
                        <span className={m.correct ? "text-[#7bdb80]" : "text-[#ff6b6b]"}>{m.san}</span>
                      </div>
                    ))}
                    {playedMoves.length === 0 && (
                      <div className="text-[#414754] text-xs font-mono italic">No moves yet</div>
                    )}
                  </div>
                </div>

                {isFinished && (
                  <div className="px-5 py-4 border-b border-[#414754]/15 pop-in">
                    <div className="text-[10px] font-mono text-[#414754] uppercase tracking-widest mb-2">
                      Solution
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {currentPuzzle.solution.map((m, i) => (
                        <span key={i} className="text-xs font-mono px-2 py-0.5 rounded bg-[#acc7ff]/10
                                                  border border-[#acc7ff]/20 text-[#acc7ff]">
                          {i % 2 === 0 ? `${Math.floor(i / 2) + 1}.` : ""} {m}
                        </span>
                      ))}
                    </div>
                  </div>
                )}

                <div className="p-4 space-y-2">
                  {phase === "solving" && (
                    <button onClick={giveUp}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                                       bg-[#1a1f26] border border-[#414754]/20
                                       text-xs font-mono text-[#8b909f]
                                       hover:border-[#414754]/50 hover:text-[#dfe2eb] transition-all">
                      <SkipForward size={14} /> Give up
                    </button>
                  )}

                  {phase === "wrong" && (
                    <>
                      <button onClick={fetchCoach}
                              disabled={isLoadingCoach}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                                         bg-[#acc7ff] text-[#0D1117] text-xs font-bold
                                         hover:opacity-90 transition-all disabled:opacity-60">
                        <Bot size={14} /> {isLoadingCoach ? "Analyzing…" : "Coach me"}
                      </button>
                      <button onClick={retryPuzzle}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                                         bg-[#1a1f26] border border-[#414754]/20
                                         text-xs font-mono text-[#8b909f]
                                         hover:border-[#414754]/50 hover:text-[#dfe2eb] transition-all">
                        <RotateCcw size={14} /> Retry puzzle
                      </button>
                      <button onClick={giveUp}
                              className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                                         bg-[#1a1f26] border border-[#414754]/20
                                         text-xs font-mono text-[#8b909f]
                                         hover:border-[#414754]/50 hover:text-[#dfe2eb] transition-all">
                        <SkipForward size={14} /> Show solution
                      </button>
                    </>
                  )}

                  {isFinished && (
                    <button onClick={nextPuzzle}
                            className="w-full flex items-center justify-center gap-2 px-4 py-2 rounded-lg
                                       bg-[#acc7ff] text-[#0D1117] text-sm font-bold
                                       hover:opacity-90 active:scale-95 transition-all">
                      Next puzzle <ChevronRight size={16} />
                    </button>
                  )}
                </div>
              </>
            ) : (
              <div className="flex-1 flex items-center justify-center">
                <div className="text-[#414754] text-xs font-mono animate-pulse">Loading puzzles…</div>
              </div>
            )}
          </aside>

          {/* ── CENTRE — chessboard ──────────────────────────────────────── */}
          <main ref={mainRef} className={`flex-1 min-w-0 flex flex-col items-center justify-center bg-[#0D1117]
                            transition-colors duration-300 overflow-hidden
                            ${moveResult === "correct" ? "flash-green" :
                              moveResult === "wrong"   ? "flash-red"   : ""}`}>

            {phase === "complete" && (
              <div className="mb-3 flex items-center gap-2 px-4 py-2 rounded-full
                              bg-[#7bdb80]/10 border border-[#7bdb80]/30 pop-in flex-shrink-0">
                <CheckCircle size={15} className="text-[#7bdb80]" />
                <span className="text-[#7bdb80] font-bold text-xs">
                  Solved in {formatTime(elapsed)}
                </span>
                {streak > 1 && (
                  <span className="text-orange-400 text-xs font-mono flex items-center gap-1">
                    <Flame size={12} /> {streak}
                  </span>
                )}
              </div>
            )}
            {phase === "gave_up" && (
              <div className="mb-3 flex items-center gap-2 px-4 py-2 rounded-full
                              bg-[#414754]/20 border border-[#414754]/30 pop-in flex-shrink-0">
                <SkipForward size={15} className="text-[#8b909f]" />
                <span className="text-[#8b909f] font-bold text-xs">Solution revealed</span>
              </div>
            )}

            <div
              ref={boardContainerRef}
              className="relative flex-shrink-0"
              style={{ width: boardSize, height: boardSize }}
            >
              <GameBoard
                key={boardKey}
                onMove={handleMove}
                isPlaying={phase === "solving" || phase === "correct"}
                externalFen={currentFen || currentPuzzle?.fen}
                size={boardSize}
                style={{ width: boardSize, height: boardSize }}
              />

              {phase === "wrong" && (
                <div className="absolute inset-0 pointer-events-none rounded-sm
                                border-2 border-[#ff6b6b]/70 animate-pulse" />
              )}
              {phase === "complete" && (
                <div className="absolute inset-0 pointer-events-none rounded-sm
                                border-2 border-[#7bdb80]/50" />
              )}
            </div>

            {currentPuzzle && (
              <div className="mt-3 flex items-center gap-2 text-xs font-mono text-[#8b909f] flex-shrink-0">
                <div className={`w-2.5 h-2.5 rounded-full border border-[#414754] ${
                  new Chess(currentFen || currentPuzzle.fen).turn() === "w"
                    ? "bg-[#f0d9b5]" : "bg-[#3d3d3d]"
                }`} />
                {new Chess(currentFen || currentPuzzle.fen).turn() === "w" ? "White" : "Black"} to move
              </div>
            )}
          </main>

          {/* ── RIGHT PANEL — coach + queue ──────────────────────────────── */}
          <aside className="w-[280px] flex-shrink-0 bg-[#0a0e14] border-l border-[#414754]/15
                            flex flex-col overflow-y-auto">

            {showCoach && (
              <div className="p-4 border-b border-[#414754]/15 pop-in">
                <div className="flex items-center gap-2 mb-3">
                  <div className="w-6 h-6 rounded bg-[#acc7ff]/10 flex items-center justify-center
                                  border border-[#acc7ff]/30">
                    <Bot size={13} className="text-[#acc7ff]" />
                  </div>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-[#acc7ff]">
                    Tactical Coach
                  </span>
                </div>

                <div className="bg-[#10141a] border border-[#acc7ff]/15 rounded-lg p-3">
                  <div className="text-[10px] font-mono text-[#acc7ff]/40 mb-2 flex items-center gap-1.5">
                    <Terminal size={10} /> ANALYSIS_LOG
                  </div>
                  {isLoadingCoach ? (
                    <div className="flex items-center gap-2 py-2">
                      <span className="text-[10px] font-mono text-[#acc7ff]/50 uppercase tracking-widest">
                        Analyzing
                      </span>
                      {[0, 150, 300].map(d => (
                        <span key={d} className="w-1 h-1 rounded-full bg-[#acc7ff]"
                              style={{ animation: `bounce 1s ease-in-out ${d}ms infinite` }} />
                      ))}
                    </div>
                  ) : (
                    <div className="text-xs leading-relaxed prose prose-invert max-w-none
                                    prose-p:leading-relaxed prose-p:text-[#dfe2eb] prose-strong:text-white">
                      <ReactMarkdown>{coachText}</ReactMarkdown>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="p-4 flex-1">
              <div className="text-[10px] font-mono text-[#414754] uppercase tracking-widest mb-3">
                Up next
              </div>

              <div className="space-y-2">
                {puzzles
                  .filter(p => p.id !== currentPuzzle?.id)
                  .slice(0, 6)
                  .map(puzzle => (
                    <button
                      key={puzzle.id}
                      onClick={() => beginPuzzle(puzzle)}
                      className="w-full text-left px-3 py-2.5 rounded-lg
                                 bg-[#1a1f26] border border-[#30363d]
                                 hover:border-[#acc7ff]/40 hover:bg-[#202631]
                                 transition-all group"
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[10px] font-mono text-[#8b909f] capitalize group-hover:text-[#acc7ff] transition-colors">
                          {puzzle.theme}
                        </span>
                        <span className="text-[10px] font-bold"
                              style={{ color: difficultyColor(puzzle.difficulty) }}>
                          {difficultyLabel(puzzle.difficulty)}
                        </span>
                      </div>
                      <div className="text-xs font-mono text-[#414754] group-hover:text-[#8b909f] transition-colors">
                        {puzzle.solution.length} moves · {puzzle.solution[0]}…
                      </div>
                    </button>
                  ))
                }

                {puzzles.length === 0 && (
                  <div className="text-[#414754] text-xs font-mono italic text-center py-4">
                    Loading puzzles…
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 border-t border-[#414754]/15">
              <div className="text-[10px] font-mono text-[#414754] uppercase tracking-widest mb-2">
                Filter by theme
              </div>
              <div className="flex flex-wrap gap-1.5">
                {["fork", "pin", "skewer", "back_rank", "endgame", "checkmate"].map(theme => (
                  <button
                    key={theme}
                    onClick={async () => {
                      const token = await getToken(); // FIX: use getToken from useAuth
                      const res   = await fetch(
                        `${process.env.NEXT_PUBLIC_API_URL}/api/puzzles?theme=${theme}&limit=10`,
                        { headers: { Authorization: `Bearer ${token}` } },
                      );
                      const data: Puzzle[] = await res.json();
                      if (data.length > 0) {
                        setPuzzles(data);
                        beginPuzzle(data[0]);
                      }
                    }}
                    className="text-[10px] font-mono px-2 py-1 rounded-full capitalize
                               bg-[#1a1f26] border border-[#414754]/20 text-[#8b909f]
                               hover:border-[#acc7ff]/40 hover:text-[#acc7ff] transition-all"
                  >
                    {theme.replace("_", " ")}
                  </button>
                ))}
              </div>
            </div>
          </aside>
        </div>
      </div>
    </>
  );
}