"use client";
import { Puzzle, Bot, Send, LayoutDashboard, MessageSquare, User, Terminal } from 'lucide-react';
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useState, useRef, useCallback } from "react";
import { createAuthenticatedWebSocket } from "@/lib/api";
import ReactMarkdown from 'react-markdown';
import GameBoard from '@/components/GameBoard';
import { Chess } from 'chess.js';

export default function GamePage() {
    const { isLoaded, userId } = useAuth();
    const { redirectToSignIn } = useClerk();
    
    const wsRef = useRef<WebSocket | null>(null);
    const pendingMoveRef = useRef<string | null>(null);
    const isStreamingRef = useRef(false);
    const lastChunkTimeRef = useRef<number>(0); // Fix: Track timing for auto-separation
    
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState<Array<{ type: 'user' | 'ai', content: string }>>([]);
    const [inputValue, setInputValue] = useState('');
    const [isPlaying, setIsPlaying] = useState(true);
    const [fen, setFen] = useState(new Chess().fen());
    const [evaluation, setEvaluation] = useState<number | undefined>(undefined);
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const connectWebSocket = useCallback(async () => {
        if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

        try {
            const wsConnection = await createAuthenticatedWebSocket(
                '/ws/game',
                () => {
                    console.log("✅ WebSocket Connected");
                    setIsConnected(true);
                    // Send new_game message to start the game
                    wsConnection.send(JSON.stringify({ type: 'new_game', color: 'white' }));
                },
                (event) => {
                    try {
                        const data = JSON.parse(event.data);

                        // Handle board updates
                        if (data.type === 'board_update') {
                            isStreamingRef.current = false; 
                            setFen(data.fen);
                            if (data.eval !== undefined) setEvaluation(data.eval);
                            setIsPlaying(true); 
                        }

                        // Handle coaching chunks
                        if (data.type === 'coach_chunk') {
                            const now = Date.now();
                            const timeSinceLastChunk = now - lastChunkTimeRef.current;
                            lastChunkTimeRef.current = now;

                            setMessages(prev => {
                                const lastMsg = prev[prev.length - 1];
                                
                                // Time-Gap Logic: If > 500ms since last data, start a new bubble
                                const isNewBurst = timeSinceLastChunk > 500;
                                
                                if (isNewBurst || !isStreamingRef.current || !lastMsg || lastMsg.type !== 'ai') {
                                    isStreamingRef.current = true;
                                    return [...prev, { type: 'ai', content: data.text || "" }];
                                }

                                // Normal concatenation for active streams
                                const updated = [...prev];
                                updated[updated.length - 1] = { 
                                    ...lastMsg, 
                                    content: lastMsg.content + (data.text || "") 
                                };
                                return updated;
                            });
                        }

                        // Handle coaching done
                        if (data.type === 'coach_done') {
                            // Coaching stream finished
                        }

                        // Handle game over
                        if (data.type === 'game_over') {
                            setIsPlaying(false);
                            setMessages(prev => [...prev, { 
                                type: 'ai', 
                                content: `Game over! Result: ${data.result} - Winner: ${data.winner || 'Draw'}` 
                            }]);
                        }

                        // Handle errors
                        if (data.type === 'error') {
                            setMessages(prev => [...prev, { type: 'ai', content: `Error: ${data.message}` }]);
                        }
                    } catch (e) { 
                        console.error('Error parsing WebSocket message:', e);
                        setIsPlaying(true); 
                    }
                },
                () => setIsConnected(false),
                () => { 
                    setIsConnected(false); 
                    setTimeout(() => connectWebSocket(), 3000); 
                }
            );
            wsRef.current = wsConnection;
        } catch (error) { setIsConnected(false); }
    }, []);

    useEffect(() => {
        if (isLoaded && userId && !wsRef.current) connectWebSocket();
        return () => wsRef.current?.close();
    }, [isLoaded, userId, connectWebSocket]);

    const handleChessMove = (move: string) => {
        const socket = wsRef.current;
        isStreamingRef.current = false; // Reset bubble on new move
        if (socket && socket.readyState === WebSocket.OPEN) {
            socket.send(JSON.stringify({ type: 'move', move: move }));
            setIsPlaying(false);
        } else {
            pendingMoveRef.current = move;
            if (!socket || socket.readyState === WebSocket.CLOSED) connectWebSocket();
        }
    };

    const sendMessage = () => {
        if (inputValue.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
            isStreamingRef.current = false; // Reset bubble on new chat
            setMessages(prev => [...prev, { type: 'user', content: inputValue }]);
            wsRef.current.send(JSON.stringify({ type: 'chat_message', content: inputValue }));
            setInputValue('');
        }
    };

    useEffect(() => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    }, [messages]);

    if (!isLoaded || !userId) return <div className="bg-[#0D1117] h-screen" />;

    return (
        <div className="h-screen w-screen bg-[#0D1117] text-[#dfe2eb] flex flex-col overflow-hidden">
            <header className="h-14 bg-[#181c22] border-b border-[#414754]/15 flex justify-between items-center px-4 z-50">
                <div className="flex items-center gap-3">
                    <Puzzle size={18} className="text-[#acc7ff]" />
                    <span className="font-bold">Chess Sensei</span>
                </div>
                <div className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${isConnected ? 'border-green-500/30 text-green-500' : 'border-red-500/30 text-red-500'}`}>
                    {isConnected ? 'LIVE' : 'RECONNECTING...'}
                </div>
                <UserButton />
            </header>

            <div className="flex flex-1 overflow-hidden">
                <aside className="w-14 bg-[#0a0e14] border-r border-[#414754]/15 flex flex-col items-center py-4 gap-6">
                    <a href="/dashboard" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors">
                        <LayoutDashboard size={20} />
                    </a>
                    <a href="/chat" className="text-[#dfe2eb] transition-colors">
                        <MessageSquare size={20} />
                    </a>
                    <a href="/puzzles" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors">
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

                <main className="flex-1 grid grid-cols-1 lg:grid-cols-[60%_40%] overflow-hidden">
                    <section className="flex items-center justify-center bg-[#0D1117] border-r border-[#414754]/10">
                        <GameBoard onMove={handleChessMove} isPlaying={isPlaying} externalFen={fen} evaluation={evaluation} />
                    </section>

                    <section className="flex flex-col bg-[#0a0e14]/40 relative overflow-hidden">
                        <div className="p-4 border-b border-[#414754]/15 flex items-center gap-2 bg-[#0a0e14]/60">
                            <Bot size={16} className="text-[#acc7ff]" />
                            <h2 className="text-xs font-bold uppercase tracking-widest">Tactical Analysis</h2>
                        </div>

                        <div className="flex-1 overflow-y-auto p-6 space-y-8 pb-32 scrollbar-hide">
                            {messages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-[#8b909f] opacity-20 italic text-sm">
                                    <p>Waiting for move to begin stream...</p>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className="flex items-center gap-2 mb-2">
                                        {msg.type === 'ai' && <Bot size={12} className="text-[#acc7ff]" />}
                                        <span className="text-[10px] font-mono uppercase tracking-wider text-[#8b909f]">
                                            {msg.type === 'user' ? 'Grandmaster' : 'Sensei AI'}
                                        </span>
                                        {msg.type === 'user' && <User size={12} className="text-[#8b909f]" />}
                                    </div>

                                    <div className={`px-4 py-3 rounded-lg max-w-[90%] border shadow-sm ${
                                        msg.type === 'user' 
                                        ? 'bg-[#262a31]/40 border-[#414754]/30' 
                                        : 'bg-[#10141a] border-[#acc7ff]/20 font-mono'
                                    }`}>
                                        {msg.type === 'ai' && (
                                            <div className="text-[#acc7ff]/40 mb-1 flex items-center gap-1 text-[9px]">
                                                <Terminal size={10} /><span>ANALYSIS_LOG</span>
                                            </div>
                                        )}
                                        <div className="text-sm prose prose-invert max-w-none prose-p:leading-relaxed">
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                            {msg.type === 'ai' && i === messages.length - 1 && isStreamingRef.current && (
                                                <span className="inline-block w-1.5 h-4 ml-1 bg-[#acc7ff] animate-pulse align-middle" />
                                            )}
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>

                        <div className="absolute bottom-0 w-full p-4 bg-gradient-to-t from-[#0D1117] via-[#0D1117] to-transparent">
                            <div className="max-w-2xl mx-auto flex items-center gap-2 bg-[#161b22] rounded-full px-4 py-2 border border-[#30363d] focus-within:border-[#acc7ff]/50 transition-all">
                                <input 
                                    className="flex-1 bg-transparent text-sm outline-none px-2 py-1" 
                                    placeholder="Ask Sensei..." 
                                    value={inputValue} 
                                    onChange={e => setInputValue(e.target.value)} 
                                    onKeyDown={e => e.key === 'Enter' && sendMessage()} 
                                />
                                <button 
                                    onClick={sendMessage} 
                                    className="p-2 bg-[#acc7ff] text-[#0D1117] rounded-full hover:scale-105 transition-transform disabled:opacity-50"
                                    disabled={!inputValue.trim()}
                                >
                                    <Send size={14} />
                                </button>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}