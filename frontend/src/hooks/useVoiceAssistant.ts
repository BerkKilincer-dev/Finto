import { useState, useRef, useEffect, useCallback } from 'react';

const SpeechRecognitionInit =
  (window as unknown as { SpeechRecognition?: unknown }).SpeechRecognition ||
  (window as unknown as { webkitSpeechRecognition?: unknown }).webkitSpeechRecognition;

export type SpeakSettings = {
  rate?: number;
  pitch?: number;
  autoSpeak?: boolean;
  /** Tam SpeechSynthesisVoice.name; yoksa otomatik seçim. */
  voiceName?: string | null;
};

/** Aynı sözcüğün tekrar söylenmesinde de tetiklenmesi için unique id ile birlikte tutuyoruz. */
export type TranscriptEvent = { id: number; text: string } | null;

export type VoiceOption = {
  name: string;
  label: string;
  /** Önerilen / doğal ses mi (Online Natural / Neural / Premium) */
  natural: boolean;
  gender?: 'male' | 'female';
};

/**
 * Tarayıcıdaki Türkçe sesleri sıralı şekilde döndürür: önce "Online (Natural)" / Neural,
 * sonra diğerleri. UI dropdown ve otomatik seçim aynı listeyi kullanır.
 */
function listTurkishVoices(): VoiceOption[] {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  const turkish = voices.filter((v) => v.lang?.toLowerCase().startsWith('tr'));

  const naturalRegex = /(online|natural|neural|premium|multilingual)/i;
  const femaleRegex = /(emel|sedef|filiz|tülay|tulay|aylin)/i;
  const maleRegex = /(tolga|ahmet|burak|mert|kaan)/i;

  const options: VoiceOption[] = turkish.map((v) => {
    const natural = naturalRegex.test(v.name);
    let gender: 'male' | 'female' | undefined;
    if (femaleRegex.test(v.name)) gender = 'female';
    else if (maleRegex.test(v.name)) gender = 'male';

    // Daha okunaklı etiket: "Microsoft Ahmet - Turkish (Turkey)" → "Microsoft Ahmet"
    const cleaned = v.name
      .replace(/\s*-\s*Turkish.*$/i, '')
      .replace(/\s*\(Turkey\)/i, '')
      .replace(/\s*\(Türkiye\)/i, '')
      .trim();
    const tags: string[] = [];
    if (natural) tags.push('doğal');
    if (gender === 'female') tags.push('kadın');
    if (gender === 'male') tags.push('erkek');
    const label = tags.length ? `${cleaned} · ${tags.join(', ')}` : cleaned;

    return { name: v.name, label, natural, gender };
  });

  // Doğal sesler en üste; aynı grupta isim alfabetik.
  options.sort((a, b) => {
    if (a.natural !== b.natural) return a.natural ? -1 : 1;
    return a.label.localeCompare(b.label, 'tr');
  });

  return options;
}

function findBestVoice(preferredName: string | null | undefined): SpeechSynthesisVoice | null {
  const voices = window.speechSynthesis?.getVoices?.() ?? [];
  if (!voices.length) return null;

  if (preferredName) {
    const exact = voices.find((v) => v.name === preferredName);
    if (exact) return exact;
  }

  const naturalRegex = /(online|natural|neural|premium|multilingual)/i;
  // 1. Türkçe + "Online (Natural)" gibi neural sesler
  const naturalTr = voices.find(
    (v) => v.lang?.toLowerCase().startsWith('tr') && naturalRegex.test(v.name),
  );
  if (naturalTr) return naturalTr;

  // 2. Diğer Türkçe sesler
  const anyTr = voices.find((v) => v.lang?.toLowerCase().startsWith('tr'));
  if (anyTr) return anyTr;

  return null;
}

export type VoiceError = {
  code:
    | 'not-supported'
    | 'not-allowed'
    | 'no-speech'
    | 'audio-capture'
    | 'network'
    | 'aborted'
    | 'service-not-allowed'
    | 'language-not-supported'
    | 'mic-failed'
    | 'unknown';
  message: string;
};

function isEdgeBrowser(): boolean {
  // Edge userAgent örneği: "... Edg/120.0.0.0"
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent : '';
  return /\bEdg\//.test(ua);
}

const ERROR_MESSAGES: Record<VoiceError['code'], string> = {
  'not-supported': 'Tarayıcı sesli komutu desteklemiyor. Chrome veya Edge kullan.',
  'not-allowed':
    'Mikrofon izni verilmemiş. Tarayıcı adres çubuğundaki kilit simgesinden mikrofona izin ver.',
  'no-speech': 'Ses algılanamadı. Mikrofonun açık olduğundan emin ol ve biraz daha yüksek sesle konuş.',
  'audio-capture':
    'Mikrofona ulaşılamadı. Başka bir uygulama mikrofonu kullanıyor olabilir veya mikrofon bağlı değil.',
  network: 'İnternet bağlantısı gerekli (Chrome ses tanımayı bulutta yapar). Bağlantını kontrol et.',
  aborted: 'Dinleme iptal edildi.',
  'service-not-allowed': 'Tarayıcı sesli komut servisini engelliyor.',
  'language-not-supported': 'Türkçe dil paketi yüklü değil.',
  'mic-failed': 'Mikrofon başlatılamadı.',
  unknown: 'Beklenmeyen bir hata oluştu.',
};

function normalizeError(raw: string | undefined): VoiceError {
  const code = (raw ?? 'unknown') as VoiceError['code'];
  let message = ERROR_MESSAGES[code] ?? ERROR_MESSAGES.unknown;
  // Edge'de network hatası genellikle Microsoft'un STT endpoint'ine ulaşamamaktan kaynaklanır;
  // Chrome'da Google STT problemsiz çalışıyor. Kullanıcıyı buna yönlendir.
  if (code === 'network' && isEdgeBrowser()) {
    message =
      'Edge ses tanımada sorun yaşıyor (bilinen bir Edge problemi). Chrome ile aç, orada problemsiz çalışır.';
  }
  return { code, message };
}

export function useVoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState<TranscriptEvent>(null);
  const [availableVoices, setAvailableVoices] = useState<VoiceOption[]>([]);
  const [error, setError] = useState<VoiceError | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const recognitionRef = useRef<any>(null);
  const transcriptIdRef = useRef(0);
  const gotResultRef = useRef(false);

  useEffect(() => {
    if (!SpeechRecognitionInit) {
      setError(normalizeError('not-supported'));
      return;
    }
    type SR = {
      lang: string;
      continuous: boolean;
      interimResults: boolean;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onresult: ((event: any) => void) | null;
      onstart: (() => void) | null;
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      onerror: ((event: any) => void) | null;
      onend: (() => void) | null;
      start: () => void;
      stop: () => void;
    };
    const Ctor = SpeechRecognitionInit as new () => SR;
    const rec = new Ctor();
    rec.lang = 'tr-TR';
    rec.continuous = false;
    rec.interimResults = false;

    rec.onstart = () => {
      gotResultRef.current = false;
      setIsListening(true);
      setError(null);
    };

    rec.onresult = (event) => {
      const text = String(event?.results?.[0]?.[0]?.transcript ?? '').trim();
      if (!text) return;
      gotResultRef.current = true;
      transcriptIdRef.current += 1;
      setTranscript({ id: transcriptIdRef.current, text });
    };

    rec.onerror = (event) => {
      const code = event?.error as string | undefined;
      // 'aborted' kullanıcı kapattığında veya yeni başlattığında doğal — kullanıcıya gösterme.
      if (code && code !== 'aborted') {
        setError(normalizeError(code));
      }
      setIsListening(false);
    };

    rec.onend = () => {
      setIsListening(false);
      // Sonuç gelmeden bitti: kullanıcıya görünür bir feedback ver.
      if (!gotResultRef.current) {
        setError((prev) => prev ?? normalizeError('no-speech'));
      }
    };

    recognitionRef.current = rec;

    const syncVoices = () => {
      setAvailableVoices(listTurkishVoices());
    };
    syncVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', syncVoices);

    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis.cancel();
      window.speechSynthesis?.removeEventListener?.('voiceschanged', syncVoices);
    };
  }, []);

  const startListening = useCallback(async () => {
    setTranscript(null);
    setError(null);
    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    const rec = recognitionRef.current;
    if (!rec) {
      setError(normalizeError('not-supported'));
      return;
    }

    // Önce mikrofon iznini proaktif iste — kullanıcı reddederse net bir hata vermek için.
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        // İzni aldık; recognition kendi stream'ini açacağı için bunu kapat.
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (err) {
      const name = (err as { name?: string })?.name;
      if (name === 'NotAllowedError' || name === 'SecurityError') {
        setError(normalizeError('not-allowed'));
        return;
      }
      if (name === 'NotFoundError' || name === 'OverconstrainedError') {
        setError(normalizeError('audio-capture'));
        return;
      }
      // Diğer durumlarda recognition yine de dene
    }

    try {
      rec.start();
    } catch (err) {
      // start() zaten çalışan bir recognition üzerine çağrılırsa "InvalidStateError" atar — bunu yoksay.
      const msg = (err as Error)?.message ?? '';
      if (!/already started/i.test(msg) && !/invalid state/i.test(msg)) {
        setError(normalizeError('mic-failed'));
      }
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const cancelSpeak = useCallback(() => {
    window.speechSynthesis?.cancel();
    setIsSpeaking(false);
  }, []);

  const speak = useCallback((text: string, settings?: SpeakSettings, onFinished?: () => void) => {
    if (!text || !window.speechSynthesis) {
      // Konuşulamadıysa bile callback çağrılsın (örn. autoSpeak=false durumunda
      // hands-free akışı yazılı modda da devam edebilsin).
      if (onFinished) setTimeout(onFinished, 0);
      return;
    }
    window.speechSynthesis.cancel();
    setIsSpeaking(false);

    const voice = findBestVoice(settings?.voiceName);
    const isNatural =
      !!voice && /(online|natural|neural|premium|multilingual)/i.test(voice.name);

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    // Natural sesler 1.0 / 1.0'da en doğal çıkar; klasik sesleri biraz yumuşatıyoruz.
    utterance.rate = settings?.rate ?? (isNatural ? 1.0 : 0.95);
    utterance.pitch = settings?.pitch ?? (isNatural ? 1.0 : 0.9);
    if (voice) utterance.voice = voice;

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      setIsSpeaking(false);
      if (onFinished) onFinished();
    };

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = finish;
    utterance.onerror = finish;
    window.speechSynthesis.speak(utterance);
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return {
    isListening,
    isSpeaking,
    transcript,
    availableVoices,
    error,
    startListening,
    stopListening,
    speak,
    cancelSpeak,
    setTranscript,
    clearError,
  };
}
