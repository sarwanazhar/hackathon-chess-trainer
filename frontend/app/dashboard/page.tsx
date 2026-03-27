'use client'

import { 
  UserButton, 
  useAuth, 
  useClerk 
} from "@clerk/nextjs";
import { useEffect } from "react";
import { Grid, Zap, Puzzle } from 'lucide-react';

export default function DashboardPage() {
  const { isLoaded, userId } = useAuth();
  const { redirectToSignIn } = useClerk();

  // Redirect to Clerk's OWN hosted sign-in page
  useEffect(() => {
    if (isLoaded && !userId) {
      redirectToSignIn({
        signInFallbackRedirectUrl: "/dashboard", // Where they go after login
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
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700;900&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        .font-headline { font-family: 'Space Grotesk', sans-serif; }
        .font-mono     { font-family: 'JetBrains Mono', monospace; }
        .font-body     { font-family: 'Inter', sans-serif; }
      `}</style>

      {/* TopAppBar */}
      <header className="fixed top-0 left-0 w-full h-16 bg-[#181c22] border-b border-[#414754]/15 flex justify-between items-center px-6 z-50">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold tracking-tight font-headline" style={{ fontFamily: 'Space Grotesk' }}>
            Chess Senpai
          </span>
          <div className="h-4 w-px bg-[#414754]/30 ml-2"></div>
          <span className="text-[#acc7ff] font-headline font-bold text-lg" style={{ fontFamily: 'Space Grotesk' }}>
            Dashboard
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
        {/* Dashboard Content */}
        <section className="flex-grow flex flex-col w-full max-w-4xl relative">
          <div className="relative z-10 w-full max-w-4xl px-6 py-32 flex flex-col items-center text-center">
            <div className="mb-8 inline-flex items-center gap-3 px-4 py-2" style={{ background: "#0a0e14", border: "1px solid rgba(65,71,84,0.2)", borderRadius: "0.125rem" }}>
              <span className="font-mono text-[11px] tracking-tight" style={{ color: "#7bdb80" }}>
                WELCOME TO YOUR TRAINING DASHBOARD
              </span>
            </div>

            <h1 className="font-headline font-black tracking-tighter leading-none mb-6" style={{ fontSize: "clamp(2.5rem, 6vw, 4rem)", color: "#dfe2eb" }}>
              YOUR <span style={{ color: "#acc7ff" }}>PERSONALIZED</span> TRAINING HUB
            </h1>

            <p className="max-w-2xl font-body text-lg mb-12 leading-relaxed" style={{ color: "#8b909f" }}>
              Authenticated as <span className="text-white font-mono text-sm">{userId.substring(0, 8)}...</span>. Ready to analyze those blunders?
            </p>

            {/* Quick Actions (Mocked for now) */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 w-full">
              {[
                { title: "Start Training", desc: "Begin your session", color: "#acc7ff", borderColor: "rgba(172,199,255,0.4)" },
                { title: "View Progress", desc: "Track stats", color: "#7bdb80", borderColor: "rgba(123,219,128,0.4)" },
                { title: "Training Plan", desc: "Custom curriculum", color: "#ffb4ac", borderColor: "rgba(255,180,172,0.4)" }
              ].map(({ title, desc, color, borderColor }) => (
                <div key={title} className="p-6 flex flex-col items-start text-left cursor-pointer hover:bg-gray-900 transition-all border" style={{ background: "#181c22", borderColor, borderRadius: "0.5rem" }}>
                  <span className="font-headline font-bold text-xl mb-2" style={{ color }}>{title}</span>
                  <p className="text-sm font-body" style={{ color: "#8b909f" }}>{desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}
