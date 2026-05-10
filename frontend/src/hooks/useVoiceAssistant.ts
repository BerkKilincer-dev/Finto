import { useState, useRef, useEffect, useCallback } from 'react';

const SpeechRecognitionInit = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

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

    return () => {
      recognitionRef.current?.stop();
      window.speechSynthesis.cancel();
    };
  }, []);

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
    utterance.rate = settings?.rate ?? 1.0;
    utterance.pitch = settings?.pitch ?? 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = () => setIsSpeaking(false);

    window.speechSynthesis.speak(utterance);
  }, []);

  return { isListening, isSpeaking, transcript, startListening, stopListening, speak, setTranscript };
}
