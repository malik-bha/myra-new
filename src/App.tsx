import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Send, 
  Mic, 
  MicOff, 
  Volume2, 
  VolumeX, 
  MessageSquare, 
  X,
  Trash2,
  Smile,
  Sparkles,
  Key,
  LogOut,
  Loader2
} from 'lucide-react';
import Markdown from 'react-markdown';
import { myraService } from './services/myraService';
import { Message, ChatMode } from './types';
import { cn } from './lib/utils';
import { MyraAvatar } from './components/MyraAvatar';

export default function App() {
  const [apiKey, setApiKey] = useState<string | null>(localStorage.getItem('myra_api_key'));
  const [apiKeyInput, setApiKeyInput] = useState('');
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [mode, setMode] = useState<ChatMode>('chat');
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceEnabled, setVoiceEnabled] = useState(true);
  const [isLoading, setIsLoading] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  
  const chatEndRef = useRef<HTMLDivElement>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const liveSessionRef = useRef<any>(null);
  const audioQueueRef = useRef<string[]>([]);
  const isPlayingRef = useRef(false);
  const isGeneratingRef = useRef(false);
  const ttsGenerationQueueRef = useRef<string[]>([]);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);

  // Initialize MyraService with API key if available
  useEffect(() => {
    if (apiKey) {
      myraService.setApiKey(apiKey);
    }
  }, [apiKey]);

  const handleApiKeySubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (apiKeyInput.trim()) {
      localStorage.setItem('myra_api_key', apiKeyInput.trim());
      setApiKey(apiKeyInput.trim());
    }
  };

  const handleLogout = () => {
    if (window.confirm('Kya aap logout karna chahte hain?')) {
      localStorage.removeItem('myra_api_key');
      myraService.reset();
      setApiKey(null);
      setApiKeyInput('');
    }
  };

  // Load messages from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem('myra_chat_history');
    if (saved) {
      try {
        setMessages(JSON.parse(saved));
      } catch (e) {
        console.error('Failed to load history', e);
      }
    }
  }, []);

  // Save messages to localStorage whenever they change
  useEffect(() => {
    if (messages.length > 0) {
      localStorage.setItem('myra_chat_history', JSON.stringify(messages));
    }
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const startRecording = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      mediaRecorderRef.current = recorder;
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) {
          audioChunksRef.current.push(e.data);
        }
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: 'audio/webm' });
        await sendVoiceMessage(audioBlob);
        stream.getTracks().forEach(t => t.stop());
      };

      recorder.start();
      setIsRecording(true);
    } catch (err) {
      console.error('Failed to start recording', err);
    }
  };

  const stopRecording = () => {
    if (mediaRecorderRef.current && isRecording) {
      mediaRecorderRef.current.stop();
      setIsRecording(false);
    }
  };

  const sendVoiceMessage = async (blob: Blob) => {
    setIsLoading(true);
    try {
      const reader = new FileReader();
      reader.readAsDataURL(blob);
      reader.onloadend = async () => {
        const base64Audio = (reader.result as string).split(',')[1];
        
        // Add user message to UI
        const userMessageId = Date.now().toString();
        setMessages(prev => [...prev, {
          id: userMessageId,
          role: 'user',
          text: '🎤 Voice Message',
          timestamp: Date.now()
        }]);

        const history = messages.map(m => ({
          role: m.role === 'model' ? 'model' : 'user',
          parts: [{ text: m.text }]
        }));

        const stream = await myraService.generateContentStream([
          ...history,
          { 
            role: 'user', 
            parts: [
              { inlineData: { data: base64Audio, mimeType: 'audio/webm' } },
              { text: "Listen to my voice and reply to me in Hindi/Urdu. Address me as Shoaib occasionally." }
            ] 
          }
        ]);
        
        let fullText = '';
        let currentSentence = '';
        const botMessageId = (Date.now() + 1).toString();

        setMessages(prev => [...prev, {
          id: botMessageId,
          role: 'model',
          text: '',
          timestamp: Date.now()
        }]);

        let lastUpdate = Date.now();
        for await (const chunk of stream) {
          const textChunk = chunk.text || "";
          fullText += textChunk;
          currentSentence += textChunk;

          // Throttle UI updates to 100ms for speed
          const now = Date.now();
          if (now - lastUpdate > 100) {
            setMessages(prev => prev.map(m => 
              m.id === botMessageId ? { ...m, text: fullText } : m
            ));
            lastUpdate = now;
          }

          if (voiceEnabled && /[.!?\n]/.test(textChunk)) {
            const sentence = currentSentence.trim();
            if (sentence.length > 30) {
              queueSpeech(sentence);
              currentSentence = '';
            }
          }
        }

        // Final update
        setMessages(prev => prev.map(m => 
          m.id === botMessageId ? { ...m, text: fullText } : m
        ));

        if (voiceEnabled && currentSentence.trim()) {
          queueSpeech(currentSentence.trim());
        }

        setIsLoading(false);
      };
    } catch (error: any) {
      console.error('Voice message error:', error);
      const isRateLimit = error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429;
      if (isRateLimit) {
        alert("Myra thoda thak gayi hai (Rate Limit). Please thodi der baad try karein.");
      } else {
        alert("Network mein kuch masla hai, please dobara koshish karein.");
      }
      setIsLoading(false);
    }
  };

  const handleSend = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      text: input,
      timestamp: Date.now(),
    };

    setMessages(prev => [...prev, userMessage]);
    setInput('');
    setIsLoading(true);

    try {
      const history = messages.map(m => ({
        role: m.role === 'model' ? 'model' : 'user',
        parts: [{ text: m.text }]
      }));

      const stream = await myraService.getChatResponseStream(input, history);
      
      let fullText = '';
      let currentSentence = '';
      const botMessageId = (Date.now() + 1).toString();

      setMessages(prev => [...prev, {
        id: botMessageId,
        role: 'model',
        text: '',
        timestamp: Date.now()
      }]);

      let lastUpdate = Date.now();
      for await (const chunk of stream) {
        const textChunk = chunk.text || "";
        fullText += textChunk;
        currentSentence += textChunk;

        // Throttle UI updates to 100ms for speed
        const now = Date.now();
        if (now - lastUpdate > 100) {
          setMessages(prev => prev.map(m => 
            m.id === botMessageId ? { ...m, text: fullText } : m
          ));
          lastUpdate = now;
        }

        if (voiceEnabled && /[.!?\n]/.test(textChunk)) {
          const sentence = currentSentence.trim();
          if (sentence.length > 30) {
            queueSpeech(sentence);
            currentSentence = '';
          }
        }
      }

      // Final update
      setMessages(prev => prev.map(m => 
        m.id === botMessageId ? { ...m, text: fullText } : m
      ));

      if (voiceEnabled && currentSentence.trim()) {
        queueSpeech(currentSentence.trim());
      }

      setIsLoading(false);
    } catch (error: any) {
      console.error('Chat error:', error);
      const isRateLimit = error?.status === 'RESOURCE_EXHAUSTED' || error?.code === 429;
      if (isRateLimit) {
        alert("Myra thoda thak gayi hai (Rate Limit Exceeded). Please thodi der baad try karein.");
      } else {
        alert("Kuch technical masla aa raha hai, please refresh karke dekhein.");
      }
      setIsLoading(false);
    }
  };

  const queueSpeech = (text: string) => {
    ttsGenerationQueueRef.current.push(text);
    processGenerationQueue();
  };

  const processGenerationQueue = async () => {
    if (isGeneratingRef.current || ttsGenerationQueueRef.current.length === 0) return;

    isGeneratingRef.current = true;
    
    while (ttsGenerationQueueRef.current.length > 0) {
      const text = ttsGenerationQueueRef.current.shift();
      if (text) {
        try {
          // Add a small delay between requests to respect RPM
          await new Promise(resolve => setTimeout(resolve, 500));
          const base64Audio = await myraService.generateSpeech(text);
          if (base64Audio) {
            audioQueueRef.current.push(base64Audio);
            processAudioQueue();
          }
        } catch (error: any) {
          console.error('Generation queue error:', error);
        }
      }
    }
    
    isGeneratingRef.current = false;
  };

  const processAudioQueue = async () => {
    if (isPlayingRef.current || audioQueueRef.current.length === 0) {
      if (audioQueueRef.current.length === 0 && !isPlayingRef.current) {
        setIsSpeaking(false);
      }
      return;
    }

    isPlayingRef.current = true;
    setIsSpeaking(true);
    
    while (audioQueueRef.current.length > 0) {
      const nextAudio = audioQueueRef.current.shift();
      if (nextAudio) {
        await playAudio(nextAudio);
      }
    }
    
    isPlayingRef.current = false;
    setIsSpeaking(false);
  };

  const speakText = async (text: string) => {
    queueSpeech(text);
  };

  const playAudio = async (base64Data: string, sampleRate: number = 24000) => {
    return new Promise<void>(async (resolve) => {
      if (!audioContextRef.current) {
        audioContextRef.current = new AudioContext();
      }
      const ctx = audioContextRef.current;
      if (ctx.state === 'suspended') await ctx.resume();
      
      const binary = atob(base64Data);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      const pcm = new Int16Array(bytes.buffer);
      const float32 = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i++) float32[i] = pcm[i] / 0x7FFF;

      const buffer = ctx.createBuffer(1, float32.length, sampleRate);
      buffer.getChannelData(0).set(float32);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.onended = () => resolve();
      source.start();
    });
  };

  const toggleVoiceMode = async () => {
    if (mode === 'chat') {
      setMode('voice');
    } else {
      setMode('chat');
    }
  };

  const clearHistory = () => {
    if (window.confirm('Kya aap saari purani baatein bhulana chahte hain?')) {
      setMessages([]);
      localStorage.removeItem('myra_chat_history');
    }
  };

  if (!apiKey) {
    return (
      <div className="flex flex-col items-center justify-center h-screen bg-zinc-900 p-6">
        <motion.div 
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="w-full max-w-md bg-white rounded-3xl p-8 shadow-2xl space-y-6"
        >
          <div className="flex flex-col items-center text-center space-y-2">
            <div className="w-16 h-16 bg-blue-100 rounded-2xl flex items-center justify-center mb-2">
              <Key className="w-8 h-8 text-blue-600" />
            </div>
            <h1 className="text-2xl font-bold text-zinc-900">Welcome to Myra</h1>
            <p className="text-zinc-500 text-sm">Apni Gemini API Key enter karein shuru karne ke liye.</p>
          </div>

          <form onSubmit={handleApiKeySubmit} className="space-y-4">
            <input
              type="password"
              value={apiKeyInput}
              onChange={(e) => setApiKeyInput(e.target.value)}
              placeholder="Enter Gemini API Key"
              className="w-full px-5 py-4 bg-zinc-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-200 transition-all text-zinc-800"
              required
            />
            <button
              type="submit"
              className="w-full py-4 bg-zinc-900 text-white rounded-2xl font-bold hover:bg-zinc-800 transition-all active:scale-[0.98]"
            >
              Start Chatting
            </button>
          </form>
          
          <p className="text-[10px] text-center text-zinc-400">
            Aapki API key aapke browser mein save rahegi.
          </p>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-screen bg-zinc-50 overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-6 py-4 bg-white border-b border-zinc-200 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-zinc-800 rounded-full flex items-center justify-center shadow-md">
            <Smile className="w-6 h-6 text-white" />
          </div>
          <div>
            <h1 className="text-lg font-bold bg-gradient-to-r from-blue-600 to-zinc-900 bg-clip-text text-transparent leading-tight">Myra</h1>
            <div className="flex items-center gap-1.5">
              <span className="w-2 h-2 bg-emerald-500 rounded-full animate-pulse" />
              <span className="text-xs text-zinc-500 font-medium uppercase tracking-wider">Online</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <button
            onClick={handleLogout}
            className="p-2 text-zinc-400 hover:text-zinc-600 transition-colors"
            title="Logout"
          >
            <LogOut size={20} />
          </button>
          <button
            onClick={clearHistory}
            className="p-2 text-zinc-400 hover:text-red-500 transition-colors"
            title="Clear History"
          >
            <Trash2 size={20} />
          </button>
          <button
            onClick={() => setVoiceEnabled(!voiceEnabled)}
            className={cn(
              "p-2 rounded-full transition-colors",
              voiceEnabled ? "bg-blue-50 text-blue-600" : "bg-zinc-100 text-zinc-400"
            )}
          >
            {voiceEnabled ? <Volume2 size={20} /> : <VolumeX size={20} />}
          </button>
          <button
            onClick={toggleVoiceMode}
            className={cn(
              "flex items-center gap-2 px-4 py-2 rounded-full font-medium transition-all",
              mode === 'voice' 
                ? "bg-blue-600 text-white shadow-lg shadow-blue-200" 
                : "bg-zinc-900 text-white hover:bg-zinc-800"
            )}
          >
            {mode === 'voice' ? <MessageSquare size={18} /> : <Mic size={18} />}
            <span className="hidden sm:inline">{mode === 'voice' ? 'Chat Mode' : 'Speak to Speak'}</span>
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 relative overflow-hidden flex flex-col">
        <AnimatePresence mode="wait">
          {mode === 'chat' ? (
            <motion.div
              key="chat"
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -20 }}
              className="flex-1 overflow-y-auto p-6 space-y-6"
            >
              {messages.length === 0 && (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-6">
                  <motion.div 
                    animate={{ 
                      rotate: [0, 10, -10, 0],
                      scale: [1, 1.1, 1]
                    }}
                    transition={{ repeat: Infinity, duration: 5 }}
                    className="w-24 h-24 bg-gradient-to-tr from-blue-100 to-zinc-200 rounded-3xl flex items-center justify-center shadow-inner"
                  >
                    <Sparkles className="w-12 h-12 text-blue-500 animate-pulse" />
                  </motion.div>
                </div>
              )}
              
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={cn(
                    "flex w-full",
                    msg.role === 'user' ? "justify-end" : "justify-start"
                  )}
                >
                  <div
                    className={cn(
                      "max-w-[85%] sm:max-w-[70%] px-4 py-3 rounded-2xl shadow-sm",
                      msg.role === 'user'
                        ? "bg-zinc-900 text-white rounded-tr-none"
                        : "bg-white text-zinc-800 border border-zinc-100 rounded-tl-none"
                    )}
                  >
                    <div className="markdown-body text-sm sm:text-base leading-relaxed">
                      <Markdown>{msg.text}</Markdown>
                    </div>
                    <div className={cn(
                      "text-[10px] mt-1.5 opacity-50 font-medium",
                      msg.role === 'user' ? "text-right" : "text-left"
                    )}>
                      {new Date(msg.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                    </div>
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="flex justify-start"
                >
                  <div className="bg-white text-zinc-800 border border-zinc-100 px-4 py-3 rounded-2xl rounded-tl-none shadow-sm flex items-center gap-2">
                    <span className="text-sm font-medium text-zinc-500">Myra typing</span>
                    <div className="flex gap-1">
                      <motion.span
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0 }}
                        className="w-1.5 h-1.5 bg-blue-400 rounded-full"
                      />
                      <motion.span
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.2 }}
                        className="w-1.5 h-1.5 bg-blue-400 rounded-full"
                      />
                      <motion.span
                        animate={{ opacity: [0, 1, 0] }}
                        transition={{ repeat: Infinity, duration: 1, delay: 0.4 }}
                        className="w-1.5 h-1.5 bg-blue-400 rounded-full"
                      />
                    </div>
                  </div>
                </motion.div>
              )}
              
              <div ref={chatEndRef} />
            </motion.div>
          ) : (
            <motion.div
              key="voice"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="flex-1 flex flex-col bg-zinc-900"
            >
              {/* Top Half: Myra */}
              <div className="flex-1 flex flex-col items-center justify-center relative border-b border-white/5">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <motion.div 
                    animate={{ 
                      scale: isSpeaking ? [1, 1.2, 1] : 1,
                      opacity: isSpeaking ? [0.2, 0.4, 0.2] : 0.1
                    }}
                    transition={{ repeat: Infinity, duration: 2 }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-64 h-64 bg-blue-500 rounded-full blur-[80px]" 
                  />
                </div>
                
                <MyraAvatar isSpeaking={isSpeaking} isListening={false} />
                
                <div className="mt-6 text-center z-10">
                  <h2 className="text-xl font-serif italic text-white">
                    {isSpeaking ? 'Myra is speaking...' : isLoading ? 'Myra is thinking...' : 'Myra is waiting...'}
                  </h2>
                </div>
              </div>

              {/* Bottom Half: User */}
              <div className="flex-1 flex flex-col items-center justify-center relative bg-zinc-950">
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                  <motion.div 
                    animate={{ 
                      scale: isRecording ? [1, 1.5, 1] : 1,
                      opacity: isRecording ? [0.2, 0.5, 0.2] : 0
                    }}
                    transition={{ repeat: Infinity, duration: 1.5 }}
                    className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-48 h-48 bg-emerald-500 rounded-full blur-[60px]" 
                  />
                </div>

                <div className="flex flex-col items-center gap-6 z-10">
                  <p className="text-zinc-400 text-sm font-medium uppercase tracking-widest">
                    {isRecording ? 'Recording...' : 'Hold to Speak'}
                  </p>
                  
                  <button
                    onMouseDown={startRecording}
                    onMouseUp={stopRecording}
                    onTouchStart={startRecording}
                    onTouchEnd={stopRecording}
                    className={cn(
                      "w-24 h-24 rounded-full flex items-center justify-center transition-all duration-300 shadow-2xl",
                      isRecording 
                        ? "bg-emerald-500 text-white scale-110" 
                        : "bg-white/10 text-white hover:bg-white/20 active:scale-95"
                    )}
                  >
                    {isLoading ? (
                      <Loader2 className="w-10 h-10 animate-spin" />
                    ) : (
                      <Mic className="w-10 h-10" />
                    )}
                  </button>
                  
                  <p className="text-zinc-500 text-xs italic">
                    {isRecording ? 'Chhodo jab bolna khatm ho jaye' : 'Shoaib, press karke rakho'}
                  </p>
                </div>
              </div>

              <button
                onClick={toggleVoiceMode}
                className="absolute top-6 right-6 p-3 bg-white/10 hover:bg-white/20 text-white rounded-full backdrop-blur-md border border-white/10 transition-all z-30"
              >
                <X size={20} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Input Area */}
      {mode === 'chat' && (
        <footer className="p-4 bg-white border-t border-zinc-200 z-20">
          <form
            onSubmit={handleSend}
            className="max-w-4xl mx-auto flex items-center gap-2"
          >
            <div className="flex-1 relative">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Type a message to Myra..."
                className="w-full px-5 py-3 bg-zinc-100 border-none rounded-2xl focus:ring-2 focus:ring-blue-200 transition-all text-zinc-800 placeholder:text-zinc-400"
                disabled={isLoading}
              />
              {isLoading && (
                <div className="absolute right-4 top-1/2 -translate-y-1/2">
                  <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={!input.trim() || isLoading}
              className="p-3 bg-zinc-900 text-white rounded-2xl hover:bg-zinc-800 disabled:opacity-50 disabled:cursor-not-allowed transition-all shadow-md active:scale-95"
            >
              <Send size={20} />
            </button>
          </form>
        </footer>
      )}
    </div>
  );
}
