import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';

type Politeness = 'polite' | 'assertive';

type AnnouncerApi = {
  /** Screen reader'a sesli olarak duyurur (görsel olarak gizli). */
  announce: (message: string, politeness?: Politeness) => void;
};

const AnnouncerContext = createContext<AnnouncerApi | null>(null);

/**
 * Tek bir aria-live bölgesi tüm uygulama için. Toast feedback'leri ve önemli
 * durum değişiklikleri buradan screen reader'a iletilir.
 */
export function AnnouncerProvider({ children }: { children: ReactNode }) {
  const [politeMsg, setPoliteMsg] = useState('');
  const [assertiveMsg, setAssertiveMsg] = useState('');
  const lastIdRef = useRef(0);

  const announce = useCallback((message: string, politeness: Politeness = 'polite') => {
    const text = message.trim();
    if (!text) return;
    // Aynı mesajı tekrarlarsa SR yine duyursun diye sonuna görünmez bir id ekle.
    lastIdRef.current += 1;
    const stamped = `${text} ​`.repeat(1) + (lastIdRef.current % 2 === 0 ? '' : ' ');
    if (politeness === 'assertive') {
      setAssertiveMsg('');
      // Bir tick sonra koy ki SR değişimi yakalasın
      requestAnimationFrame(() => setAssertiveMsg(stamped));
    } else {
      setPoliteMsg('');
      requestAnimationFrame(() => setPoliteMsg(stamped));
    }
  }, []);

  return (
    <AnnouncerContext.Provider value={{ announce }}>
      {children}
      <div className="sr-only" aria-live="polite" aria-atomic="true" role="status">
        {politeMsg}
      </div>
      <div className="sr-only" aria-live="assertive" aria-atomic="true" role="alert">
        {assertiveMsg}
      </div>
    </AnnouncerContext.Provider>
  );
}

export function useAnnouncer(): AnnouncerApi {
  const ctx = useContext(AnnouncerContext);
  if (!ctx) {
    // Provider yoksa no-op (test ortamı vb.).
    return { announce: () => {} };
  }
  return ctx;
}

/**
 * Route değiştiğinde sayfa başlığını otomatik duyurur ve odaklayacak ref döner.
 * Sayfa içinde <h1 ref={ref} tabIndex={-1}>...</h1> şeklinde kullanılır.
 */
export function useRouteAnnouncement(title: string) {
  const { announce } = useAnnouncer();
  useEffect(() => {
    document.title = `${title} · Finto`;
    announce(`${title} sayfası açıldı`, 'polite');
  }, [title, announce]);
}
