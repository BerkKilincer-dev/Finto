import { useState, useRef, useEffect, useCallback } from 'react';

const SpeechRecognitionInit = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
const FIXED_VOICE_NAME = 'Microsoft Ahmet - Turkish (Turkey)';

export type SpeakSettings = {
  rate?: number;
  pitch?: number;
  autoSpeak?: boolean;
};

export function useVoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  const recognitionRef = useRef<any>(null);
  const fixedVoiceRef = useRef<SpeechSynthesisVoice | null>(null);

  const pickFixedVoice = useCallback(() => {
    const voices = window.speechSynthesis?.getVoices?.() ?? [];
    if (!voices.length) return null;

    const exact = voices.find((v) => v.name === FIXED_VOICE_NAME);
    if (exact) return exact;

    // Tek sese sabit istendi; cihazda bu ses yoksa Türkçe ilk sese düş.
    return voices.find((v) => v.lang?.toLowerCase().startsWith('tr')) ?? null;
  }, []);

  useEffect(() => {
    if (SpeechRecognitionInit) {
      recognitionRef.current = new SpeechRecognitionInit();
      recognitionRef.current.lang = 'tr-TR';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        setTranscript(event.results[0][0].transcript);
      };

      recognitionRef.current.onerror = () => {
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    }

    const syncVoices = () => {
      fixedVoiceRef.current = pickFixedVoice();
    };
    syncVoices();
    window.speechSynthesis?.addEventListener?.('voiceschanged', syncVoices);

    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis.cancel();
      window.speechSynthesis?.removeEventListener?.('voiceschanged', syncVoices);
    };
  }, [pickFixedVoice]);

  const startListening = useCallback(() => {
    setTranscript('');
    window.speechSynthesis.cancel();
    setIsSpeaking(false);
    try {
      recognitionRef.current?.start();
      setIsListening(true);
    } catch {
      // zaten dinliyorsa sessizce geç
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speak = useCallback((text: string, settings?: SpeakSettings) => {
    if (!window.speechSynthesis) return;
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'tr-TR';
    utterance.rate = settings?.rate ?? 0.95;
    utterance.pitch = settings?.pitch ?? 0.85;
    if (fixedVoiceRef.current) {
      utterance.voice = fixedVoiceRef.current;
    }
    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);
    window.speechSynthesis.speak(utterance);
  }, []);

  return { isListening, isSpeaking, transcript, startListening, stopListening, speak, setTranscript };
}
