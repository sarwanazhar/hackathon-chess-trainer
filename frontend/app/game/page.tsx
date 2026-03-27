"use client";
import { Puzzle, Bot, Send, LayoutDashboard, MessageSquare } from 'lucide-react';
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
    
    const [isConnected, setIsConnected] = useState(false);
    const [messages, setMessages] = useState<Array<{ type: 'user' | 'ai', content: string }>>([]);
    const [inputValue, setInputValue] = useState('');
    const [isPlaying, setIsPlaying] = useState(true);
    const [fen, setFen] = useState(new Chess().fen());
    const messagesEndRef = useRef<HTMLDivElement>(null);

    const connectWebSocket = useCallback(async () => {
        if (wsRef.current?.readyState === WebSocket.CONNECTING) return;

        try {
            const wsConnection = await createAuthenticatedWebSocket(
                '/game',
                () => {
                    console.log("✅ WebSocket Connected");
                    setIsConnected(true);
                },
                (event) => {
                    try {
                        const data = JSON.parse(event.data);
                        console.log("📥 Received:", data);

                        // If we get a board update or a FEN, we MUST unlock the board
                        if (data.type === 'board_update' || data.fen) {
                            if (data.fen) setFen(data.fen);
                            setIsPlaying(true); // UNLOCK BOARD
                            console.log("🔓 Board Unlocked");
                        }

                        if (data.type === 'ai_response' || data.type === 'blunder_insight') {
                            setMessages(prev => {
                                const lastMsg = prev[prev.length - 1];
                                if (lastMsg && lastMsg.type === 'ai') {
                                    const updated = [...prev];
                                    updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + (data.content || "") };
                                    return updated;
                                }
                                return [...prev, { type: 'ai', content: data.content || "" }];
                            });
                        }
                    } catch (e) { 
                        console.log("Raw Message:", event.data);
                        setIsPlaying(true); // Fallback unlock
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

    useEffect(() => {
        if (isConnected && pendingMoveRef.current && wsRef.current?.readyState === WebSocket.OPEN) {
            wsRef.current.send(JSON.stringify({ type: 'move', content: pendingMoveRef.current }));
            pendingMoveRef.current = null;
            setIsPlaying(false);
        }
    }, [isConnected]);

    const handleChessMove = (move: string) => {
        const socket = wsRef.current;
        if (socket && socket.readyState === WebSocket.OPEN) {
            console.log("🚀 Sending Move:", move);
            socket.send(JSON.stringify({ type: 'move', content: move }));
            setIsPlaying(false); // LOCK BOARD
        } else {
            pendingMoveRef.current = move;
            if (!socket || socket.readyState === WebSocket.CLOSED) connectWebSocket();
        }
    };

    const sendMessage = () => {
        if (inputValue.trim() && wsRef.current?.readyState === WebSocket.OPEN) {
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
                    <LayoutDashboard size={20} className="text-[#8b909f]" />
                    <MessageSquare size={20} className="text-[#8b909f]" />
                    <Puzzle size={20} className="text-[#acc7ff]" />
                </aside>

                <main className="flex-1 grid grid-cols-1 lg:grid-cols-[60%_40%] overflow-hidden">
                    <section className="flex items-center justify-center bg-[#0D1117] border-r border-[#414754]/10">
                        <GameBoard onMove={handleChessMove} isPlaying={isPlaying} externalFen={fen} />
                    </section>

                    <section className="flex flex-col bg-[#0a0e14]/40 relative">
                        <div className="p-4 border-b border-[#414754]/15 flex items-center gap-2">
                            <Bot size={16} className="text-[#acc7ff]" />
                            <h2 className="text-xs font-bold uppercase tracking-widest">Tactical Analysis</h2>
                        </div>
                        <div className="flex-1 overflow-y-auto p-6 space-y-4 pb-24">
                            {messages.length === 0 && (
                                <div className="h-full flex flex-col items-center justify-center text-[#8b909f] opacity-20 italic text-sm">
                                    <p>Waiting for move to begin stream...</p>
                                </div>
                            )}
                            {messages.map((msg, i) => (
                                <div key={i} className={`flex flex-col ${msg.type === 'user' ? 'items-end' : 'items-start'}`}>
                                    <div className={`max-w-[90%] p-3 rounded-lg border ${msg.type === 'user' ? 'bg-[#262a31]/40 border-[#414754]/30' : 'bg-[#10141a] border-[#acc7ff]/20'}`}>
                                        <div className="text-sm prose prose-invert">
                                            <ReactMarkdown>{msg.content}</ReactMarkdown>
                                        </div>
                                    </div>
                                </div>
                            ))}
                            <div ref={messagesEndRef} />
                        </div>
                        <div className="absolute bottom-0 w-full p-4 bg-[#0D1117] border-t border-[#414754]/15">
                            <div className="flex items-center gap-2 bg-[#161b22] rounded-xl px-4 py-2 border border-[#30363d]">
                                <input className="flex-1 bg-transparent text-sm outline-none" placeholder="Ask Sensei..." value={inputValue} onChange={e => setInputValue(e.target.value)} onKeyDown={e => e.key === 'Enter' && sendMessage()} />
                                <button onClick={sendMessage} className="text-[#acc7ff]"><Send size={16} /></button>
                            </div>
                        </div>
                    </section>
                </main>
            </div>
        </div>
    );
}