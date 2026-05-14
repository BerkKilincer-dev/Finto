import { useEffect, useRef, useState } from 'react';
import { useAccessibilitySettings } from '../hooks/useAccessibilitySettings.tsx';
import { useAnnouncer } from '../hooks/useAnnouncer.tsx';
import { useAuth } from '../contexts/AuthContext.tsx';
import { formatShortcut, getGlobalHint } from '../hooks/accessibilityConfig';
import type { PortfolioApi } from '../hooks/usePortfolio';
import type { MarketStock } from '../hooks/useStocksQuotes';
import { APP_EVENTS } from '../hooks/appEvents';

type Props = {
  portfolio: PortfolioApi;
  stocks: MarketStock[];
  marketDataWarning: string | null;
  onOpenAuth: () => void;
};

const VOICE_COMMANDS: Array<{ label: string; example: string }> = [
  { label: 'Borsayı dinle', example: '"hisseleri oku" veya "borsa"' },
  { label: 'Tahminleri dinle', example: '"tahminleri oku" veya "fırsat"' },
  { label: 'Tek hisse fiyatı', example: '"Aselsan fiyatı"' },
  { label: 'Tek hisse tahmini', example: '"Garanti tahmini"' },
  { label: 'Portföyünü dinle', example: '"portföyümü oku"' },
  { label: 'Nakit bakiye', example: '"param ne kadar"' },
  { label: 'Hisse al', example: '"Aselsan beş lot al"' },
  { label: 'Hisse sat', example: '"Garanti üç lot sat"' },
  { label: 'Yardım / kısayollar', example: '"yardım"' },
  { label: 'Normal görünüme dön', example: '"normal görünüm"' },
];

export default function AccessibleShell({ portfolio, stocks, marketDataWarning, onOpenAuth }: Props) {
  const { shortcuts, setAccessibleMode } = useAccessibilitySettings();
  const { announce } = useAnnouncer();
  const { user, signOut } = useAuth();
  const [lastAssistant, setLastAssistant] = useState<string>('');
  const [welcomedRef] = useState(() => ({ done: false }));
  const mainRef = useRef<HTMLElement>(null);

  // Asistanın söylediği son metni gör (görenler için, görmeyenler zaten duyar).
  useEffect(() => {
    function onSpeak(e: Event) {
      const detail = (e as CustomEvent<{ text: string }>).detail;
      if (detail?.text) setLastAssistant(detail.text);
    }
    window.addEventListener(APP_EVENTS.assistantResponse, onSpeak);
    return () => window.removeEventListener(APP_EVENTS.assistantResponse, onSpeak);
  }, []);

  // Mod açılır açılmaz: hoşgeldin + otomatik dinleme.
  useEffect(() => {
    if (welcomedRef.done) return;
    welcomedRef.done = true;
    const welcome =
      "Sesli moda hoş geldiniz. Konuşmak için boşluk tuşuna basın ya da sadece konuşun. " +
      `Komut örnekleri: "hisseleri oku", "tahminleri oku", "portföyümü oku", "Aselsan beş lot al". ` +
      `Normal görünüme dönmek için ${formatShortcut(shortcuts.toggleAccessibleMode)}.`;
    window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantSpeak, { detail: { text: welcome } }));
    // Paneli aç/kapat toggle yerine doğrudan dinlemeyi başlat ki yanlışlıkla kapanmasın.
    setTimeout(() => {
      window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantListen));
    }, 120);
  }, [shortcuts, welcomedRef]);

  // Boşluk tuşu: dinlemeyi başlat (form alanında değilse).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key !== ' ' && e.code !== 'Space') return;
      const target = e.target as HTMLElement | null;
      if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)) return;
      e.preventDefault();
      window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantListen));
      announce('Dinliyorum, konuşun.', 'polite');
    }
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [announce]);

  // Piyasa uyarısı geldiğinde sesli oku.
  useEffect(() => {
    if (!marketDataWarning) return;
    window.dispatchEvent(
      new CustomEvent(APP_EVENTS.assistantSpeak, { detail: { text: `Uyarı: ${marketDataWarning}` } }),
    );
  }, [marketDataWarning]);

  function exitMode() {
    setAccessibleMode(false);
    announce('Normal görünüme geçildi.', 'polite');
  }

  function startListening() {
    window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantListen));
    announce('Dinliyorum, konuşun.', 'polite');
  }

  async function handleSignOut() {
    await signOut();
    window.dispatchEvent(
      new CustomEvent(APP_EVENTS.assistantSpeak, { detail: { text: 'Çıkış yapıldı.' } }),
    );
  }

  function quickAsk(text: string) {
    window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantQuery, { detail: { text } }));
  }

  return (
    <div className="min-h-screen bg-white dark:bg-black text-slate-900 dark:text-white font-sans">
      <a href="#a11y-main" className="skip-to-content">
        Ana içeriğe atla
      </a>

      <header role="banner" className="border-b-4 border-slate-900 dark:border-white">
        <div className="max-w-3xl mx-auto px-4 py-4 flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
          <div>
            <h1 className="text-3xl font-black tracking-tight">FINTO — Sesli Mod</h1>
            <p className="text-base font-bold mt-1">
              Konuşarak alın, satın, fiyat ve tahminleri dinleyin.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            {user ? (
              <button
                onClick={handleSignOut}
                className="px-5 py-3 border-2 border-slate-900 dark:border-white font-black bg-white dark:bg-black"
              >
                Çıkış
              </button>
            ) : (
              <button
                onClick={onOpenAuth}
                className="px-5 py-3 bg-slate-900 dark:bg-white text-white dark:text-black font-black border-2 border-slate-900 dark:border-white"
              >
                Giriş yap
              </button>
            )}
            <button
              onClick={exitMode}
              aria-keyshortcuts={formatShortcut(shortcuts.toggleAccessibleMode)}
              className="px-5 py-3 bg-yellow-300 text-slate-900 font-black border-2 border-slate-900"
            >
              Normal görünüm ({formatShortcut(shortcuts.toggleAccessibleMode)})
            </button>
          </div>
        </div>
      </header>

      <main id="a11y-main" ref={mainRef} tabIndex={-1} className="max-w-3xl mx-auto px-4 py-8 space-y-8">
        <section aria-labelledby="mic-title" className="text-center space-y-4">
          <h2 id="mic-title" className="sr-only">
            Konuşma
          </h2>
          <button
            onClick={startListening}
            aria-keyshortcuts={`${formatShortcut(shortcuts.startListening)} Space`}
            className="w-full py-12 text-3xl font-black bg-blue-700 hover:bg-blue-800 focus-visible:bg-blue-800 text-white border-4 border-slate-900 dark:border-white"
          >
            🎤 KONUŞMAK İÇİN BAS
          </button>
          <p className="text-lg font-bold">
            Kısayol: <span className="underline">Boşluk</span> tuşu veya{' '}
            <span className="underline">{formatShortcut(shortcuts.startListening)}</span>
          </p>
        </section>

        <section aria-labelledby="status-title" className="space-y-3">
          <h2 id="status-title" className="text-2xl font-black">
            Durum
          </h2>
          <div className="border-2 border-slate-900 dark:border-white p-4 space-y-2">
            <p className="text-lg">
              <span className="font-black">Nakit:</span>{' '}
              {portfolio.cashBalance.toLocaleString('tr-TR', {
                style: 'currency',
                currency: 'TRY',
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-lg">
              <span className="font-black">Toplam varlık:</span>{' '}
              {portfolio.totalBalance.toLocaleString('tr-TR', {
                style: 'currency',
                currency: 'TRY',
                maximumFractionDigits: 2,
              })}
            </p>
            <p className="text-lg">
              <span className="font-black">Takip edilen hisse:</span> {stocks.length}
            </p>
            <p className="text-lg">
              <span className="font-black">Pozisyon sayısı:</span> {portfolio.holdings.length}
            </p>
          </div>
          {portfolio.holdings.length > 0 && (
            <div className="border-2 border-slate-900 dark:border-white p-4">
              <p className="text-lg font-black mb-2">Pozisyon Detayı</p>
              <ul className="space-y-1 text-base">
                {portfolio.holdings.map((h) => (
                  <li key={h.symbol}>
                    {h.symbol}: {h.quantity} lot, ortalama maliyet{' '}
                    {h.averageCost.toLocaleString('tr-TR', {
                      style: 'currency',
                      currency: 'TRY',
                      maximumFractionDigits: 2,
                    })}
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div className="grid gap-2 md:grid-cols-2">
            <button
              onClick={() => quickAsk('param ne kadar')}
              className="px-4 py-3 border-2 border-slate-900 dark:border-white bg-white dark:bg-black font-black text-left"
            >
              Nakitimi söyle
            </button>
            <button
              onClick={() => quickAsk('portföyümü oku')}
              className="px-4 py-3 border-2 border-slate-900 dark:border-white bg-white dark:bg-black font-black text-left"
            >
              Portföy özetini söyle
            </button>
            <button
              onClick={() => quickAsk('hisselerim ne')}
              className="px-4 py-3 border-2 border-slate-900 dark:border-white bg-white dark:bg-black font-black text-left"
            >
              Hisselerimi söyle
            </button>
            <button
              onClick={() => quickAsk('tahminleri oku')}
              className="px-4 py-3 border-2 border-slate-900 dark:border-white bg-white dark:bg-black font-black text-left"
            >
              Tahminleri oku
            </button>
          </div>
        </section>

        <section aria-labelledby="last-title" aria-live="polite" className="space-y-3">
          <h2 id="last-title" className="text-2xl font-black">
            Son söylenen
          </h2>
          <div className="border-2 border-slate-900 dark:border-white p-4 min-h-[5rem] text-lg">
            {lastAssistant || 'Henüz bir şey söylenmedi. Konuşmaya başlayabilirsiniz.'}
          </div>
        </section>

        <section aria-labelledby="cmd-title" className="space-y-3">
          <h2 id="cmd-title" className="text-2xl font-black">
            Sesli komutlar
          </h2>
          <ul className="space-y-2">
            {VOICE_COMMANDS.map((c) => (
              <li key={c.label} className="border-2 border-slate-900 dark:border-white p-3">
                <p className="text-lg font-black">{c.label}</p>
                <p className="text-base">Söyle: {c.example}</p>
              </li>
            ))}
          </ul>
        </section>
      </main>

      <footer role="contentinfo" className="border-t-4 border-slate-900 dark:border-white mt-8">
        <div className="max-w-3xl mx-auto px-4 py-4 text-base font-bold">
          <p>{getGlobalHint(shortcuts)}</p>
        </div>
      </footer>
    </div>
  );
}
