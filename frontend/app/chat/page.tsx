"use client";
import { Grid, Zap, Puzzle, User, Bot, Terminal, PlusCircle, Send } from 'lucide-react';
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useState, useRef, useCallback } from "react";
import ReactMarkdown from 'react-markdown';

// ─── Suggestion chips shown on the empty state ───────────────────────────────
const SUGGESTIONS = [
  "What is chess how do i learn it?? guide me ",
  "Teach me the Sicilian Defense",
  "How do I checkmate with a Knight?",
  "Best opening for beginners?",
  "Explain en passant",
  "What is a chess tempo?",
];

export default function ChatPage() {
  const { isLoaded, userId } = useAuth();
  const { redirectToSignIn } = useClerk();

  const [messages, setMessages]     = useState<Array<{ type: 'user' | 'ai'; content: string }>>([]);
  const [inputValue, setInputValue] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [isThinking, setIsThinking]  = useState(false);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  // ── Auth redirect ─────────────────────────────────────────────────────────
  useEffect(() => {
    if (isLoaded && !userId) {
      redirectToSignIn({ signInFallbackRedirectUrl: "/chat" });
    }
  }, [isLoaded, userId, redirectToSignIn]);

  // ── Auto-scroll: triggers on messages AND on the thinking bubble ──────────
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // ── Helper: get Clerk token ───────────────────────────────────────────────
  const getToken = useCallback(async () => {
    const { getToken } = await import('@clerk/nextjs');
    return getToken({ template: 'supabase' });
  }, []);

  // ── Core send function — accepts an optional override so chips can pass
  //    their text directly without waiting for React state to flush. ──────────
  const sendMessage = useCallback(async (overrideText?: string) => {
    const text = (overrideText ?? inputValue).trim();
    if (!text || isStreaming || isThinking) return;

    // 1. Append user message & clear input immediately
    setMessages(prev => [...prev, { type: 'user', content: text }]);
    setInputValue('');

    // 2. Show thinking bubble right away
    setIsThinking(true);

    try {
      const token = await getToken();
      if (!token) throw new Error('Authentication token not available');

      const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/chat`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`,
        },
        body: JSON.stringify({ message: text }),
      });

      if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);

      // 3. FIX 1 — response is confirmed ok; dismiss thinking bubble NOW,
      //    before we enter the streaming loop. isStreaming takes over.
      setIsThinking(false);
      setIsStreaming(true);

      const reader  = response.body?.getReader();
      const decoder = new TextDecoder();
      // Local flag — avoids stale closure on a state variable
      let firstChunkReceived = false;

      outer: while (true) {
        const { done, value } = await reader!.read();
        if (done) break;

        const lines = decoder.decode(value).split('\n');

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;

          const payload = line.slice(6);
          if (payload === '[DONE]') break outer;

          try {
            const { chunk } = JSON.parse(payload);

            // FIX 3 — on first real chunk, ensure thinking is gone
            if (!firstChunkReceived) {
              firstChunkReceived = true;
              setIsThinking(false); // belt-and-suspenders, already false from above
            }

            // FIX 3 — safe append: create new AI bubble only if needed
            setMessages(prev => {
              const last = prev[prev.length - 1];
              if (last?.type === 'ai') {
                // Append chunk to existing AI bubble
                return [
                  ...prev.slice(0, -1),
                  { ...last, content: last.content + chunk },
                ];
              }
              // No AI bubble yet — create one
              return [...prev, { type: 'ai', content: chunk }];
            });
          } catch (e) {
            console.error('Error parsing SSE chunk:', e);
          }
        }
      }
    } catch (error) {
      console.error('Chat error:', error);
      setMessages(prev => [
        ...prev,
        { type: 'ai', content: 'Sorry, I encountered an error. Please try again.' },
      ]);
    } finally {
      // FIX 2 — SAFETY RESET: always clean up, no matter what broke
      setIsThinking(false);
      setIsStreaming(false);
    }
  }, [inputValue, isStreaming, isThinking, getToken]);

  // ── Suggestion chip handler — passes text directly, skips state lag ───────
  const handleSuggestion = useCallback((suggestion: string) => {
    setInputValue(suggestion);     // fills the input box visually
    sendMessage(suggestion);       // fires immediately with the text
  }, [sendMessage]);

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  // ── Derived booleans ──────────────────────────────────────────────────────
  const isBusy       = isStreaming || isThinking;
  const showEmpty    = messages.length === 0 && !isThinking;
  const inputPlaceholder = isThinking
    ? "Sensei is thinking…"
    : isStreaming
    ? "Sensei is responding…"
    : "Ask Sensei about your game…";

  // ── Loading / unauthed guards ─────────────────────────────────────────────
  if (!isLoaded) return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0D1117] text-[#8b909f]">
      <div className="animate-pulse font-mono text-sm tracking-widest uppercase">Verifying Session…</div>
    </div>
  );
  if (!userId) return null;

  return (
    <>
      {/* ── Keyframe for bouncing dots ── */}
      <style>{`
        @keyframes thinkingBounce {
          0%, 60%, 100% { transform: translateY(0);   opacity: 0.4; }
          30%            { transform: translateY(-5px); opacity: 1;   }
        }
        @keyframes senpaiPulse {
          0%, 100% { opacity: 0.4; transform: scale(1);    }
          50%       { opacity: 1;   transform: scale(1.15); }
        }
      `}</style>

      <div className="h-screen w-screen bg-[#0D1117] text-[#dfe2eb] font-body overflow-hidden flex flex-col">

        {/* ── Header ──────────────────────────────────────────────────────── */}
        <header className="h-16 bg-[#181c22] border-b border-[#414754]/15 flex justify-between items-center px-6 z-50 flex-shrink-0">
          <div className="flex items-center gap-4">
            <span className="text-xl font-bold tracking-tight">Chess Senpai</span>
            <div className="h-4 w-px bg-[#414754]/30 ml-2" />
            <span className="text-[#acc7ff] font-bold text-lg">Sensei Chat</span>
          </div>
          <UserButton afterSwitchSessionUrl="/chat" />
        </header>

        <div className="flex flex-1 overflow-hidden">

          {/* ── Sidebar ─────────────────────────────────────────────────── */}
          <aside className="w-16 bg-[#0a0e14] border-r border-[#414754]/15 flex flex-col items-center py-6 gap-8 flex-shrink-0">
            <a href="/dashboard" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors flex flex-col items-center gap-1">
              <Grid size={20} /><span className="text-[10px]">Board</span>
            </a>
            <a href="/chat" className="text-[#acc7ff] flex flex-col items-center gap-1">
              <Zap size={20} /><span className="text-[10px]">Chat</span>
            </a>
            <a href="/puzzles" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors flex flex-col items-center gap-1">
              <Puzzle size={20} /><span className="text-[10px]">Puzzles</span>
            </a>
            <a href="/games" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors flex flex-col items-center gap-1">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 17L12 22L22 17"           stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
                <path d="M2 12L12 17L22 12"           stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
              <span className="text-[10px]">Games</span>
            </a>
          </aside>

          {/* ── Main chat area ──────────────────────────────────────────── */}
          <main className="flex-1 flex flex-col relative bg-[#0D1117] overflow-hidden">
            <div className="flex-1 overflow-y-auto px-6 py-8 scrollbar-hide pb-32">
              <div className="max-w-4xl mx-auto w-full space-y-10">

                {/* ── EMPTY STATE ── shown only when no messages exist ── */}
                {showEmpty && (
                  <div className="flex flex-col items-center justify-center min-h-[60vh] gap-10">

                    {/* Icon with pulse ring */}
                    <div className="relative flex items-center justify-center">
                      <div
                        className="absolute w-24 h-24 rounded-full border border-[#acc7ff]/30"
                        style={{ animation: 'senpaiPulse 2.4s ease-in-out infinite' }}
                      />
                      <div className="w-16 h-16 rounded-full bg-[#acc7ff]/8 border border-[#acc7ff]/30 flex items-center justify-center">
                        <Bot size={28} className="text-[#acc7ff]" />
                      </div>
                    </div>

                    {/* Heading */}
                    <div className="text-center space-y-2">
                      <h1 className="text-2xl font-bold text-[#dfe2eb] tracking-tight">
                        Master the Board with Sensei AI
                      </h1>
                      <p className="text-[11px] font-mono text-[#8b909f] tracking-[0.15em] uppercase">
                        Ask anything. Learn anything about chess.
                      </p>
                    </div>

                    {/* Suggestion chips */}
                    <div className="flex flex-wrap gap-2.5 justify-center max-w-lg">
                      {SUGGESTIONS.map(s => (
                        <button
                          key={s}
                          onClick={() => handleSuggestion(s)}
                          className="flex items-center gap-2 px-4 py-2 rounded-full
                                     border border-[#acc7ff]/25 bg-[#acc7ff]/6
                                     text-[#acc7ff] text-xs font-mono
                                     hover:bg-[#acc7ff]/14 hover:border-[#acc7ff]/50
                                     transition-all duration-200 active:scale-95"
                        >
                          <span className="w-1.5 h-1.5 rounded-full bg-[#acc7ff] opacity-70" />
                          {s}
                        </button>
                      ))}
                    </div>

                    {/* Ambient status line */}
                    <p className="text-[10px] font-mono text-[#414754] tracking-[0.12em] uppercase">
                      SENSEI_AI v2.0 · READY
                    </p>
                  </div>
                )}

                {/* ── Message list ─────────────────────────────────── */}
                {messages.map((message, index) => (
                  <div key={index} className={`flex flex-col ${message.type === 'user' ? 'items-end' : 'items-start'}`}>
                    <div className="flex items-center gap-3 mb-2">
                      {message.type === 'ai' && (
                        <div className="w-6 h-6 rounded bg-[#acc7ff]/10 flex items-center justify-center border border-[#acc7ff]/30">
                          <Bot size={14} className="text-[#acc7ff]" />
                        </div>
                      )}
                      <span className={`text-[10px] font-mono uppercase tracking-wider ${
                        message.type === 'user' ? 'text-[#8b909f]' : 'text-[#acc7ff]'
                      }`}>
                        {message.type === 'user' ? 'Grandmaster (You)' : 'Sensei AI'}
                      </span>
                      {message.type === 'user' && (
                        <div className="w-6 h-6 rounded bg-[#31353c] flex items-center justify-center border border-[#414754]/20">
                          <User size={14} />
                        </div>
                      )}
                    </div>

                    <div className={`px-5 py-3 rounded-lg max-w-[85%] border shadow-sm ${
                      message.type === 'user'
                        ? 'bg-[#262a31] border-[#414754]/20'
                        : 'bg-[#10141a] border-[#acc7ff]/20 font-mono text-[#dfe2eb]'
                    }`}>
                      {message.type === 'ai' && (
                        <div className="text-[#acc7ff]/50 mb-2 flex items-center gap-2 text-[10px]">
                          <Terminal size={12} /><span>ANALYSIS_LOG</span>
                        </div>
                      )}
                      <div className="text-sm leading-relaxed prose prose-invert max-w-none
                                      prose-p:leading-relaxed prose-headings:text-[#acc7ff]
                                      prose-strong:text-white prose-ul:list-disc prose-ul:ml-4">
                        <ReactMarkdown>{message.content}</ReactMarkdown>
                        {/* Cursor: only while actively streaming on the last AI message */}
                        {message.type === 'ai' && index === messages.length - 1 && isStreaming && (
                          <span className="inline-block w-1.5 h-4 ml-1 bg-[#acc7ff] animate-pulse align-middle" />
                        )}
                      </div>
                    </div>
                  </div>
                ))}

                {/* ── THINKING BUBBLE ─────────────────────────────── */}
                {isThinking && (
                  <div className="flex flex-col items-start">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-6 h-6 rounded bg-[#acc7ff]/10 flex items-center justify-center border border-[#acc7ff]/30">
                        <Bot size={14} className="text-[#acc7ff]" />
                      </div>
                      <span className="text-[10px] font-mono uppercase tracking-wider text-[#acc7ff]">
                        Sensei AI
                      </span>
                    </div>
                    <div className="px-5 py-3 rounded-lg border bg-[#10141a] border-[#acc7ff]/20 font-mono shadow-sm">
                      <div className="text-[#acc7ff]/50 mb-2 flex items-center gap-2 text-[10px]">
                        <Terminal size={12} /><span>ANALYSIS_LOG</span>
                      </div>
                      <div className="flex items-center gap-1.5 px-1 py-0.5">
                        <span className="text-[10px] font-mono text-[#acc7ff]/60 uppercase tracking-widest mr-2">
                          Sensei is thinking
                        </span>
                        {[0, 200, 400].map(delay => (
                          <span
                            key={delay}
                            className="w-1.5 h-1.5 rounded-full bg-[#acc7ff] opacity-80"
                            style={{
                              animation: 'thinkingBounce 1.2s ease-in-out infinite',
                              animationDelay: `${delay}ms`,
                            }}
                          />
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* ── Input bar ──────────────────────────────────────────── */}
            <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#0D1117] via-[#0D1117] to-transparent">
              <div className="max-w-2xl mx-auto relative group">
                <div className="absolute -inset-0.5 bg-[#acc7ff]/20 rounded-full blur opacity-0 group-focus-within:opacity-100 transition duration-300" />
                <div className="relative flex items-center bg-[#161b22] border border-[#30363d] rounded-full px-4 py-2 shadow-2xl">
                  <button className="p-2 text-[#8b909f] hover:text-[#acc7ff] transition-colors">
                    <PlusCircle size={20} />
                  </button>
                  <input
                    className="flex-grow bg-transparent border-none focus:ring-0 text-sm text-[#dfe2eb] px-3 placeholder:text-[#8b909f]/50"
                    placeholder={inputPlaceholder}
                    type="text"
                    value={inputValue}
                    onChange={e => setInputValue(e.target.value)}
                    onKeyDown={handleKeyPress}
                    disabled={isBusy}
                  />
                  <button
                    onClick={() => sendMessage()}
                    disabled={isBusy || !inputValue.trim()}
                    className={`p-2 rounded-full transition-all flex items-center justify-center ${
                      !isBusy && inputValue.trim()
                        ? 'bg-[#acc7ff] text-[#0D1117] hover:scale-105'
                        : 'bg-[#31353c] text-[#8b909f]'
                    }`}
                  >
                    <Send size={18} />
                  </button>
                </div>
              </div>
            </div>
          </main>
        </div>
      </div>
    </>
  );
}