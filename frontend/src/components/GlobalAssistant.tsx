import { useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic, Loader2, Volume2, X, Settings } from 'lucide-react';
import { useVoiceAssistant, type SpeakSettings } from '../hooks/useVoiceAssistant';

const VOICE_WS_URL = 'ws://localhost:8001';

type Message = { role: 'user' | 'assistant'; text: string };

type VoiceConfig = {
  rate: number;   // 0.5 | 1.0 | 1.5
  pitch: number;  // 0.7 | 1.0 | 1.3
  autoSpeak: boolean;
};

const DEFAULT_CONFIG: VoiceConfig = { rate: 1.0, pitch: 1.0, autoSpeak: true };

function loadConfig(): VoiceConfig {
  try {
    const saved = localStorage.getItem('finto_voice_config');
    return saved ? { ...DEFAULT_CONFIG, ...(JSON.parse(saved) as Partial<VoiceConfig>) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

const extractPageContext = () => {
  const el = document.getElementById('main-content');
  return el ? el.innerText.slice(0, 2000) : null;
};

export default function GlobalAssistant() {
  const location = useLocation();
  const { isListening, isSpeaking, transcript, startListening, speak } = useVoiceAssistant();
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>(loadConfig);
  const wsRef = useRef<WebSocket | null>(null);
  const fullTextRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (transcript && !isListening && isOpen) {
      handleQuery(transcript);
    }
  }, [transcript, isListening]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  useEffect(() => {
    return () => { wsRef.current?.close(); };
  }, []);

  function updateConfig(patch: Partial<VoiceConfig>) {
    setVoiceConfig((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem('finto_voice_config', JSON.stringify(next));
      return next;
    });
  }

  function addMessage(msg: Message) {
    setMessages((prev) => [...prev, msg]);
  }

  function doSpeak(text: string) {
    if (!voiceConfig.autoSpeak) return;
    const settings: SpeakSettings = { rate: voiceConfig.rate, pitch: voiceConfig.pitch };
    speak(text, settings);
  }

  const connectAndGreet = () => {
    wsRef.current?.close();
    const ws = new WebSocket(VOICE_WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; text?: string };
        if (msg.type === 'greeting' && msg.text) {
          addMessage({ role: 'assistant', text: msg.text });
          doSpeak(msg.text);
        }
      } catch { /* ignore */ }
    };

    ws.onerror = () => {
      addMessage({ role: 'assistant', text: 'Sesli asistan sunucusuna bağlanılamadı. Python sunucusu çalışıyor mu?' });
    };
  };

  const handleQuery = (query: string) => {
    addMessage({ role: 'user', text: query });
    setIsLoading(true);
    setStreamingText('');
    fullTextRef.current = '';

    const doSend = (socket: WebSocket) => {
      socket.send(JSON.stringify({
        query,
        path: location.pathname,
        context: extractPageContext(),
      }));

      socket.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data as string) as { type: string; text?: string; message?: string };
          if (msg.type === 'greeting') {
            // yanıt beklerken yoksay
          } else if (msg.type === 'chunk' && msg.text) {
            fullTextRef.current += msg.text;
            setStreamingText(fullTextRef.current);
            setIsLoading(false);
          } else if (msg.type === 'done') {
            const finalText = fullTextRef.current;
            addMessage({ role: 'assistant', text: finalText });
            setStreamingText('');
            fullTextRef.current = '';
            doSpeak(finalText);
            socket.onmessage = null;
          } else if (msg.type === 'error') {
            const errMsg = msg.message ?? 'Bir hata oluştu.';
            addMessage({ role: 'assistant', text: errMsg });
            setStreamingText('');
            setIsLoading(false);
            doSpeak(errMsg);
          }
        } catch { /* ignore */ }
      };

      socket.onerror = () => {
        addMessage({ role: 'assistant', text: 'Bağlantı hatası oluştu.' });
        setStreamingText('');
        setIsLoading(false);
      };
    };

    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      doSend(ws);
    } else {
      const newWs = new WebSocket(VOICE_WS_URL);
      wsRef.current = newWs;
      newWs.onopen = () => doSend(newWs);
      newWs.onerror = () => {
        addMessage({ role: 'assistant', text: 'Sunucuya bağlanılamadı.' });
        setIsLoading(false);
      };
    }
  };

  const toggleAssistant = () => {
    if (isOpen) {
      setIsOpen(false);
      setShowSettings(false);
      window.speechSynthesis.cancel();
      wsRef.current?.close();
    } else {
      setIsOpen(true);
      setMessages([]);
      setStreamingText('');
      connectAndGreet();
    }
  };

  // Ayar butonu grubu
  const rateOptions = [
    { label: 'Yavaş', value: 0.7 },
    { label: 'Normal', value: 1.0 },
    { label: 'Hızlı', value: 1.5 },
  ];
  const pitchOptions = [
    { label: 'Alçak', value: 0.7 },
    { label: 'Normal', value: 1.0 },
    { label: 'Yüksek', value: 1.3 },
  ];

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col items-end gap-3 pointer-events-none">
      {isOpen && (
        <div
          className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-80 pointer-events-auto flex flex-col overflow-hidden"
          style={{ maxHeight: '72vh' }}
          role="region"
          aria-label="Finto Sesli Asistan"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex-shrink-0">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 bg-blue-500 rounded-full animate-pulse" />
              <span className="font-black text-sm text-slate-900 dark:text-white tracking-tight">FINTO ASİSTAN</span>
            </div>
            <div className="flex items-center gap-1">
              <button
                onClick={() => setShowSettings((v) => !v)}
                className={`p-1.5 rounded-lg transition-colors ${showSettings ? 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200' : 'text-slate-400 hover:text-slate-600 dark:hover:text-slate-300'}`}
                aria-label="Ses ayarları"
              >
                <Settings size={15} />
              </button>
              <button onClick={toggleAssistant} className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors" aria-label="Kapat">
                <X size={16} />
              </button>
            </div>
          </div>

          {/* Ses Ayarları Paneli */}
          {showSettings && (
            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 flex-shrink-0 space-y-3">
              {/* Hız */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Konuşma Hızı</p>
                <div className="flex gap-1.5">
                  {rateOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateConfig({ rate: opt.value })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${voiceConfig.rate === opt.value ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Ton */}
              <div>
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1.5">Ses Tonu</p>
                <div className="flex gap-1.5">
                  {pitchOptions.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => updateConfig({ pitch: opt.value })}
                      className={`flex-1 py-1.5 rounded-lg text-xs font-black transition-colors ${voiceConfig.pitch === opt.value ? 'bg-blue-600 text-white' : 'bg-white dark:bg-slate-700 text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-600'}`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>
              {/* Otomatik seslendir */}
              <div className="flex items-center justify-between">
                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Otomatik Seslendir</p>
                <button
                  onClick={() => updateConfig({ autoSpeak: !voiceConfig.autoSpeak })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${voiceConfig.autoSpeak ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${voiceConfig.autoSpeak ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
            </div>
          )}

          {/* Mesaj geçmişi */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto px-3 py-3 space-y-2 bg-slate-50 dark:bg-slate-900/50">
            {messages.length === 0 && !isLoading && (
              <p className="text-center text-xs text-slate-400 py-4">Mikrofona tıklayıp konuşmaya başlayın.</p>
            )}
            {messages.map((m, i) => (
              <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div className={`max-w-[85%] px-3 py-2 rounded-2xl text-sm leading-relaxed ${
                  m.role === 'user'
                    ? 'bg-blue-600 text-white rounded-br-sm'
                    : 'bg-white dark:bg-slate-700 text-slate-800 dark:text-slate-100 border border-slate-100 dark:border-slate-600 rounded-bl-sm'
                }`}>
                  {m.text}
                </div>
              </div>
            ))}

            {(isLoading || streamingText) && (
              <div className="flex justify-start">
                <div className="max-w-[85%] px-3 py-2 rounded-2xl rounded-bl-sm bg-white dark:bg-slate-700 border border-slate-100 dark:border-slate-600 text-sm text-slate-800 dark:text-slate-100 leading-relaxed">
                  {isLoading && !streamingText ? (
                    <div className="flex items-center gap-1.5 py-0.5">
                      <Loader2 size={13} className="animate-spin text-blue-500" />
                      <span className="text-slate-400 text-xs">düşünüyor...</span>
                    </div>
                  ) : (
                    <>
                      {streamingText}
                      <span className="inline-block w-0.5 h-3.5 bg-blue-500 ml-0.5 animate-pulse align-middle" />
                    </>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Alt bar */}
          <div className="px-4 py-3 border-t border-slate-100 dark:border-slate-700 bg-white dark:bg-slate-800 flex items-center justify-between gap-3 flex-shrink-0">
            <div className="flex-1 min-w-0">
              {isListening ? (
                <div className="flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-xs font-bold text-red-500 uppercase tracking-widest">Dinliyor</span>
                </div>
              ) : isSpeaking ? (
                <div className="flex items-center gap-1.5">
                  <Volume2 size={13} className="text-green-500" />
                  <span className="text-xs font-bold text-green-600">Konuşuyor</span>
                </div>
              ) : transcript ? (
                <p className="text-xs text-slate-400 truncate">"{transcript}"</p>
              ) : (
                <p className="text-xs text-slate-400">Konuşmak için tıklayın</p>
              )}
            </div>
            <button
              onClick={startListening}
              disabled={isLoading || isListening}
              className={`flex-shrink-0 w-10 h-10 rounded-full flex items-center justify-center transition-all ${
                isListening
                  ? 'bg-red-500 text-white'
                  : isLoading
                  ? 'bg-slate-100 dark:bg-slate-700 text-slate-400 cursor-not-allowed'
                  : 'bg-slate-900 dark:bg-blue-600 hover:bg-slate-700 dark:hover:bg-blue-700 text-white'
              }`}
              aria-label="Mikrofon"
            >
              <Mic size={16} className={isListening ? 'animate-pulse' : ''} />
            </button>
          </div>
        </div>
      )}

      {/* Toggle butonu */}
      <button
        onClick={toggleAssistant}
        className={`w-14 h-14 flex items-center justify-center rounded-full shadow-lg transition-all duration-300 pointer-events-auto outline-none focus:ring-4 focus:ring-blue-500 ${
          isOpen
            ? 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-200'
            : isSpeaking
            ? 'bg-green-500 text-white animate-pulse'
            : 'bg-blue-600 hover:bg-blue-700 text-white'
        }`}
        aria-label="Finto Sesli Asistan"
      >
        {isSpeaking ? <Volume2 size={22} /> : isOpen ? <X size={20} /> : <Mic size={20} />}
      </button>
    </div>
  );
}
