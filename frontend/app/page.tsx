"use client";
import { useAuth, useClerk } from "@clerk/nextjs";
import { useRouter } from "next/navigation";

export default function ChessSenpaiLanding() {
  const { isSignedIn } = useAuth();
  const { redirectToSignIn } = useClerk()
  const router = useRouter();

  const handleStartTraining = () => {
    if (isSignedIn) {
      router.push("/dashboard");
    } else {
      redirectToSignIn({
      signInFallbackRedirectUrl: '/dashboard', // Where to go after login
    });
    }
  };

  return (
    <div
      className="dark relative min-h-screen w-full flex flex-col items-center justify-center overflow-hidden"
      style={{ backgroundColor: "#0D1117", color: "#dfe2eb", fontFamily: "Inter, sans-serif" }}
    >
      {/* Google Fonts */}
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@300;400;500;600;700;900&family=Inter:wght@300;400;500;600&family=JetBrains+Mono:wght@400;500&display=swap');
        @import url('https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:wght,FILL@100..700,0..1&display=swap');

        .font-headline { font-family: 'Space Grotesk', sans-serif; }
        .font-label    { font-family: 'Space Grotesk', sans-serif; }
        .font-mono     { font-family: 'JetBrains Mono', monospace; }
        .font-body     { font-family: 'Inter', sans-serif; }
        .material-symbols-outlined {
          font-family: 'Material Symbols Outlined';
          font-weight: normal;
          font-style: normal;
          font-size: 24px;
          line-height: 1;
          letter-spacing: normal;
          text-transform: none;
          display: inline-block;
          white-space: nowrap;
          word-wrap: normal;
          direction: ltr;
          -webkit-font-smoothing: antialiased;
        }

        .chess-grid-pattern {
          background-image:
            linear-gradient(to right, rgba(65,71,84,0.05) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(65,71,84,0.05) 1px, transparent 1px);
          background-size: 64px 64px;
        }
        .hero-glow {
          background: radial-gradient(circle at center, rgba(172,199,255,0.08) 0%, transparent 70%);
        }
      `}</style>

      {/* Background Pattern */}
      <div className="chess-grid-pattern absolute inset-0 pointer-events-none" />
      <div className="hero-glow absolute inset-0 pointer-events-none" />

      {/* Ambient blobs */}
      <div className="absolute bottom-[-10%] left-[-5%] w-96 h-96 rounded-full pointer-events-none"
           style={{ background: "rgba(172,199,255,0.05)", filter: "blur(120px)" }} />
      <div className="absolute top-[-5%] right-[-5%] w-80 h-80 rounded-full pointer-events-none"
           style={{ background: "rgba(123,219,128,0.05)", filter: "blur(100px)" }} />

      {/* ── HEADER ─────────────────────────────────────────────────────── */}
      <header className="fixed top-0 w-full h-20 flex items-center justify-between px-8 z-50">
        <div className="flex items-center gap-2">
          <span className="font-headline font-black text-2xl tracking-tighter" style={{ color: "#acc7ff" }}>
            CHESS SENPAI
          </span>
          <span
            className="font-mono text-[10px] px-2 py-0.5 tracking-widest rounded-sm"
            style={{ background: "#262a31", color: "#8b909f" }}
          >
            TRAINER_BETA_2.1
          </span>
        </div>
        <nav className="hidden md:flex items-center gap-6">
          {["Curriculum", "AI Coaching", "Wall of Fame"].map((item) => (
            <a
              key={item}
              href="#"
              className="font-label text-xs uppercase tracking-widest transition-colors"
              style={{ color: "#8b909f" }}
              onMouseEnter={(e) => ((e.target as HTMLElement).style.color = "#acc7ff")}
              onMouseLeave={(e) => ((e.target as HTMLElement).style.color = "#8b909f")}
            >
              {item}
            </a>
          ))}
        </nav>
      </header>

      {/* ── MAIN HERO ──────────────────────────────────────────────────── */}
      <main className="relative z-10 w-full max-w-6xl px-6 flex flex-col items-center text-center">

        {/* Badge */}
        <div
          className="mb-8 inline-flex items-center gap-3 px-3 py-1"
          style={{
            background: "#0a0e14",
            border: "1px solid rgba(65,71,84,0.2)",
            borderRadius: "0.125rem",
          }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 14, color: "#7bdb80" }}>school</span>
          <span className="font-mono text-[11px] tracking-tight" style={{ color: "#7bdb80" }}>
            COACH STATUS: MONITORING_STUDENT_PROGRESS
          </span>
        </div>

        {/* Headline */}
        <h1
          className="font-headline font-black tracking-tighter leading-none mb-6"
          style={{ fontSize: "clamp(2.8rem, 8vw, 6rem)", color: "#dfe2eb" }}
        >
          MASTER CHESS <br />
          WITH YOUR{" "}
          <span style={{ color: "#acc7ff" }}>AI SENPAI.</span>
        </h1>

        <p
          className="max-w-xl font-body text-lg mb-12 leading-relaxed"
          style={{ color: "#8b909f" }}
        >
          Stop guessing and start growing. Chess Senpai identifies your specific tactical weaknesses
          and curates a personalized training path using elite neural insights.
        </p>

        {/* CTA Section */}
        <div className="flex flex-col items-center gap-6 w-full max-w-sm">
          {/* Start Training Button */}
          <button
            onClick={handleStartTraining}
            className="group w-full flex items-center justify-center gap-4 font-headline font-bold py-4 px-8 transition-all duration-300 active:scale-[0.98]"
            style={{
              background: "#dfe2eb",
              color: "#1c2026",
              borderRadius: "0.125rem",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#acc7ff")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "#dfe2eb")}
          >
            <svg className="w-5 h-5" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="currentColor"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="currentColor"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="currentColor"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="currentColor"/>
            </svg>
            <span className="tracking-tight uppercase text-sm">Start Training</span>
          </button>

          {/* Divider */}
          <div className="flex items-center gap-4 w-full" style={{ color: "rgba(139,144,159,0.3)" }}>
            <div className="h-px flex-1 bg-current" />
            <span className="font-mono text-[10px] uppercase tracking-widest">Enrollment Access</span>
            <div className="h-px flex-1 bg-current" />
          </div>

          {/* Secondary buttons */}
          <div className="grid grid-cols-2 gap-4 w-full">
            {["Training Plans", "Success Stories"].map((label) => (
              <button
                key={label}
                className="py-3 px-4 font-label text-xs uppercase tracking-widest transition-colors"
                style={{
                  border: "1px solid rgba(65,71,84,0.3)",
                  color: "#dfe2eb",
                  borderRadius: "0.125rem",
                  background: "transparent",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.background = "#262a31")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.background = "transparent")}
              >
                {label}
              </button>
            ))}
          </div>
        </div>

        {/* Stats strip */}
        <div className="mt-12 p-5 grid grid-cols-1 md:grid-cols-3 gap-8 w-full">
          {[
            {
              tag: "PERSONALIZED_GROWTH",
              tagColor: "#acc7ff",
              borderColor: "rgba(172,199,255,0.4)",
              value: "94%",
              desc: "Average rating improvement within the first 30 days of training.",
            },
            {
              tag: "CURATED_PUZZLES",
              tagColor: "#7bdb80",
              borderColor: "rgba(123,219,128,0.4)",
              value: "1.2M+",
              desc: "Adaptive drills generated specifically for your playstyle.",
            },
            {
              tag: "COACH_ELO",
              tagColor: "#ffb4ac",
              borderColor: "rgba(255,180,172,0.4)",
              value: "LGM 3500",
              desc: "Instructional depth powered by world-class neural nodes.",
            },
          ].map(({ tag, tagColor, borderColor, value, desc }) => (
            <div
              key={tag}
              className="p-6 flex flex-col items-start text-left"
              style={{
                background: "#181c22",
                borderLeft: `2px solid ${borderColor}`,
              }}
            >
              <span className="font-mono text-[10px] mb-2 tracking-[0.2em]" style={{ color: tagColor }}>
                {tag}
              </span>
              <span className="font-headline font-bold text-2xl" style={{ color: "#dfe2eb" }}>
                {value}
              </span>
              <p className="text-xs mt-1 font-body" style={{ color: "#8b909f" }}>{desc}</p>
            </div>
          ))}
        </div>
      </main>

      {/* ── SIDEBAR WIDGET ─────────────────────────────────────────────── */}
      <div
        className="fixed top-24 right-8 w-48 p-3 hidden lg:block"
        style={{
          background: "rgba(38,42,49,0.6)",
          backdropFilter: "blur(12px)",
          border: "1px solid rgba(65,71,84,0.1)",
        }}
      >
        <div className="flex justify-between items-center mb-2">
          <span className="font-mono text-[9px]" style={{ color: "#acc7ff" }}>TRAINING_SYNCED</span>
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: "#acc7ff", boxShadow: "0 0 5px #acc7ff" }} />
        </div>
        <div className="space-y-1">
          {["75%", "40%", "90%"].map((w, i) => (
            <div key={i} className="h-1 w-full overflow-hidden" style={{ background: "#31353c" }}>
              <div className="h-full" style={{ width: w, background: "#acc7ff" }} />
            </div>
          ))}
        </div>
      </div>

      {/* ── FOOTER ─────────────────────────────────────────────────────── */}
      <footer className="fixed bottom-0 w-full p-8 flex justify-between items-end z-50 pointer-events-none">
        <div className="pointer-events-auto flex items-center gap-4" style={{ color: "rgba(139,144,159,0.4)" }}>
          <span className="font-mono text-[10px]">AUTH_MODE: SECURE</span>
          <div className="w-1 h-1 rounded-full" style={{ background: "#7bdb80" }} />
          <span className="font-mono text-[10px]">ENCRYPTION: AES-256</span>
        </div>
        <div className="pointer-events-auto flex flex-col items-end gap-2">
          <div className="h-12 w-px mr-2" style={{ background: "rgba(65,71,84,0.3)" }} />
          <span className="font-mono text-[10px] uppercase tracking-widest" style={{ color: "#8b909f" }}>
            Chess Senpai Academy © 2026
          </span>
        </div>
      </footer>
    </div>
  );
}