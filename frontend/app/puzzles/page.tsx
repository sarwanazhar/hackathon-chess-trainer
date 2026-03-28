"use client";
import { Grid, Zap, Puzzle, User, Bot, Terminal, PlusCircle, Send, Wifi, WifiOff, Trophy, Target, Clock, Brain, Shield, Zap as ZapIcon, CheckCircle, XCircle } from 'lucide-react';
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useState, useRef } from "react";
import { Chess } from 'chess.js';
import ReactMarkdown from 'react-markdown';
import GameBoard from '@/components/GameBoard';

export default function PuzzlesPage() {
  const { isLoaded, userId } = useAuth();
  const { redirectToSignIn } = useClerk();
  const [puzzles, setPuzzles] = useState<any[]>([]);
  const [currentPuzzle, setCurrentPuzzle] = useState<any>(null);
  const [currentMoveIndex, setCurrentMoveIndex] = useState(0);
  const [userMoves, setUserMoves] = useState<string[]>([]);
  const [isSolving, setIsSolving] = useState(false);
  const [isCorrect, setIsCorrect] = useState<boolean | null>(null);
  const [showCoach, setShowCoach] = useState(false);
  const [coachResponse, setCoachResponse] = useState('');
  const [timeTaken, setTimeTaken] = useState(0);
  const [timerActive, setTimerActive] = useState(false);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const chessInstance = useRef(new Chess());

  // Auth Redirect
  useEffect(() => {
    if (isLoaded && !userId) {
      redirectToSignIn({ signInFallbackRedirectUrl: "/puzzles" });
    }
  }, [isLoaded, userId, redirectToSignIn]);

  // Timer logic
  useEffect(() => {
    if (timerActive) {
      timerRef.current = setInterval(() => {
        setTimeTaken(prev => prev + 1);
      }, 1000);
    } else {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    }

    return () => {
      if (timerRef.current) {
        clearInterval(timerRef.current);
      }
    };
  }, [timerActive]);

  // Load puzzles
  useEffect(() => {
    if (userId) {
      loadPuzzles();
    }
  }, [userId]);

  const loadPuzzles = async () => {
    try {
      const token = await getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/puzzles?limit=10`, {
        headers: {
          'Authorization': `Bearer ${token}`
        }
      });
      const data = await response.json();
      setPuzzles(data);
      if (data.length > 0) {
        startPuzzle(data[0]);
      }
    } catch (error) {
      console.error('Failed to load puzzles:', error);
    }
  };

  const startPuzzle = (puzzle: any) => {
    setCurrentPuzzle(puzzle);
    setCurrentMoveIndex(0);
    setUserMoves([]);
    setIsSolving(true);
    setIsCorrect(null);
    setShowCoach(false);
    setCoachResponse('');
    setTimeTaken(0);
    setTimerActive(true);
    chessInstance.current = new Chess(puzzle.fen);
  };

  const handleMove = async (move: string) => {
    if (!isSolving || currentPuzzle === null) return;

    const chess = chessInstance.current;
    const userMove = chess.move(move);

    if (!userMove) return;

    setUserMoves(prev => [...prev, move]);

    // Check if this is the correct move
    const expectedMove = currentPuzzle.solution[currentMoveIndex];
    
    if (move === expectedMove) {
      // Correct move
      setIsCorrect(true);
      setCurrentMoveIndex(prev => prev + 1);

      // Check if puzzle is complete
      if (currentMoveIndex + 1 >= currentPuzzle.solution.length) {
        completePuzzle(true);
      } else {
        // Apply opponent's move
        const opponentMove = currentPuzzle.solution[currentMoveIndex + 1];
        chess.move(opponentMove);
        setCurrentMoveIndex(prev => prev + 1);
        setIsCorrect(null);
      }
    } else {
      // Wrong move
      setIsCorrect(false);
      setTimerActive(false);
    }
  };

  const completePuzzle = async (solved: boolean) => {
    setTimerActive(false);
    setIsSolving(false);

    try {
      const token = await getToken();
      await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/puzzles/complete`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          puzzle_id: currentPuzzle.id,
          solved: solved,
          time_taken_ms: timeTaken * 1000
        })
      });
    } catch (error) {
      console.error('Failed to complete puzzle:', error);
    }
  };

  const getHint = async () => {
    if (!currentPuzzle) return;

    try {
      const token = await getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/puzzles/attempt`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          puzzle_id: currentPuzzle.id,
          move: '',
          move_index: currentMoveIndex,
          fen: chessInstance.current.fen()
        })
      });

      const data = await response.json();
      if (data.best_move_san) {
        // Highlight the best move
        console.log('Best move:', data.best_move_san);
      }
    } catch (error) {
      console.error('Failed to get hint:', error);
    }
  };

  const getCoachHelp = async () => {
    if (!currentPuzzle || isCorrect === null) return;

    setShowCoach(true);
    setCoachResponse('Analyzing your move...');

    try {
      const token = await getToken();
      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/puzzles/coach`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          fen: chessInstance.current.fen(),
          wrong_move: userMoves[userMoves.length - 1],
          best_move: currentPuzzle.solution[currentMoveIndex - 1],
          theme: currentPuzzle.theme
        })
      });

      const data = await response.json();
      setCoachResponse(data.coaching);
    } catch (error) {
      console.error('Failed to get coach help:', error);
      setCoachResponse('Sorry, I encountered an error. Please try again.');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    return `${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  const getToken = async () => {
    const { getToken } = await import('@clerk/nextjs');
    return await getToken({ template: 'supabase' });
  };

  if (!isLoaded) return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0D1117] text-[#8b909f]">
      <div className="animate-pulse font-mono text-sm tracking-widest uppercase">Verifying Session...</div>
    </div>
  );

  if (!userId) return null;

  return (
    <div className="h-screen w-screen bg-[#0D1117] text-[#dfe2eb] font-body overflow-hidden flex flex-col">
      <header className="h-14 bg-[#181c22] border-b border-[#414754]/15 flex justify-between items-center px-4 z-50">
        <div className="flex items-center gap-3">
          <Puzzle size={18} className="text-[#acc7ff]" />
          <span className="font-bold">Chess Senpai</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2 px-3 py-1 rounded-full text-xs bg-[#31353c] border border-[#414754]/20">
            <Clock size={14} className="text-[#acc7ff]" />
            <span className="text-[#acc7ff]">{formatTime(timeTaken)}</span>
          </div>
          <UserButton afterSwitchSessionUrl="/puzzles" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-14 bg-[#0a0e14] border-r border-[#414754]/15 flex flex-col items-center py-4 gap-6">
          <a href="/dashboard" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors">
            <Grid size={20} />
          </a>
          <a href="/chat" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors">
            <Zap size={20} />
          </a>
          <a href="/puzzles" className="text-[#acc7ff] transition-colors">
            <Puzzle size={20} />
          </a>
          <a href="/games" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </aside>

        <main className="flex-1 flex flex-col relative bg-[#0D1117] overflow-hidden">
          <div className="flex-1 p-6 overflow-y-auto">
            <div className="max-w-6xl mx-auto">
              {/* Puzzle Header */}
              {currentPuzzle && (
                <div className="mb-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Target size={20} className="text-[#acc7ff]" />
                      <span className="text-sm font-mono text-[#8b909f]">Theme</span>
                    </div>
                    <div className="text-lg font-bold text-[#acc7ff] capitalize">{currentPuzzle.theme}</div>
                  </div>
                  
                  <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Brain size={20} className="text-[#acc7ff]" />
                      <span className="text-sm font-mono text-[#8b909f]">Difficulty</span>
                    </div>
                    <div className="text-lg font-bold">
                      {currentPuzzle.difficulty === 1 && <span className="text-[#7bdb80]">Beginner</span>}
                      {currentPuzzle.difficulty === 2 && <span className="text-[#ffd700]">Intermediate</span>}
                      {currentPuzzle.difficulty === 3 && <span className="text-[#ff6b6b]">Advanced</span>}
                    </div>
                  </div>

                  <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                    <div className="flex items-center gap-3 mb-2">
                      <Shield size={20} className="text-[#acc7ff]" />
                      <span className="text-sm font-mono text-[#8b909f]">Progress</span>
                    </div>
                    <div className="text-lg font-bold text-[#acc7ff]">
                      Move {currentMoveIndex + 1} of {currentPuzzle.solution.length}
                    </div>
                  </div>
                </div>
              )}

              {/* Chess Board */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
                <div className="lg:col-span-2">
                  <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                    <div className="flex justify-between items-center mb-4">
                      <h2 className="text-lg font-bold text-[#dfe2eb]">Tactical Position</h2>
                      {isCorrect === true && (
                        <div className="flex items-center gap-2 text-[#7bdb80]">
                          <CheckCircle size={18} />
                          <span className="text-sm font-mono">Correct!</span>
                        </div>
                      )}
                      {isCorrect === false && (
                        <div className="flex items-center gap-2 text-[#ff6b6b]">
                          <XCircle size={18} />
                          <span className="text-sm font-mono">Try Again</span>
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center">
                      <GameBoard 
                        onMove={handleMove}
                        isPlaying={isSolving}
                        externalFen={currentPuzzle?.fen}
                      />
                    </div>
                  </div>
                </div>

                {/* Puzzle Info Panel */}
                <div className="lg:col-span-1">
                  <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4 h-full">
                    <h3 className="text-lg font-bold text-[#dfe2eb] mb-4">Puzzle Info</h3>
                    
                    {currentPuzzle && (
                      <div className="space-y-4">
                        <div>
                          <div className="text-sm font-mono text-[#8b909f] mb-1">Solution</div>
                          <div className="text-sm text-[#dfe2eb] font-mono">
                            {currentPuzzle.solution.map((move: string, index: number) => (
                              <span key={index} className={`mr-2 ${
                                index <= currentMoveIndex ? 'text-[#acc7ff]' : 'text-[#8b909f]'
                              }`}>
                                {index % 2 === 0 ? `${Math.floor(index/2) + 1}.` : ''} {move}
                              </span>
                            ))}
                          </div>
                        </div>

                        <div className="flex gap-2">
                          <button
                            onClick={getHint}
                            disabled={!isSolving}
                            className="flex-1 bg-[#31353c] text-[#8b909f] px-3 py-2 rounded-lg hover:bg-[#3a4048] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <Target size={16} className="inline mr-2" />
                            Get Hint
                          </button>
                          <button
                            onClick={() => completePuzzle(false)}
                            disabled={!isSolving}
                            className="flex-1 bg-[#31353c] text-[#8b909f] px-3 py-2 rounded-lg hover:bg-[#3a4048] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            <XCircle size={16} className="inline mr-2" />
                            Give Up
                          </button>
                        </div>

                        {isCorrect === false && (
                          <button
                            onClick={getCoachHelp}
                            className="w-full bg-[#acc7ff] text-[#0D1117] px-3 py-2 rounded-lg font-bold hover:scale-105 transition-transform"
                          >
                            <Bot size={16} className="inline mr-2" />
                            Get Coach Help
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Coach Panel */}
              {showCoach && (
                <div className="bg-[#10141a] border border-[#acc7ff]/20 rounded-lg p-4 mb-6">
                  <div className="flex items-center gap-3 mb-2">
                    <Bot size={16} className="text-[#acc7ff]" />
                    <span className="text-[10px] font-mono uppercase tracking-wider text-[#acc7ff]">TACTICAL COACH</span>
                  </div>
                  <div className="text-sm leading-relaxed prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:text-[#acc7ff] prose-strong:text-white">
                    <ReactMarkdown>{coachResponse}</ReactMarkdown>
                  </div>
                </div>
              )}

              {/* Puzzle Queue */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-4">
                <h3 className="text-lg font-bold text-[#dfe2eb] mb-4">Next Puzzles</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {puzzles.slice(1, 7).map((puzzle, index) => (
                    <div
                      key={puzzle.id}
                      onClick={() => startPuzzle(puzzle)}
                      className="border border-[#30363d] rounded-lg p-3 hover:border-[#acc7ff]/50 transition-colors cursor-pointer bg-[#1a1f26] hover:bg-[#202631]"
                    >
                      <div className="flex justify-between items-start mb-2">
                        <span className="text-xs text-[#8b909f] capitalize">{puzzle.theme}</span>
                        <div className={`px-2 py-1 rounded text-xs font-bold ${
                          puzzle.difficulty === 1 ? 'bg-[#7bdb80]/20 text-[#7bdb80]' :
                          puzzle.difficulty === 2 ? 'bg-[#ffd700]/20 text-[#ffd700]' :
                          'bg-[#ff6b6b]/20 text-[#ff6b6b]'
                        }`}>
                          {puzzle.difficulty === 1 ? 'Beginner' : puzzle.difficulty === 2 ? 'Intermediate' : 'Advanced'}
                        </div>
                      </div>
                      <div className="text-sm text-[#dfe2eb] font-mono">
                        {puzzle.solution[0]} + {puzzle.solution.length - 1} moves
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}