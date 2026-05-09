import { useState, useRef, useEffect, useCallback } from 'react';

// Tarayıcı uyumluluğu için prefixler
const SpeechRecognitionInit = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;

export function useVoiceAssistant() {
  const [isListening, setIsListening] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [transcript, setTranscript] = useState('');
  
  const recognitionRef = useRef<any>(null);

  useEffect(() => {
    if (SpeechRecognitionInit) {
      recognitionRef.current = new SpeechRecognitionInit();
      // Türkçe dil desteği
      recognitionRef.current.lang = 'tr-TR';
      recognitionRef.current.continuous = false;
      recognitionRef.current.interimResults = false;

      recognitionRef.current.onresult = (event: any) => {
        const currentTranscript = event.results[0][0].transcript;
        setTranscript(currentTranscript);
      };

      recognitionRef.current.onerror = (event: any) => {
        console.error('Ses tanıma hatası:', event.error);
        setIsListening(false);
      };

      recognitionRef.current.onend = () => {
        setIsListening(false);
      };
    } else {
      console.warn('Tarayıcınız Web Speech API tanıma özelliğini desteklemiyor.');
    }

    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      window.speechSynthesis.cancel();
    };
  }, []);

  const startListening = useCallback(() => {
    setTranscript(''); // Önceki metni temizle
    window.speechSynthesis.cancel(); // Eğer konuşuyorsa sus
    setIsSpeaking(false);
    try {
      recognitionRef.current?.start();
      setIsListening(true);
    } catch (e) {
      console.error('Dinleme başlatılamadı', e);
    }
  }, []);

  const stopListening = useCallback(() => {
    recognitionRef.current?.stop();
    setIsListening(false);
  }, []);

  const speak = useCallback((text: string) => {
    if (!window.speechSynthesis) {
      console.warn('Tarayıcınız Web Speech API sentezini desteklemiyor.');
      return;
    }

    // Varsa mevcut konuşmayı iptal et
    window.speechSynthesis.cancel();

    const utterance = new SpeechSynthesisUtterance(text);
    // Türkçe veya en uygun dili seçme denemesi
    utterance.lang = 'tr-TR';
    utterance.rate = 1.0; 
    utterance.pitch = 1.0;

    utterance.onstart = () => setIsSpeaking(true);
    utterance.onend = () => setIsSpeaking(false);
    utterance.onerror = (event) => {
      console.error('Konuşma sentezi hatası:', event);
      setIsSpeaking(false);
    };

    window.speechSynthesis.speak(utterance);
  }, []);

  return {
    isListening,
    isSpeaking,
    transcript,
    startListening,
    stopListening,
    speak,
    setTranscript
  };
}
