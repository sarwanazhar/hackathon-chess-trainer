"use client";
import { Grid, Zap, Puzzle, User, Bot, Terminal, PlusCircle, Send, Wifi, WifiOff, Trophy, Target, Clock, Brain, Shield, Zap as ZapIcon, CheckCircle, XCircle } from 'lucide-react';
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect } from "react";
import Link from 'next/link';

export default function GamesPage() {
  const { isLoaded, userId } = useAuth();
  const { redirectToSignIn } = useClerk();

  // Auth Redirect
  useEffect(() => {
    if (isLoaded && !userId) {
      redirectToSignIn({ signInFallbackRedirectUrl: "/games" });
    }
  }, [isLoaded, userId, redirectToSignIn]);

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
          <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
            <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          <span className="font-bold">Chess Senpai</span>
        </div>
        <div className="flex items-center gap-4">
          <UserButton afterSwitchSessionUrl="/games" />
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
          <a href="/puzzles" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors">
            <Puzzle size={20} />
          </a>
          <a href="/games" className="text-[#acc7ff] transition-colors">
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
              {/* Game Arena Header */}
              <div className="text-center mb-12">
                <h1 className="text-4xl font-bold text-[#dfe2eb] mb-4">Game Arena</h1>
                <p className="text-lg text-[#8b909f] mb-8">Challenge yourself against AI or play online matches</p>
              </div>

              {/* Start Game Button */}
              <div className="flex justify-center mb-12">
                <Link href="/game">
                  <button className="bg-[#acc7ff] text-[#0D1117] px-8 py-4 rounded-lg font-bold text-lg hover:scale-105 transition-transform shadow-lg hover:shadow-xl">
                    Start Game
                  </button>
                </Link>
              </div>

              {/* Game Features */}
              <div className="grid grid-cols-1 md:grid-cols-3 gap-8 mb-12">
                <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-center">
                  <div className="text-[#acc7ff] mb-4">
                    <Bot size={32} className="mx-auto" />
                  </div>
                  <h3 className="text-lg font-bold text-[#dfe2eb] mb-2">AI Opponent</h3>
                  <p className="text-sm text-[#8b909f]">Play against intelligent AI with multiple difficulty levels</p>
                </div>

                <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-center">
                  <div className="text-[#7bdb80] mb-4">
                    <Wifi size={32} className="mx-auto" />
                  </div>
                  <h3 className="text-lg font-bold text-[#dfe2eb] mb-2">Online Play</h3>
                  <p className="text-sm text-[#8b909f]">Challenge players from around the world in real-time matches</p>
                </div>

                <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6 text-center">
                  <div className="text-[#ffd700] mb-4">
                    <Trophy size={32} className="mx-auto" />
                  </div>
                  <h3 className="text-lg font-bold text-[#dfe2eb] mb-2">Track Progress</h3>
                  <p className="text-sm text-[#8b909f]">Monitor your performance and improve your chess skills</p>
                </div>
              </div>

              {/* Game Stats */}
              <div className="bg-[#161b22] border border-[#30363d] rounded-lg p-6">
                <h3 className="text-lg font-bold text-[#dfe2eb] mb-4">Your Stats</h3>
                <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-center">
                  <div>
                    <div className="text-2xl font-bold text-[#7bdb80]">0</div>
                    <div className="text-sm text-[#8b909f]">Wins</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-[#ff6b6b]">0</div>
                    <div className="text-sm text-[#8b909f]">Losses</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-[#ffd700]">0</div>
                    <div className="text-sm text-[#8b909f]">Draws</div>
                  </div>
                  <div>
                    <div className="text-2xl font-bold text-[#acc7ff]">0</div>
                    <div className="text-sm text-[#8b909f]">Total Games</div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
