import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic, Loader2, Volume2, X, Settings } from 'lucide-react';
import { useVoiceAssistant, type SpeakSettings } from '../hooks/useVoiceAssistant';
import {
  COMMAND_ITEMS,
  formatShortcut,
  type CommandItem,
  type ShortcutMap,
} from '../hooks/accessibilityConfig';
import { APP_EVENTS } from '../hooks/appEvents';
import { useAnnouncer } from '../hooks/useAnnouncer';

const VOICE_WS_URL = 'ws://localhost:8001';

type Message = { role: 'user' | 'assistant'; text: string };

/**
 * Asistanı dış komponentlerden yönetmek için olay isimleri. Tıklamadan
 * bağımsız (klavye kısayolu, sesli komut, sayfayı oku düğmesi) çağrılabilir.
 */
export type VoiceCommandHandler = (text: string) => Promise<{ handled: boolean; reply?: string }>;

type GlobalAssistantProps = {
  /** Sesli komutu yerel olarak işleme şansı verir. handled=true ise AI'ya gönderme. */
  onVoiceCommand?: VoiceCommandHandler;
  shortcuts?: ShortcutMap;
};

type VoiceConfig = {
  rate: number;
  pitch: number;
  autoSpeak: boolean;
  voiceName: string | null;
  /** Asistanın her konuşması bitince mikrofon otomatik açılsın mı? */
  handsFree: boolean;
};

const DEFAULT_CONFIG: VoiceConfig = {
  rate: 1.0,
  pitch: 1.0,
  autoSpeak: true,
  voiceName: null,
  handsFree: true,
};

// TTS çıktısı mikrofona geri sızmasın diye küçük bir gecikme.
const HANDS_FREE_DELAY_MS = 250;

function loadConfig(): VoiceConfig {
  try {
    const saved = localStorage.getItem('finto_voice_config');
    return saved ? { ...DEFAULT_CONFIG, ...(JSON.parse(saved) as Partial<VoiceConfig>) } : DEFAULT_CONFIG;
  } catch {
    return DEFAULT_CONFIG;
  }
}

const extractPageContext = () => {
  const el = document.getElementById('page-content') ?? document.getElementById('main-content');
  return el ? el.innerText.slice(0, 2000) : null;
};

export default function GlobalAssistant({ onVoiceCommand, shortcuts }: GlobalAssistantProps = {}) {
  const location = useLocation();
  const { announce } = useAnnouncer();
  const {
    isListening,
    isSpeaking,
    transcript,
    availableVoices,
    error: voiceError,
    startListening,
    speak,
    cancelSpeak,
    setTranscript,
    clearError,
  } = useVoiceAssistant();
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [messages, setMessages] = useState<Message[]>([]);
  const [streamingText, setStreamingText] = useState('');
  const [voiceConfig, setVoiceConfig] = useState<VoiceConfig>(loadConfig);
  const wsRef = useRef<WebSocket | null>(null);
  const fullTextRef = useRef('');
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const focusBeforeOpenRef = useRef<HTMLElement | null>(null);
  // Closure'lardan stale yakalanmasın diye taze referans:
  const voiceConfigRef = useRef(voiceConfig);
  const isOpenRef = useRef(isOpen);
  const locationPathRef = useRef(location.pathname);

  useEffect(() => {
    voiceConfigRef.current = voiceConfig;
  }, [voiceConfig]);
  useEffect(() => {
    isOpenRef.current = isOpen;
  }, [isOpen]);
  useEffect(() => {
    locationPathRef.current = location.pathname;
  }, [location.pathname]);

  const addMessage = useCallback((msg: Message) => {
    setMessages((prev) => [...prev, msg]);
    if (msg.role === 'assistant') {
      window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantResponse, { detail: { text: msg.text } }));
    }
  }, []);

  const doSpeak = useCallback(
    (text: string, options?: { thenListen?: boolean }) => {
      if (!text) return;
      const cfg = voiceConfigRef.current;
      const shouldListen = options?.thenListen === true && cfg.handsFree && isOpenRef.current;
      const afterSpeak = shouldListen
        ? () => {
            // Yanıt bittiğinde otomatik dinlemeye başla — kullanıcı tıklamak zorunda kalmasın.
            // 'aborted' hatasını önlemek için bir tık geciktiriyoruz.
            setTimeout(() => {
              if (isOpenRef.current) startListening();
            }, HANDS_FREE_DELAY_MS);
          }
        : undefined;

      if (!cfg.autoSpeak) {
        // Sesli okuma kapalıysa konuşma yok; yine de hands-free akışı sürsün diye callback'i çağır.
        if (afterSpeak) afterSpeak();
        return;
      }
      const settings: SpeakSettings = {
        rate: cfg.rate,
        pitch: cfg.pitch,
        voiceName: cfg.voiceName,
      };
      speak(text, settings, afterSpeak);
    },
    [speak, startListening],
  );

  const handleQuery = useCallback(
    async (query: string) => {
      const trimmed = query.trim();
      if (!trimmed) return;
      addMessage({ role: 'user', text: trimmed });

      // Önce yerel intent parse — alım/satım/oku/git gibi komutları AI'a gitmeden işle.
      if (onVoiceCommand) {
        try {
          const result = await onVoiceCommand(trimmed);
          if (result.handled) {
            const reply = result.reply ?? 'Tamamlandı.';
            addMessage({ role: 'assistant', text: reply });
            doSpeak(reply, { thenListen: true });
            return;
          }
        } catch {
          // local handler patlarsa AI'a düş
        }
      }

      setIsLoading(true);
      setStreamingText('');
      fullTextRef.current = '';

      const doSend = (socket: WebSocket) => {
        socket.send(
          JSON.stringify({
            query: trimmed,
            path: locationPathRef.current,
            context: extractPageContext(),
          }),
        );

        socket.onmessage = (event) => {
          try {
            const msg = JSON.parse(event.data as string) as {
              type: string;
              text?: string;
              message?: string;
            };
            if (msg.type === 'greeting') {
              // yanıt beklerken yoksay
              return;
            }
            if (msg.type === 'chunk' && msg.text) {
              fullTextRef.current += msg.text;
              setStreamingText(fullTextRef.current);
              setIsLoading(false);
            } else if (msg.type === 'done') {
              const finalText = fullTextRef.current.trim();
              if (finalText) {
                addMessage({ role: 'assistant', text: finalText });
                doSpeak(finalText, { thenListen: true });
              }
              setStreamingText('');
              fullTextRef.current = '';
              setIsLoading(false);
              socket.onmessage = null;
              announce('Asistan yanıtı tamamlandı.', 'polite');
            } else if (msg.type === 'error') {
              const errMsg = msg.message ?? 'Bir hata oluştu.';
              addMessage({ role: 'assistant', text: errMsg });
              setStreamingText('');
              fullTextRef.current = '';
              setIsLoading(false);
              // Hata sonrası dinlemeye dönmek genelde iyi; kullanıcı yeniden dener.
              doSpeak(errMsg, { thenListen: true });
              socket.onmessage = null;
              announce(errMsg, 'assertive');
            }
          } catch {
            /* ignore */
          }
        };

        socket.onerror = () => {
          addMessage({ role: 'assistant', text: 'Bağlantı hatası oluştu.' });
          setStreamingText('');
          setIsLoading(false);
          announce('Asistan bağlantı hatası oluştu.', 'assertive');
        };
      };

      const existing = wsRef.current;
      if (existing && existing.readyState === WebSocket.OPEN) {
        doSend(existing);
      } else {
        const newWs = new WebSocket(VOICE_WS_URL);
        wsRef.current = newWs;
        newWs.onopen = () => doSend(newWs);
        newWs.onerror = () => {
          addMessage({ role: 'assistant', text: 'Sunucuya bağlanılamadı.' });
          setIsLoading(false);
          announce('Asistan sunucusuna bağlanılamadı.', 'assertive');
        };
      }
    },
    [addMessage, doSpeak, announce],
  );

  // Mikrofon sonucu geldiğinde sorguya çevir.
  useEffect(() => {
    if (!transcript || isListening || !isOpenRef.current) return;
    handleQuery(transcript.text);
    // Aynı transcript'in yeniden tetiklenmemesi için tüketildikten sonra temizle.
    setTranscript(null);
  }, [transcript, isListening, handleQuery, setTranscript]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streamingText]);

  useEffect(() => {
    return () => {
      wsRef.current?.close();
    };
  }, []);

  function updateConfig(patch: Partial<VoiceConfig>) {
    setVoiceConfig((prev) => {
      const next = { ...prev, ...patch };
      localStorage.setItem('finto_voice_config', JSON.stringify(next));
      return next;
    });
  }

  const connectAndGreet = useCallback(() => {
    wsRef.current?.close();
    const ws = new WebSocket(VOICE_WS_URL);
    wsRef.current = ws;

    ws.onmessage = (event) => {
      try {
        const msg = JSON.parse(event.data as string) as { type: string; text?: string };
        if (msg.type === 'greeting') {
          // Açılışta otomatik "Merhaba" mesajını göstermiyoruz/okutmuyoruz.
          // Kullanıcı etkileşimi sonrası konuşma akışı başlayacak.
          return;
        }
      } catch {
        /* ignore */
      }
    };

    ws.onerror = () => {
      addMessage({
        role: 'assistant',
        text: 'Sesli asistan sunucusuna bağlanılamadı. Python sunucusu çalışıyor mu?',
      });
      announce('Sesli asistan sunucusuna bağlanılamadı.', 'assertive');
    };
  }, [announce]);

  const openAssistant = useCallback(() => {
    focusBeforeOpenRef.current = document.activeElement as HTMLElement | null;
    setIsOpen(true);
    setMessages([]);
    setStreamingText('');
    fullTextRef.current = '';
    connectAndGreet();
    announce('Asistan paneli açıldı', 'polite');
  }, [connectAndGreet]);

  const closeAssistant = useCallback(() => {
    setIsOpen(false);
    setShowSettings(false);
    cancelSpeak();
    wsRef.current?.close();
    wsRef.current = null;
    setIsLoading(false);
    setStreamingText('');
    fullTextRef.current = '';
    focusBeforeOpenRef.current?.focus?.();
    announce('Asistan paneli kapatıldı', 'polite');
  }, [cancelSpeak, announce]);

  const toggleAssistant = useCallback(() => {
    if (isOpenRef.current) closeAssistant();
    else openAssistant();
  }, [openAssistant, closeAssistant]);

  // Dış olay dinleyicileri (klavye kısayolları + sesli komut "oku" hedefi)
  useEffect(() => {
    function onToggle() {
      toggleAssistant();
    }
    function onListen() {
      if (!isOpenRef.current) openAssistant();
      // Asistan açılma anında WS kuruluyor; biraz gecikme ile dinlemeye başla.
      setTimeout(() => startListening(), 150);
    }
    function onSpeak(e: Event) {
      const detail = (e as CustomEvent<{ text?: string }>).detail;
      if (detail?.text) {
        doSpeak(detail.text);
        // Yazılı geri bildirim için panele ekle (açıksa)
        if (isOpenRef.current) addMessage({ role: 'assistant', text: detail.text });
      }
    }
    function onQuery(e: Event) {
      const detail = (e as CustomEvent<{ text?: string }>).detail;
      const text = detail?.text?.trim();
      if (!text) return;
      if (!isOpenRef.current) openAssistant();
      setTimeout(() => {
        void handleQuery(text);
      }, 180);
    }
    function onClose() {
      if (isOpenRef.current) closeAssistant();
    }
    function onLayerCloseTop() {
      if (isOpenRef.current) closeAssistant();
    }
    window.addEventListener(APP_EVENTS.assistantToggle, onToggle);
    window.addEventListener(APP_EVENTS.assistantListen, onListen);
    window.addEventListener(APP_EVENTS.assistantSpeak, onSpeak as EventListener);
    window.addEventListener(APP_EVENTS.assistantQuery, onQuery as EventListener);
    window.addEventListener(APP_EVENTS.assistantClose, onClose);
    window.addEventListener(APP_EVENTS.layerCloseTop, onLayerCloseTop);
    return () => {
      window.removeEventListener(APP_EVENTS.assistantToggle, onToggle);
      window.removeEventListener(APP_EVENTS.assistantListen, onListen);
      window.removeEventListener(APP_EVENTS.assistantSpeak, onSpeak as EventListener);
      window.removeEventListener(APP_EVENTS.assistantQuery, onQuery as EventListener);
      window.removeEventListener(APP_EVENTS.assistantClose, onClose);
      window.removeEventListener(APP_EVENTS.layerCloseTop, onLayerCloseTop);
    };
  }, [toggleAssistant, openAssistant, closeAssistant, startListening, doSpeak, addMessage, handleQuery]);

  useEffect(() => {
    if (!isOpen) return;
    const panel = panelRef.current;
    if (!panel) return;
    const focusables = panel.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Tab' || focusables.length === 0) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    panel.addEventListener('keydown', onKeyDown);
    return () => panel.removeEventListener('keydown', onKeyDown);
  }, [isOpen]);

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
          ref={panelRef}
          id="finto-assistant-panel"
          className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl shadow-2xl w-80 pointer-events-auto flex flex-col overflow-hidden"
          style={{ maxHeight: '72vh' }}
          role="dialog"
          aria-modal="true"
          aria-label="Finto Sesli Asistan paneli"
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
              {/* Ses seçici */}
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Asistan Sesi</p>
                  <button
                    type="button"
                    onClick={() =>
                      speak('Merhaba, ben Finto. Bu seçtiğiniz ses ile konuşacağım.', {
                        rate: voiceConfig.rate,
                        pitch: voiceConfig.pitch,
                        voiceName: voiceConfig.voiceName,
                      })
                    }
                    className="text-[10px] font-black uppercase tracking-wider text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Dinle
                  </button>
                </div>
                {availableVoices.length === 0 ? (
                  <p className="text-[11px] text-slate-400">Tarayıcıda Türkçe ses bulunamadı.</p>
                ) : (
                  <select
                    value={voiceConfig.voiceName ?? ''}
                    onChange={(e) => updateConfig({ voiceName: e.target.value || null })}
                    className="w-full text-xs font-bold rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-700 dark:text-slate-200 px-2 py-1.5"
                  >
                    <option value="">Otomatik (en kaliteli ses)</option>
                    {availableVoices.map((v) => (
                      <option key={v.name} value={v.name}>
                        {v.label}
                      </option>
                    ))}
                  </select>
                )}
                {availableVoices.length > 0 && !availableVoices.some((v) => v.natural) && (
                  <p className="text-[10px] text-slate-400 mt-1 leading-tight">
                    İpucu: Microsoft Edge'de "Online (Natural)" Türkçe sesler çok daha doğaldır. Edge ile açmayı dene.
                  </p>
                )}
              </div>

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
                <label htmlFor="auto-speak-toggle" className="text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer">
                  Otomatik Seslendir
                </label>
                <button
                  id="auto-speak-toggle"
                  type="button"
                  role="switch"
                  aria-checked={voiceConfig.autoSpeak}
                  onClick={() => updateConfig({ autoSpeak: !voiceConfig.autoSpeak })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${voiceConfig.autoSpeak ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${voiceConfig.autoSpeak ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>

              {/* Eller serbest mod */}
              <div className="flex items-center justify-between">
                <label htmlFor="hands-free-toggle" className="text-[10px] font-black uppercase tracking-widest text-slate-400 cursor-pointer">
                  Eller Serbest Mod
                </label>
                <button
                  id="hands-free-toggle"
                  type="button"
                  role="switch"
                  aria-checked={voiceConfig.handsFree}
                  aria-describedby="hands-free-hint"
                  onClick={() => updateConfig({ handsFree: !voiceConfig.handsFree })}
                  className={`w-10 h-5 rounded-full transition-colors relative ${voiceConfig.handsFree ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
                >
                  <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${voiceConfig.handsFree ? 'translate-x-5' : 'translate-x-0.5'}`} />
                </button>
              </div>
              <p id="hands-free-hint" className="text-[10px] text-slate-400 leading-tight -mt-1">
                Açıkken her yanıt biter bitmez mikrofon kendiliğinden açılır — konuşmayı sürdürebilirsin.
              </p>
            </div>
          )}

          <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40">
            <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1">
              Komutlar ve Kısayollar
            </p>
            <div className="space-y-1 max-h-24 overflow-y-auto">
              {COMMAND_ITEMS.slice(0, 6).map((cmd: CommandItem) => (
                <p key={cmd.id} className="text-[11px] text-slate-600 dark:text-slate-300 leading-tight">
                  <span className="font-black">{cmd.title}</span>
                  {cmd.shortcutActionId && shortcuts ? ` · ${formatShortcut(shortcuts[cmd.shortcutActionId])}` : ''}
                </p>
              ))}
            </div>
          </div>

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

          {/* Hata banner */}
          {voiceError && (
            <div className="px-4 py-2 bg-amber-50 dark:bg-amber-900/30 border-y border-amber-200 dark:border-amber-800 flex items-start gap-2">
              <p className="text-[11px] font-bold text-amber-800 dark:text-amber-200 leading-snug flex-1">
                {voiceError.message}
              </p>
              <button
                onClick={clearError}
                className="text-amber-700 dark:text-amber-300 hover:text-amber-900 dark:hover:text-amber-100 flex-shrink-0"
                aria-label="Hatayı kapat"
              >
                <X size={12} />
              </button>
            </div>
          )}

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
                <p className="text-xs text-slate-400 truncate">"{transcript.text}"</p>
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
              aria-label={isListening ? 'Dinleniyor, sesi duruyorum' : 'Mikrofonla konuş (Alt+M kısayolu)'}
              aria-pressed={isListening}
              aria-keyshortcuts={shortcuts ? formatShortcut(shortcuts.startListening) : 'Alt+M'}
            >
              <Mic size={16} aria-hidden="true" className={isListening ? 'animate-pulse' : ''} />
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
        aria-label={isOpen ? 'Asistan panelini kapat' : 'Asistan panelini aç (Alt+A kısayolu)'}
        aria-expanded={isOpen}
        aria-controls="finto-assistant-panel"
        aria-keyshortcuts={shortcuts ? formatShortcut(shortcuts.toggleAssistant) : 'Alt+A'}
      >
        {isSpeaking ? <Volume2 size={22} aria-hidden="true" /> : isOpen ? <X size={20} aria-hidden="true" /> : <Mic size={20} aria-hidden="true" />}
      </button>
    </div>
  );
}
