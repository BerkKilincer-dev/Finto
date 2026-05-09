import { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { Mic, Loader2, Volume2, X } from 'lucide-react';
import { useVoiceAssistant } from '../hooks/useVoiceAssistant';

// Sayfalar geliştikçe özel veri (context) toplamak için global state veya DOM scraping kullanılabilir.
// Bu prototipte basit bir selector ile ana içerik yakalanıyor.
const extractPageContext = () => {
  const mainContent = document.getElementById('main-content');
  return mainContent ? mainContent.innerText : null;
};

export default function GlobalAssistant() {
  const location = useLocation();
  const { isListening, isSpeaking, transcript, startListening, speak } = useVoiceAssistant();
  const [isLoading, setIsLoading] = useState(false);
  const [isOpen, setIsOpen] = useState(false);
  const [backendResponse, setBackendResponse] = useState('');

  // Sesi dinlemeyi bitirdiğinde backend'e istek at (transcript değiştiğinde)
  useEffect(() => {
    if (transcript && !isListening && isOpen) {
      handleQuery(transcript);
    }
  }, [transcript, isListening]);

  const handleQuery = async (query: string) => {
    setIsLoading(true);
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_query: query,
          current_path: location.pathname,
          page_context: extractPageContext(),
        }),
      });

      const data = await response.json();
      
      if (response.ok && data.response) {
        setBackendResponse(data.response);
        speak(data.response); // Sesli asistanın yanıtını okumasını sağla
      } else if (data.error) {
        setBackendResponse(data.error);
        speak(data.error);
      } else {
         throw new Error('Geçersiz yanıt.');
      }
    } catch (error) {
      console.error('Asistan yanıt veremedi:', error);
      const errorMessage = 'Üzgünüm, şu an bağlantı kuramıyorum.';
      setBackendResponse(errorMessage);
      speak(errorMessage);
    } finally {
      setIsLoading(false);
    }
  };

  const toggleAssistant = () => {
    if (isOpen) {
      setIsOpen(false);
      window.speechSynthesis.cancel(); // Kapatıldığında sesi kes
    } else {
      setIsOpen(true);
      startListening(); // Açıldığında otomatik dinlemeye başla
    }
  };

  return (
    <div className="fixed bottom-8 right-8 z-50 flex flex-col items-end gap-4 pointer-events-none">
      {isOpen && (
        <div 
          className="bg-white border-4 border-slate-900 p-6 rounded-[24px] rounded-br-none shadow-2xl w-80 pointer-events-auto transform transition-all duration-300 ease-out flex flex-col gap-4"
          role="region"
          aria-label="Finto Sesli Asistan Diyalog Ekranı"
        >
          <div className="flex justify-between items-center mb-1">
            <h2 className="text-lg font-black text-slate-900 tracking-tight flex items-center gap-2">
               <span className="bg-blue-600 w-3 h-3 border-2 border-slate-900 rounded-full animate-pulse"></span>
               FINTO ASİSTAN
            </h2>
            <button 
              onClick={toggleAssistant}
              className="text-slate-500 hover:text-slate-900 p-1 font-black"
              aria-label="Asistanı kapat"
            >
              <X size={24} strokeWidth={3} />
            </button>
          </div>

          {/* Transcript state */}
          <div className="bg-slate-50 p-4 rounded-xl border-2 border-slate-200 text-sm font-bold text-slate-700 min-h-[60px] flex items-center">
            {isListening ? (
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse"></div>
                <span className="uppercase tracking-widest text-[10px] text-slate-400">Dinliyor...</span>
              </div>
            ) : transcript ? (
              <p className="text-slate-800 leading-snug">"{transcript}"</p>
            ) : (
              <span className="text-slate-400">Sesli soru sormak için tıklayın.</span>
            )}
          </div>

          {/* Yanıt/Yüklenme State */}
          <div className="min-h-[80px]">
            {isLoading ? (
              <div className="flex items-center gap-2 text-blue-600 py-2">
                <Loader2 size={20} className="animate-spin" strokeWidth={3} />
                <span className="font-bold text-sm tracking-widest uppercase text-blue-600">Analiz...</span>
              </div>
            ) : backendResponse ? (
              <p 
                className="text-sm font-bold text-slate-800 leading-relaxed"
                aria-live="polite"
              >
                {backendResponse}
              </p>
            ) : null}
          </div>

          <div className="mt-2 flex justify-end">
            <button
              onClick={startListening}
              className={`py-3 px-5 rounded-2xl flex items-center gap-2 font-black tracking-tighter transition-colors border-4 ${
                isListening 
                  ? 'bg-red-500 text-white border-slate-900 block' 
                  : isLoading
                  ? 'bg-slate-100 text-slate-400 border-slate-200 cursor-not-allowed'
                  : 'bg-slate-900 hover:bg-slate-800 text-white border-slate-900 block'
              }`}
              disabled={isLoading || isListening}
              aria-label="Mikrofonu aç ve konuş"
            >
              {isListening ? <Mic size={20} className="animate-pulse" strokeWidth={3} /> : <Mic size={20} strokeWidth={3} />}
              <span>{isListening ? 'DİNLENİYOR' : 'TEKRAR KONUŞ'}</span>
            </button>
          </div>
        </div>
      )}

      {/* Daima Ekranda Duran Toggle Butonu */}
      <button
        onClick={toggleAssistant}
        className={`w-24 h-24 flex justify-center items-center rounded-full shadow-[8px_8px_0px_rgba(15,23,42,1)] transition-all duration-300 pointer-events-auto outline-none focus:ring-4 focus:ring-blue-500 flex-shrink-0 group ${
          isOpen 
            ? 'bg-slate-100 border-[6px] border-slate-900 text-slate-700 hover:bg-slate-200' 
            : isSpeaking
            ? 'bg-green-500 border-[6px] border-slate-900 text-white animate-bounce'
            : 'bg-blue-600 border-[6px] border-slate-900 text-white shadow-2xl group-hover:scale-105 active:scale-95'
        }`}
        aria-label="Finto Sesli Asistan. Aramak veya bilgi almak için tıklayın."
      >
        <div className="relative flex items-center justify-center">
           {isSpeaking ? (
             <>
                <div className="absolute w-16 h-16 bg-white/40 rounded-full animate-ping"></div>
                <Volume2 size={40} strokeWidth={2.5} className="relative z-10" />
             </>
           ) : (
                <>
                   <div className="absolute w-16 h-16 bg-blue-400 rounded-full opacity-40 group-hover:animate-ping"></div>
                   <div className="absolute w-12 h-12 bg-blue-300 rounded-full opacity-60"></div>
                   <svg className="w-10 h-10 text-white relative z-10" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" d="M19 11a7 7 0 01-7 7m0 0a7 7 0 01-7-7m7 7v4m0 0H8m4 0h4m-4-8a3 3 0 01-3-3V5a3 3 0 116 0v6a3 3 0 01-3 3z" />
                   </svg>
                </>
           )}
        </div>
      </button>
    </div>
  );
}
