"use client";
import { Grid, Zap, Puzzle, User, Bot, Terminal, PlusCircle, Send, Wifi, WifiOff } from 'lucide-react';
import { UserButton, useAuth, useClerk } from "@clerk/nextjs";
import { useEffect, useState, useRef } from "react";
import { createAuthenticatedWebSocket } from "@/lib/api";
import ReactMarkdown from 'react-markdown';

export default function ChatPage() {
  const { isLoaded, userId } = useAuth();
  const { redirectToSignIn } = useClerk();
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [messages, setMessages] = useState<Array<{ type: 'user' | 'ai', content: string }>>([]);
  const [inputValue, setInputValue] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  // Auth Redirect
  useEffect(() => {
    if (isLoaded && !userId) {
      redirectToSignIn({ signInFallbackRedirectUrl: "/chat" });
    }
  }, [isLoaded, userId, redirectToSignIn]);

  // WebSocket Connection
  useEffect(() => {
    if (isLoaded && userId) {
      connectWebSocket();
    }
    return () => ws?.close();
  }, [isLoaded, userId]);

  // Auto-scroll logic
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const connectWebSocket = async () => {
    try {
      const wsConnection = await createAuthenticatedWebSocket(
        '/chat',
        () => setIsConnected(true),
        (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'ai_response' || data.type === 'blunder_insight') {
              setMessages(prev => {
                const lastMsg = prev[prev.length - 1];
                if (lastMsg && lastMsg.type === 'ai') {
                  const updatedMessages = [...prev];
                  updatedMessages[updatedMessages.length - 1] = {
                    ...lastMsg,
                    content: lastMsg.content + data.content
                  };
                  return updatedMessages;
                }
                return [...prev, { type: 'ai', content: data.content }];
              });
            }
          } catch (error) {
            console.error('Error parsing JSON:', error);
          }
        },
        () => setIsConnected(false),
        () => {
          setIsConnected(false);
          setTimeout(() => { if (isLoaded && userId) connectWebSocket(); }, 3000);
        }
      );
      setWs(wsConnection);
    } catch (error) {
      setIsConnected(false);
    }
  };

  const sendMessage = () => {
    if (inputValue.trim() && ws && isConnected) {
      setMessages(prev => [...prev, { type: 'user', content: inputValue }]);
      ws.send(JSON.stringify({ type: 'chat_message', content: inputValue }));
      setInputValue('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  };

  if (!isLoaded) return (
    <div className="min-h-screen w-full flex items-center justify-center bg-[#0D1117] text-[#8b909f]">
      <div className="animate-pulse font-mono text-sm tracking-widest uppercase">Verifying Session...</div>
    </div>
  );

  if (!userId) return null;

  return (
    <div className="h-screen w-screen bg-[#0D1117] text-[#dfe2eb] font-body overflow-hidden flex flex-col">
      <header className="h-16 bg-[#181c22] border-b border-[#414754]/15 flex justify-between items-center px-6 z-50 flex-shrink-0">
        <div className="flex items-center gap-4">
          <span className="text-xl font-bold tracking-tight">Chess Senpai</span>
          <div className="h-4 w-px bg-[#414754]/30 ml-2"></div>
          <span className="text-[#acc7ff] font-bold text-lg">Sensei Chat</span>
        </div>
        <div className="flex items-center gap-4">
          <div className={`flex items-center gap-2 px-3 py-1 rounded-full text-xs ${
            isConnected ? 'bg-[#7bdb80]/10 border-[#7bdb80]/30 border' : 'bg-[#ff6b6b]/10 border-[#ff6b6b]/30 border'
          }`}>
            {isConnected ? <Wifi size={14} className="text-[#7bdb80]" /> : <WifiOff size={14} className="text-[#ff6b6b]" />}
            <span className={isConnected ? "text-[#7bdb80]" : "text-[#ff6b6b]"}>{isConnected ? 'Connected' : 'Connecting...'}</span>
          </div>
          <UserButton afterSwitchSessionUrl="/chat" />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="w-16 bg-[#0a0e14] border-r border-[#414754]/15 flex flex-col items-center py-6 gap-8 flex-shrink-0">
          <a href="/dashboard" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors flex flex-col items-center gap-1">
            <Grid size={20} /><span className="text-[10px]">Board</span>
          </a>
          <a href="/chat" className="text-[#acc7ff] transition-colors flex flex-col items-center gap-1">
            <Zap size={20} /><span className="text-[10px]">Chat</span>
          </a>
          <a href="#" className="text-[#8b909f] hover:text-[#dfe2eb] transition-colors flex flex-col items-center gap-1">
            <Puzzle size={20} /><span className="text-[10px]">Puzzles</span>
          </a>
        </aside>

        <main className="flex-1 flex flex-col relative bg-[#0D1117] overflow-hidden">
          <div className="flex-1 overflow-y-auto px-6 py-8 space-y-8 scrollbar-hide pb-32">
            <div className="max-w-4xl mx-auto w-full space-y-10">
              {messages.map((message, index) => (
                <div key={index} className={`flex flex-col ${message.type === 'user' ? 'items-end' : 'items-start'}`}>
                  <div className="flex items-center gap-3 mb-2">
                    {message.type === 'ai' && (
                      <div className="w-6 h-6 rounded bg-[#acc7ff]/10 flex items-center justify-center border border-[#acc7ff]/30">
                        <Bot size={14} className="text-[#acc7ff]" />
                      </div>
                    )}
                    <span className={`text-[10px] font-mono uppercase tracking-wider ${message.type === 'user' ? 'text-[#8b909f]' : 'text-[#acc7ff]'}`}>
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
                    
                    {/* 2. REPLACED <p> WITH <ReactMarkdown> */}
                    <div className="text-sm leading-relaxed prose prose-invert max-w-none prose-p:leading-relaxed prose-headings:text-[#acc7ff] prose-strong:text-white prose-ul:list-disc prose-ul:ml-4">
                      <ReactMarkdown>{message.content}</ReactMarkdown>
                      {message.type === 'ai' && index === messages.length - 1 && <span className="inline-block w-1.5 h-4 ml-1 bg-[#acc7ff] animate-pulse align-middle" />}
                    </div>
                  </div>
                </div>
              ))}
              <div ref={messagesEndRef} />
            </div>
          </div>

          <div className="absolute bottom-0 left-0 w-full p-6 bg-gradient-to-t from-[#0D1117] via-[#0D1117] to-transparent">
            <div className="max-w-2xl mx-auto relative group">
              <div className="absolute -inset-0.5 bg-[#acc7ff]/20 rounded-full blur opacity-0 group-focus-within:opacity-100 transition duration-300"></div>
              <div className="relative flex items-center bg-[#161b22] border border-[#30363d] rounded-full px-4 py-2 shadow-2xl">
                <button className="p-2 text-[#8b909f] hover:text-[#acc7ff] transition-colors"><PlusCircle size={20} /></button>
                <input 
                  className="flex-grow bg-transparent border-none focus:ring-0 text-sm text-[#dfe2eb] px-3 placeholder:text-[#8b909f]/50" 
                  placeholder={isConnected ? "Ask Sensei about your game..." : "Reconnecting..."} 
                  type="text"
                  value={inputValue}
                  onChange={(e) => setInputValue(e.target.value)}
                  onKeyDown={handleKeyPress}
                  disabled={!isConnected}
                />
                <button 
                  onClick={sendMessage}
                  disabled={!isConnected || !inputValue.trim()}
                  className={`p-2 rounded-full transition-all flex items-center justify-center ${
                    isConnected ? 'bg-[#acc7ff] text-[#0D1117] hover:scale-105' : 'bg-[#31353c] text-[#8b909f]'
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
  );
}