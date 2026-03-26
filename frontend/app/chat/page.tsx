"use client";
import { Grid, Zap, Puzzle, User, Bot, Terminal, PlusCircle, Mic, Send } from 'lucide-react';
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect } from "react";

export default function ChatPage() {
  const { isLoaded, userId } = useAuth();
  const { redirectToSignIn } = useClerk();

  // Redirect to Clerk's OWN hosted sign-in page
  useEffect(() => {
    if (isLoaded && !userId) {
      redirectToSignIn({
        signInFallbackRedirectUrl: "/chat", // Where they go after login
      });
    }
  }, [isLoaded, userId, redirectToSignIn]);

  // 1. LOADING STATE
  if (!isLoaded) {
    return (
      <div 
        className="min-h-screen w-full flex flex-col items-center justify-center" 
        style={{ backgroundColor: "#0D1117", color: "#8b909f" }}
      >
        <div className="animate-pulse font-mono text-sm tracking-widest uppercase">
          Verifying Senpai Session...
        </div>
      </div>
    );
  }

  // 2. PROTECTED CONTENT (Only show if userId exists)
  if (!userId) return null;
  return (
    <div className="bg-[#0D1117] text-[#dfe2eb] font-body overflow-hidden">
      {/* TopAppBar */}
      <header className="fixed top-0 left-0 w-full h-16 bg-[#181c22] border-b border-[#414754]/15 flex justify-between items-center px-6 z-50">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold tracking-tight font-headline" style={{ fontFamily: 'Space Grotesk' }}>
            Chess Senpai
          </span>
          <div className="h-4 w-px bg-[#414754]/30 ml-2"></div>
          <span className="text-[#acc7ff] font-headline font-bold text-lg" style={{ fontFamily: 'Space Grotesk' }}>
            Sensei Chat
          </span>
        </div>
        <div className="flex items-center gap-2">
          <UserButton afterSwitchSessionUrl="/" />
        </div>
      </header>

      {/* SideNavBar */}
      <aside className="fixed left-0 top-0 h-full w-16 bg-[#0a0e14] border-r border-[#414754]/15 flex flex-col py-4 z-40 pt-20">
        <nav className="flex flex-col gap-6 items-center">
          <a className="flex flex-col items-center justify-center text-[#8b909f] hover:text-[#dfe2eb] hover:bg-[#1c2026] transition-all duration-150 ease-out w-full py-2" href="/dashboard">
            <Grid size={20} />
            <span className="text-[10px] mt-1 font-label" style={{ fontFamily: 'Space Grotesk' }}>Dashboard</span>
          </a>
          <a className="flex flex-col items-center justify-center text-[#8b909f] hover:text-[#dfe2eb] hover:bg-[#1c2026] transition-all duration-150 ease-out w-full py-2" href="/chat">
            <Zap size={20} />
            <span className="text-[10px] mt-1 font-label" style={{ fontFamily: 'Space Grotesk' }}>Chat</span>
          </a>
          <a className="flex flex-col items-center justify-center text-[#8b909f] hover:text-[#dfe2eb] hover:bg-[#1c2026] transition-all duration-150 ease-out w-full py-2" href="#">
            <Puzzle size={20} />
            <span className="text-[10px] mt-1 font-label" style={{ fontFamily: 'Space Grotesk' }}>Puzzles</span>
          </a>
        </nav>
        <div className="mt-auto flex flex-col items-center gap-4">
          <div className="text-[10px] font-mono text-[#8b909f] uppercase tracking-widest text-center rotate-[-90deg] mb-8" style={{ fontFamily: 'JetBrains Mono' }}>
            <br />
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className="ml-16 mt-16 h-[calc(100vh-64px)] flex flex-col bg-[#0D1117] overflow-hidden items-center">
        {/* Chat Terminal Section */}
        <section className="flex-grow flex flex-col w-full max-w-4xl relative">
          {/* Chat Scroll Area */}
          <div className="flex-grow overflow-y-auto terminal-scroll p-6 space-y-10 w-full pb-40">
            {/* User Message */}
            <div className="flex flex-col items-end group">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-[10px] font-mono text-[#8b909f] uppercase" style={{ fontFamily: 'JetBrains Mono' }}>
                  Grandmaster (You)
                </span>
                <div className="w-6 h-6 rounded bg-[#31353c] flex items-center justify-center border border-[#414754]/20">
                  <User size={16} />
                </div>
              </div>
              <div className="bg-[#262a31] px-5 py-3 rounded-lg border border-[#414754]/20 max-w-[85%]">
                <p className="text-sm leading-relaxed">
                  Can you explain the main ideas behind the Sicilian Defense?
                </p>
              </div>
            </div>

            {/* AI Response (Terminal Style) */}
            <div className="flex flex-col items-start">
              <div className="flex items-center gap-3 mb-2">
                <div className="w-6 h-6 rounded bg-[#acc7ff]/10 flex items-center justify-center border border-[#acc7ff]/30">
                  <Bot size={16} className="text-[#acc7ff]" />
                </div>
                <span className="text-[10px] font-mono text-[#acc7ff] uppercase" style={{ fontFamily: 'JetBrains Mono' }}>
                  Sensei AI
                </span>
              </div>
              <div className="bg-[#10141a] border border-[#acc7ff]/20 p-5 rounded-lg w-full font-mono text-sm leading-relaxed relative overflow-hidden" style={{ fontFamily: 'JetBrains Mono' }}>
                <div className="absolute top-0 left-0 w-1 h-full bg-[#acc7ff]/30"></div>
                <div className="text-[#acc7ff]/90 mb-4 flex items-center gap-2">
                  <Terminal size={16} />
                  <span>Thinking...</span>
                </div>
                <div className="text-[#dfe2eb] whitespace-pre-wrap">
                  The Sicilian Defense (1. e4 c5) is the most popular and best-scoring response to 1. e4. It is fundamentally an asymmetrical opening designed to fight for the win from the very first move. Black trades a wing pawn (c5) for White's center pawn (d4), gaining a central pawn majority. The pawn structures are different, leading to complex middlegames with chances for both sides. Would you like me to demonstrate the Najdorf Variation or explore the Dragon tactical motifs?<span className="cursor-blink"></span>
                </div>
              </div>
            </div>

            {/* Another AI Visual (Diagram) */}
          </div>

          {/* Chat Input Container */}
          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 w-full max-w-2xl px-4 z-50">
            <div className="relative group">
              <div className="absolute -inset-0.5 bg-[#acc7ff]/20 rounded-full blur opacity-0 group-focus-within:opacity-100 transition duration-500"></div>
              <div className="relative flex items-center bg-[#161b22] border border-[#30363d] rounded-full px-4 py-2 shadow-2xl">
                <button className="p-2 text-[#8b909f] hover:text-[#acc7ff] transition-colors">
                  <PlusCircle size={20} />
                </button>
                <input 
                  className="flex-grow bg-transparent border-none focus:ring-0 text-sm text-[#dfe2eb] px-3 placeholder:text-[#8b909f]/50 font-body" 
                  placeholder="Ask Sensei about openings, tactics, or theory..." 
                  type="text"
                />
                <div className="flex items-center gap-1">
                  <button className="p-2 text-[#8b909f] hover:text-[#acc7ff] transition-colors">
                    <Mic size={24} />
                  </button>
                  <button className="bg-[#acc7ff] text-white p-2 rounded-full hover:bg-[#acc7ff]/90 transition-all active:scale-95 flex items-center justify-center shadow-lg shadow-[#acc7ff]/20">
                    <Send size={20} />
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}