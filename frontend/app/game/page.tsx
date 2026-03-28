"use client";
import { Puzzle, Bot, Send, LayoutDashboard, MessageSquare, User, Terminal, Sparkles, RefreshCw } from 'lucide-react';
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useState, useRef, useCallback } from "react";
import { createAuthenticatedWebSocket } from "@/lib/api";
import ReactMarkdown from 'react-markdown';
import GameBoard from '@/components/GameBoard';
import { Chess } from 'chess.js';

type MessageRole = 'user' | 'ai';

interface ChatMessage {
  id: string;
  type: MessageRole;
  content: string;
  isStreaming?: boolean;
}

export default function GamePage() {
  const { isLoaded, userId } = useAuth();

  const wsRef = useRef<WebSocket | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const streamingIdRef = useRef<string | null>(null); // ID of the currently-streaming message

  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [inputValue, setInputValue] = useState('');
  const [isPlaying, setIsPlaying] = useState(false); // false until game starts
  const [isThinking, setIsThinking] = useState(false); // AI thinking state
  const [fen, setFen] = useState(new Chess().fen());
  const [evaluation, setEvaluation] = useState<number | undefined>(undefined);
  const [playerColor, setPlayerColor] = useState<'white' | 'black'>('white');

  // ── helpers ──────────────────────────────────────────────────────────────

  const addMessage = useCallback((type: MessageRole, content: string, streaming = false): string => {
    const id = `msg_${Date.now()}_${Math.random().toString(36).slice(2)}`;
    setMessages(prev => [...prev, { id, type, content, isStreaming: streaming }]);
    return id;
  }, []);

  const appendToMessage = useCallback((id: string, text: string) => {
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, content: m.content + text, isStreaming: true } : m
    ));
  }, []);

  const finalizeMessage = useCallback((id: string) => {
    setMessages(prev => prev.map(m =>
      m.id === id ? { ...m, isStreaming: false } : m
    ));
    streamingIdRef.current = null;
  }, []);

  // ── WebSocket ─────────────────────────────────────────────────────────────

  const connectWebSocket = useCallback(async () => {
    if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

    try {
      const ws = await createAuthenticatedWebSocket(
        '/ws/game',
        () => {
          setIsConnected(true);
          ws.send(JSON.stringify({ type: 'new_game', color: 'white' }));
        },
        (event) => {
          try {
            const data = JSON.parse(event.data);
            handleServerMessage(data);
          } catch (e) {
            console.error('WS parse error:', e);
          }
        },
        () => setIsConnected(false),
        () => {
          setIsConnected(false);
          setTimeout(() => connectWebSocket(), 3000);
        }
      );
      wsRef.current = ws;
    } catch {
      setIsConnected(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleServerMessage = useCallback((data: any) => {
    switch (data.type) {

      case 'board_update': {
        // ── Authoritative board state from server ──
        setFen(data.fen);
        if (data.eval !== undefined) setEvaluation(data.eval);
        setIsPlaying(true);      // User's turn to move
        setIsThinking(false);    // AI done moving
        break;
      }

      case 'coach_chunk': {
        // ── Streaming coaching text ──
        if (!streamingIdRef.current) {
          // First chunk → create a new message bubble
          const id = addMessage('ai', data.text || '', true);
          streamingIdRef.current = id;
        } else {
          appendToMessage(streamingIdRef.current, data.text || '');
        }
        break;
      }

      case 'coach_done': {
        if (streamingIdRef.current) {
          finalizeMessage(streamingIdRef.current);
        }
        break;
      }

      case 'chat_response': {
        // ── Chat replies (streamed same way) ──
        if (!streamingIdRef.current) {
          const id = addMessage('ai', data.text || '', true);
          streamingIdRef.current = id;
        } else {
          appendToMessage(streamingIdRef.current, data.text || '');
        }
        break;
      }

      case 'chat_done': {
        if (streamingIdRef.current) {
          finalizeMessage(streamingIdRef.current);
        }
        break;
      }

      case 'hint': {
        addMessage('ai', `**Best move:** \`${data.move}\` (eval: ${data.eval > 0 ? '+' : ''}${data.eval?.toFixed(1)})\n\n${data.reason}`);
        break;
      }

      case 'game_over': {
        setIsPlaying(false);
        setIsThinking(false);
        const resultMsg = data.winner
          ? `**Game over — ${data.result}!** Winner: **${data.winner}**`
          : `**Game over — ${data.result}!**`;
        addMessage('ai', resultMsg);
        break;
      }

      case 'error': {
        setIsThinking(false);
        setIsPlaying(true); // re-enable board on error so user isn't stuck
        addMessage('ai', `⚠️ ${data.message}`);
        break;
      }

      // Silently ignore debug_prompt to keep UI clean
      case 'debug_prompt':
        break;

      default:
        console.warn('Unknown message type:', data.type);
    }
  }, [addMessage, appendToMessage, finalizeMessage]);

  useEffect(() => {
    if (isLoaded && userId && !wsRef.current) connectWebSocket();
    return () => wsRef.current?.close();
  }, [isLoaded, userId, connectWebSocket]);

  // Auto-scroll
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, isThinking]);

  // ── Handlers ──────────────────────────────────────────────────────────────

  const handleChessMove = useCallback((move: string) => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    setIsPlaying(false);   // Lock board while waiting for server
    setIsThinking(true);   // Show AI thinking indicator
    streamingIdRef.current = null; // Reset streaming for new move's coaching

    socket.send(JSON.stringify({ type: 'move', move }));
  }, []);

  const handleNewGame = useCallback((color: 'white' | 'black' = 'white') => {
    const socket = wsRef.current;
    if (!socket || socket.readyState !== WebSocket.OPEN) return;

    setMessages([]);
    setEvaluation(undefined);
    setIsThinking(false);
    setIsPlaying(false);
    setPlayerColor(color);
    streamingIdRef.current = null;
    setFen(new Chess().fen());

    socket.send(JSON.stringify({ type: 'new_game', color }));
  }, []);

  const sendChatMessage = useCallback(() => {
    const socket = wsRef.current;
    const text = inputValue.trim();
    if (!text || !socket || socket.readyState !== WebSocket.OPEN) return;

    addMessage('user', text);
    setInputValue('');
    streamingIdRef.current = null; // New chat response gets its own bubble
    socket.send(JSON.stringify({ type: 'chat_message', content: text }));
  }, [inputValue, addMessage]);

  if (!isLoaded || !userId) return <div className="bg-[#0D1117] h-screen" />;

  return (
    <div className="h-screen w-screen bg-[#0D1117] text-[#dfe2eb] flex flex-col overflow-hidden font-mono">
      {/* Header */}
      <header className="h-14 bg-[#0a0e14] border-b border-[#1e2530] flex justify-between items-center px-5 z-50 shrink-0">
        <div className="flex items-center gap-3">
          <Puzzle size={17} className="text-[#7aa2f7]" />
          <span className="font-bold tracking-wide text-[#c0caf5] text-sm">Chess Sensei</span>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => handleNewGame(playerColor)}
            className="flex items-center gap-1.5 text-[10px] px-3 py-1.5 rounded border border-[#1e2530] text-[#6b7280] hover:text-[#c0caf5] hover:border-[#414754] transition-all"
          >
            <RefreshCw size={10} />
            New Game
          </button>

          <div className={`text-[9px] px-2.5 py-1 rounded-full border font-bold tracking-widest transition-all ${
            isConnected
              ? 'border-[#9ece6a]/30 text-[#9ece6a] bg-[#9ece6a]/5'
              : 'border-[#f7768e]/30 text-[#f7768e] bg-[#f7768e]/5'
          }`}>
            {isConnected ? '● LIVE' : '○ RECONNECTING'}
          </div>

          <UserButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar */}
        <aside className="w-12 bg-[#070a0f] border-r border-[#1e2530] flex flex-col items-center py-5 gap-5 shrink-0">
          <a href="/dashboard" title="Dashboard" className="text-[#414754] hover:text-[#7aa2f7] transition-colors">
            <LayoutDashboard size={18} />
          </a>
          <a href="/chat" title="Chat" className="text-[#7aa2f7]">
            <MessageSquare size={18} />
          </a>
          <a href="/puzzles" title="Puzzles" className="text-[#414754] hover:text-[#7aa2f7] transition-colors">
            <Puzzle size={18} />
          </a>
          <a href="/games" title="Game History" className="text-[#414754] hover:text-[#7aa2f7] transition-colors">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L2 7L12 12L22 7L12 2Z" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 17L12 22L22 17" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
              <path d="M2 12L12 17L22 12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </a>
        </aside>

        {/* Main */}
        <main className="flex-1 grid grid-cols-1 lg:grid-cols-[58%_42%] overflow-hidden">

          {/* Board */}
          <section className="flex items-center justify-center bg-[#0D1117] border-r border-[#1e2530] overflow-hidden">
            <GameBoard
              onMove={handleChessMove}
              isPlaying={isPlaying}
              externalFen={fen}
              evaluation={evaluation}
              playerColor={playerColor}
            />
          </section>

          {/* Chat Panel */}
          <section className="flex flex-col bg-[#070a0f] relative overflow-hidden">

            {/* Panel Header */}
            <div className="px-5 py-3.5 border-b border-[#1e2530] flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Bot size={14} className="text-[#7aa2f7]" />
                <span className="text-[10px] font-bold uppercase tracking-[0.15em] text-[#565f89]">
                  Sensei Analysis
                </span>
              </div>
              {isThinking && (
                <div className="flex items-center gap-1.5 text-[9px] text-[#7aa2f7] animate-pulse">
                  <Sparkles size={10} />
                  <span>thinking...</span>
                </div>
              )}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-5 space-y-5 pb-28 scrollbar-hide">

              {messages.length === 0 && !isThinking && (
                <div className="h-full flex flex-col items-center justify-center gap-3 opacity-20 select-none">
                  <Bot size={28} className="text-[#565f89]" />
                  <p className="text-[11px] text-[#565f89] tracking-wider">Make a move to begin</p>
                </div>
              )}

              {messages.map((msg) => (
                <div key={msg.id} className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}>

                  {/* Label */}
                  <div className="flex items-center gap-1.5 mb-1.5">
                    {msg.type === 'ai' && <Bot size={10} className="text-[#7aa2f7]" />}
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#414754]">
                      {msg.type === 'user' ? 'You' : 'Sensei'}
                    </span>
                    {msg.type === 'user' && <User size={10} className="text-[#414754]" />}
                  </div>

                  {/* Bubble */}
                  <div className={`px-4 py-3 rounded-lg max-w-[92%] text-sm leading-relaxed ${
                    msg.type === 'user'
                      ? 'bg-[#1a1f2a] border border-[#2a3042] text-[#a9b1d6]'
                      : 'bg-[#0d1117] border border-[#1e2530] text-[#c0caf5]'
                  }`}>
                    {msg.type === 'ai' && (
                      <div className="flex items-center gap-1 mb-2 text-[8px] text-[#414754] uppercase tracking-widest border-b border-[#1e2530] pb-1.5">
                        <Terminal size={8} />
                        <span>analysis</span>
                      </div>
                    )}
                    <div className="prose prose-invert max-w-none prose-p:leading-relaxed prose-p:my-1 prose-code:text-[#7aa2f7] prose-code:bg-[#1a1f2a] prose-code:px-1 prose-code:rounded prose-strong:text-[#c0caf5]">
                      <ReactMarkdown>{msg.content}</ReactMarkdown>
                    </div>
                    {/* Streaming cursor */}
                    {msg.isStreaming && (
                      <span className="inline-block w-1.5 h-[14px] ml-0.5 bg-[#7aa2f7] opacity-80 animate-pulse align-[-2px]" />
                    )}
                  </div>
                </div>
              ))}

              {/* AI Thinking Indicator */}
              {isThinking && (
                <div className="flex flex-col items-start">
                  <div className="flex items-center gap-1.5 mb-1.5">
                    <Bot size={10} className="text-[#7aa2f7]" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.12em] text-[#414754]">Sensei</span>
                  </div>
                  <div className="px-4 py-3 rounded-lg bg-[#0d1117] border border-[#1e2530]">
                    <div className="flex items-center gap-1 mb-2 text-[8px] text-[#414754] uppercase tracking-widest border-b border-[#1e2530] pb-1.5">
                      <Terminal size={8} />
                      <span>processing position</span>
                    </div>
                    <ThinkingDots />
                  </div>
                </div>
              )}

              <div ref={messagesEndRef} />
            </div>

            {/* Input */}
            <div className="absolute bottom-0 w-full p-4 bg-gradient-to-t from-[#070a0f] via-[#070a0f]/95 to-transparent shrink-0">
              <div className="flex items-center gap-2 bg-[#0d1117] rounded-lg px-4 py-2.5 border border-[#1e2530] focus-within:border-[#7aa2f7]/40 transition-all duration-200">
                <input
                  className="flex-1 bg-transparent text-[13px] outline-none text-[#c0caf5] placeholder:text-[#414754]"
                  placeholder="Ask Sensei anything..."
                  value={inputValue}
                  onChange={e => setInputValue(e.target.value)}
                  onKeyDown={e => e.key === 'Enter' && sendChatMessage()}
                />
                <button
                  onClick={sendChatMessage}
                  disabled={!inputValue.trim()}
                  className="p-1.5 bg-[#7aa2f7] text-[#0d1117] rounded-md hover:bg-[#8aa8f7] disabled:opacity-30 disabled:cursor-not-allowed transition-all"
                >
                  <Send size={12} />
                </button>
              </div>
            </div>
          </section>
        </main>
      </div>
    </div>
  );
}

// ── Thinking animation component ─────────────────────────────────────────────
function ThinkingDots() {
  return (
    <div className="flex items-center gap-1.5 h-5">
      {[0, 1, 2].map(i => (
        <span
          key={i}
          className="w-1.5 h-1.5 rounded-full bg-[#7aa2f7] opacity-60"
          style={{
            animation: `thinkingBounce 1.2s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
      <style>{`
        @keyframes thinkingBounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.4; }
          40% { transform: translateY(-5px); opacity: 1; }
        }
      `}</style>
    </div>
  );
}