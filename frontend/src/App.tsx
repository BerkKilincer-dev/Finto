import { BrowserRouter as Router, Routes, Route, Link, useLocation, useNavigate } from 'react-router-dom';
import GlobalAssistant, { type VoiceCommandHandler } from './components/GlobalAssistant';
import CommandPalette from './components/CommandPalette';
import AccessibilityTour from './components/AccessibilityTour';
import AccessibleShell from './components/AccessibleShell';
import SymbolSearch from './components/SymbolSearch';
import Home from './pages/Home';
import Dashboard from './pages/Dashboard';
import StockDetail from './pages/StockDetail';
import Profile from './pages/Profile';
import Compare from './pages/Compare';
import Shortcuts from './pages/Shortcuts';
import AuthModal from './components/AuthModal';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Moon, Sun, User, LogIn } from 'lucide-react';
import { useAuth } from './contexts/AuthContext.tsx';
import { useStocksQuotes } from './hooks/useStocksQuotes';
import { usePredictions } from './hooks/usePredictions';
import { usePortfolio, type PortfolioApi } from './hooks/usePortfolio';
import { useAnnouncer } from './hooks/useAnnouncer.tsx';
import { useKeyboardShortcuts } from './hooks/useKeyboardShortcuts';
import { parseVoiceCommand } from './hooks/voiceCommands';
import { BIST_SYMBOLS } from './data/bistWatchlist';
import type { MarketStock } from './hooks/useStocksQuotes';
import type { TechnicalPrediction } from '../../backend/predictionEngine.ts';
import {
  COMMAND_ITEMS,
  formatShortcut,
  getGlobalHint,
  type CommandItem,
} from './hooks/accessibilityConfig';
import { useAccessibilitySettings } from './hooks/useAccessibilitySettings.tsx';
import { useI18n } from './hooks/useI18n.tsx';
import { APP_EVENTS } from './hooks/appEvents';

const ROUTE_TITLES: Record<string, string> = {
  '/': 'Ana sayfa',
  '/portfolio': 'Portföyüm',
  '/profile': 'Profilim',
};

/**
 * TTS için sayı: "₺1.234,56" yerine "1234 lira 56 kuruş" — ekran okuyucular
 * binlik ayraç ve "₺" sembolünü doğru telaffuz edemiyor. Bu dosyadaki tüm
 * çağrılar sesli okutma içindir; görsel UI başka yerde format alıyor.
 */
function fmtTry(n: number): string {
  if (!Number.isFinite(n)) return '0 lira';
  const sign = n < 0 ? 'eksi ' : '';
  const abs = Math.abs(n);
  const lira = Math.floor(abs);
  const kurus = Math.round((abs - lira) * 100);
  if (kurus === 0) return `${sign}${lira} lira`;
  if (kurus === 100) return `${sign}${lira + 1} lira`;
  return `${sign}${lira} lira ${kurus} kuruş`;
}

/**
 * Asistana sayfa içeriğini sesli okutmak için detaylı metin üretir.
 * Portföy sayfasında özetler, ana sayfada öneri verir vs.
 */
function buildPageSpeech(
  pathname: string,
  portfolio: PortfolioApi,
  stocks: MarketStock[],
  conciseMode: boolean,
): string {
  if (pathname === '/portfolio' || pathname === '/profile') {
    const lines = [
      `Toplam varlığınız ${fmtTry(portfolio.totalBalance)}.`,
      `Nakit bakiyeniz ${fmtTry(portfolio.cashBalance)}.`,
    ];
    if (portfolio.holdings.length === 0) {
      lines.push('Henüz hisse pozisyonunuz yok.');
    } else {
      const top = [...portfolio.holdings]
        .map((h) => {
          const stock = stocks.find((s) => s.symbol === h.symbol);
          const value = stock ? stock.price * h.quantity : 0;
          return { ...h, value, name: stock?.name ?? h.symbol };
        })
        .sort((a, b) => b.value - a.value)
        .slice(0, 3);
      const topText =
        `Toplam ${portfolio.holdings.length} hissede pozisyon var. En büyükleri: ` +
        top
          .map((h) =>
            conciseMode
              ? `${h.name} ${h.quantity} lot, ${fmtTry(h.value)}`
              : `${h.name} ${h.quantity} lot, değeri ${fmtTry(h.value)}, ortalama maliyet ${fmtTry(h.averageCost)}`,
          )
          .join('; ') +
        '.';
      lines.push(topText);
    }
    return lines.join(' ');
  }
  if (pathname.startsWith('/stock/')) {
    const sym = pathname.split('/')[2]?.toUpperCase();
    const stock = stocks.find((s) => s.symbol === sym);
    if (stock) {
      const dir = stock.dailyChangePercent >= 0 ? 'yükselişte' : 'düşüşte';
      if (conciseMode) {
        return `${stock.symbol}, ${fmtTry(stock.price)}, günlük yüzde ${stock.dailyChangePercent.toFixed(2)}.`;
      }
      return `${stock.name}, sembol ${stock.symbol}, fiyat ${fmtTry(stock.price)}, gün içi yüzde ${Math.abs(stock.dailyChangePercent).toFixed(2)} ${dir}.`;
    }
  }
  // Ana sayfa / fallback: id="page-content" altındaki metni oku
  const el = document.getElementById('page-content');
  return el ? el.innerText.slice(0, conciseMode ? 320 : 600) : 'Bu sayfada sesli olarak okunacak ek bilgi yok.';
}

function trendToTr(t: TechnicalPrediction['trend']): string {
  if (t === 'Yukselis') return 'yükseliş';
  if (t === 'Dusuk seyir') return 'düşüş';
  return 'yatay';
}

function buildStocksSpeech(stocks: MarketStock[], count: number): string {
  const top = stocks.slice(0, count);
  if (top.length === 0) return 'Şu anda gösterilebilecek hisse yok.';
  const lines = top.map((s) => {
    const dir = s.dailyChangePercent >= 0 ? 'yükselişte' : 'düşüşte';
    return `${s.name}, ${fmtTry(s.price)}, yüzde ${Math.abs(s.dailyChangePercent).toFixed(2)} ${dir}`;
  });
  return `İlk ${top.length} hisse: ` + lines.join('. ') + '.';
}

function buildPredictionsSpeech(
  predictions: Record<string, TechnicalPrediction>,
  stocks: MarketStock[],
  count: number,
): string {
  const entries = Object.values(predictions).sort((a, b) => Math.abs(b.score) - Math.abs(a.score));
  const top = entries.slice(0, count);
  if (top.length === 0) return 'Henüz hazır tahmin yok, lütfen biraz sonra tekrar deneyin.';
  const parts = top.map((p) => {
    const stock = stocks.find((s) => s.symbol === p.symbol);
    const name = stock?.name ?? p.symbol;
    return `${name}: ${trendToTr(p.trend)}, hedef ${fmtTry(p.targetPrice)}, güven yüzde ${p.signalConsistencyPercent}`;
  });
  return `En güçlü ${top.length} tahmin. ` + parts.join('. ') + '.';
}

function buildSinglePredictionSpeech(
  symbol: string,
  predictions: Record<string, TechnicalPrediction>,
  stocks: MarketStock[],
): string {
  const p = predictions[symbol];
  const stock = stocks.find((s) => s.symbol === symbol);
  const name = stock?.name ?? symbol;
  if (!p) return `${name} için henüz hazır tahmin yok.`;
  const driverText = p.drivers && p.drivers.length > 0 ? ` Etkenler: ${p.drivers.slice(0, 3).join(', ')}.` : '';
  return (
    `${name} için ${p.horizon} tahmini: ${trendToTr(p.trend)}. ` +
    `Hedef fiyat ${fmtTry(p.targetPrice)}, alt sınır ${fmtTry(p.targetPriceLow)}, üst sınır ${fmtTry(p.targetPriceHigh)}. ` +
    `Sinyal tutarlılığı yüzde ${p.signalConsistencyPercent}. ${p.summary}.${driverText}`
  );
}

function holdingsDetailLine(
  portfolio: PortfolioApi,
  stocks: MarketStock[],
  conciseMode: boolean,
): string {
  return portfolio.holdings
    .map((h) => {
      const stock = stocks.find((s) => s.symbol === h.symbol);
      const value = stock ? stock.price * h.quantity : h.quantity * h.averageCost;
      if (conciseMode) {
        return `${stock?.name ?? h.symbol} ${h.quantity} lot, ${fmtTry(value)}`;
      }
      const pnl = stock ? (stock.price - h.averageCost) * h.quantity : 0;
      const pnlTxt = pnl >= 0 ? `${fmtTry(pnl)} karda` : `${fmtTry(Math.abs(pnl))} zararda`;
      return `${stock?.name ?? h.symbol} ${h.quantity} lot, değer ${fmtTry(value)}, ${pnlTxt}`;
    })
    .join('. ');
}

function buildPortfolioSpeech(portfolio: PortfolioApi, stocks: MarketStock[], conciseMode: boolean): string {
  const lines = [
    `Toplam varlığınız ${fmtTry(portfolio.totalBalance)}. Nakit ${fmtTry(portfolio.cashBalance)}. Hisselerinizin toplam değeri ${fmtTry(
      portfolio.holdingsValue,
    )}.`,
  ];
  if (portfolio.holdings.length === 0) {
    lines.push('Hiç hisse pozisyonunuz yok.');
  } else {
    lines.push(`${portfolio.holdings.length} farklı hissede pozisyonunuz var.`);
    lines.push(holdingsDetailLine(portfolio, stocks, conciseMode) + '.');
  }
  return lines.join(' ');
}

function buildHoldingsSpeech(portfolio: PortfolioApi, stocks: MarketStock[], conciseMode: boolean): string {
  if (portfolio.holdings.length === 0) {
    return 'Şu anda hiç hisseniz yok. Hisse almak için örneğin "Aselsan beş lot al" diyebilirsiniz.';
  }
  return (
    `${portfolio.holdings.length} farklı hissede pozisyonunuz var. ` +
    holdingsDetailLine(portfolio, stocks, conciseMode) +
    '.'
  );
}

function buildFeatureGuideSpeech(shortcutsText: {
  assistant: string;
  mic: string;
  read: string;
  mode: string;
  explain: string;
  close: string;
}): string {
  return (
    'Finto özellik turu başladı. ' +
    `Asistanı ${shortcutsText.assistant} ile açabilirsiniz. ` +
    `Mikrofonu ${shortcutsText.mic} ile başlatıp "param ne kadar", "hisselerim ne", "portföyümü oku", "Aselsan 5 lot al" gibi komutlar verebilirsiniz. ` +
    `Sayfayı okutmak için ${shortcutsText.read} kullanın. ` +
    `Erişilebilir modu ${shortcutsText.mode} ile açıp sade, yüksek kontrast arayüze geçebilirsiniz. ` +
    `Bu tanıtımı tekrar dinlemek için ${shortcutsText.explain} tuşunu kullanın. ` +
    `Açık pencereyi kapatmak için ${shortcutsText.close}.`
  );
}

function NotFoundPage() {
  return (
    <div role="alert" className="max-w-2xl mx-auto py-16 px-4 text-center space-y-4">
      <h1 className="text-4xl font-black">404 — Sayfa bulunamadı</h1>
      <p className="text-lg text-slate-600 dark:text-slate-300">
        Aradığınız sayfa taşınmış ya da hiç var olmamış olabilir.
      </p>
      <Link
        to="/"
        className="inline-block px-6 py-3 bg-blue-700 text-white font-black border-2 border-slate-900 dark:border-white"
      >
        Ana sayfaya dön
      </Link>
    </div>
  );
}

export default function App() {
  return (
    <Router>
      <AppShell />
    </Router>
  );
}

function AppShell() {
  const navigate = useNavigate();
  const location = useLocation();
  const { announce } = useAnnouncer();
  const {
    conciseMode,
    shortcuts,
    onboardingSeen,
    setOnboardingSeen,
    setConciseMode,
    setShortcut,
    resetShortcuts,
    accessibleMode,
    setAccessibleMode,
  } = useAccessibilitySettings();
  const { stocks, lastUpdated, marketDataWarning } = useStocksQuotes();
  const { predictions, predictLoading, predictUpdatedAt, loadPredictions } = usePredictions();
  const portfolio = usePortfolio(stocks);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);

  // Sayfa değiştiğinde başlığı duyur ve main'e odaklan (screen reader navigasyonu için).
  useEffect(() => {
    let title: string | null = ROUTE_TITLES[location.pathname] ?? null;
    if (!title && location.pathname.startsWith('/stock/')) {
      const sym = location.pathname.split('/')[2]?.toUpperCase();
      const stock = stocks.find((s) => s.symbol === sym);
      title = stock ? `${stock.name} (${stock.symbol}) hisse detayı` : `${sym} hisse detayı`;
    }
    if (!title) title = 'Finto';
    document.title = `${title} · Finto`;
    announce(`${title} sayfası açıldı`);
    // Odağı main'e taşı — ekran okuyucu yeni içerikten okumaya başlar.
    const main =
      document.getElementById('a11y-main') ?? document.getElementById('main-content');
    if (main) (main as HTMLElement).focus({ preventScroll: false });
  }, [location.pathname, announce, stocks]);

  useEffect(() => {
    if (marketDataWarning) announce(marketDataWarning, 'assertive');
  }, [marketDataWarning, announce]);

  useEffect(() => {
    function onRestart() {
      setOnboardingSeen(false);
      localStorage.removeItem('finto_a11y_hint_shown');
    }
    window.addEventListener(APP_EVENTS.onboardingRestart, onRestart);
    return () => window.removeEventListener(APP_EVENTS.onboardingRestart, onRestart);
  }, [setOnboardingSeen]);

  // İlk ziyarette ekran okuyucu kullanıcıya sade görünümün varlığını duyur.
  // Sayfa başlığı duyurusunun üstüne binmesin diye küçük bir gecikme.
  useEffect(() => {
    if (onboardingSeen || accessibleMode) return;
    if (localStorage.getItem('finto_a11y_hint_shown') === '1') return;
    const t = setTimeout(() => {
      announce(
        `Finto'ya hoş geldiniz. Görme engelliler için sade görünüm: ${formatShortcut(shortcuts.toggleAccessibleMode)}.`,
        'polite',
      );
      localStorage.setItem('finto_a11y_hint_shown', '1');
    }, 1200);
    return () => clearTimeout(t);
  }, [onboardingSeen, accessibleMode, announce, shortcuts]);

  const [showAuthModal, setShowAuthModal] = useState(false);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('finto_dark') === 'true';
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('finto_dark', String(darkMode));
  }, [darkMode]);

  const closeTopLayer = useCallback(() => {
    if (isCommandPaletteOpen) {
      setIsCommandPaletteOpen(false);
      return;
    }
    if (showAuthModal) {
      setShowAuthModal(false);
      return;
    }
    window.dispatchEvent(new CustomEvent(APP_EVENTS.layerCloseTop));
    window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantClose));
  }, [isCommandPaletteOpen, showAuthModal]);

  const handleReadPage = useCallback(() => {
    const text = buildPageSpeech(location.pathname, portfolio, stocks, conciseMode);
    window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantSpeak, { detail: { text } }));
  }, [location.pathname, portfolio, stocks, conciseMode]);

  const announceAllFeatures = useCallback(() => {
    const text = buildFeatureGuideSpeech({
      assistant: formatShortcut(shortcuts.toggleAssistant),
      mic: formatShortcut(shortcuts.startListening),
      read: formatShortcut(shortcuts.readPage),
      mode: formatShortcut(shortcuts.toggleAccessibleMode),
      explain: formatShortcut(shortcuts.announceFeatures),
      close: formatShortcut(shortcuts.closeTopLayer),
    });
    announce('Özellik tanıtımı okunuyor.', 'polite');
    window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantSpeak, { detail: { text } }));
  }, [announce, shortcuts]);

  const toggleAccessibleMode = useCallback(() => {
    const next = !accessibleMode;
    setAccessibleMode(next);
    announce(next ? 'Erişilebilir görünüme geçildi.' : 'Normal görünüme geçildi.', 'polite');
  }, [accessibleMode, setAccessibleMode, announce]);

  const runCommand = useCallback(
    (commandId: CommandItem['id']) => {
      if (commandId === 'toggle-assistant') {
        window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantToggle));
        return;
      }
      if (commandId === 'start-listening') {
        window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantListen));
        return;
      }
      if (commandId === 'read-page') {
        handleReadPage();
        return;
      }
      if (commandId === 'go-home') {
        navigate('/');
        return;
      }
      if (commandId === 'go-portfolio') {
        navigate('/portfolio');
        return;
      }
      if (commandId === 'go-profile') {
        navigate('/profile');
        return;
      }
      if (commandId === 'close-layer') {
        closeTopLayer();
        return;
      }
      if (commandId === 'shortcut-help') {
        const text = getGlobalHint(shortcuts);
        announce(text, 'polite');
        window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantSpeak, { detail: { text } }));
        return;
      }
      if (commandId === 'announce-features') {
        announceAllFeatures();
        return;
      }
      if (commandId === 'toggle-accessible-mode') {
        toggleAccessibleMode();
      }
    },
    [announce, announceAllFeatures, closeTopLayer, handleReadPage, navigate, shortcuts, toggleAccessibleMode],
  );

  // Bekleyen satış onayı: kullanıcı "sat" deyince hemen yapmıyoruz; "evet" beklenir.
  // 15 sn içinde onay/red gelmezse otomatik iptal.
  const pendingSellRef = useRef<{ symbol: string; quantity: number; expires: number } | null>(null);

  // Sesli komut → yerel intent
  const handleVoiceCommand = useCallback<VoiceCommandHandler>(
    async (text) => {
      // Önce bekleyen satış onayını kontrol et — kullanıcının her cümlesi
      // önce "sat onayı mı?" diye değerlendirilir.
      const pending = pendingSellRef.current;
      if (pending) {
        const expired = Date.now() > pending.expires;
        pendingSellRef.current = null;
        if (expired) {
          return { handled: true, reply: 'Satış onayı zaman aşımına uğradı, iptal edildi.' };
        }
        const t = text.toLowerCase().trim();
        if (/^(evet|onayl[ıi]yorum|onayla|tamam|olur|yap)\b/.test(t)) {
          const res = await portfolio.sellStock(pending.symbol, pending.quantity);
          return { handled: true, reply: res.message };
        }
        if (/^(hay[ıi]r|iptal|vazge[çc]|durdur|olmaz)\b/.test(t)) {
          return { handled: true, reply: 'Satış iptal edildi.' };
        }
        // Anlamadık → iptal sayıp normal akışa geç (kullanıcı yeni komut vermiş olabilir).
      }

      const intent = parseVoiceCommand(text, BIST_SYMBOLS);
      if (!intent) return { handled: false };

      if (intent.type === 'help') {
        return { handled: true, reply: getGlobalHint(shortcuts) };
      }
      if (intent.type === 'open-assistant') {
        window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantToggle));
        return { handled: true, reply: 'Asistan açılıyor.' };
      }
      if (intent.type === 'close-assistant') {
        window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantClose));
        return { handled: true, reply: 'Tamam, kapatıyorum.' };
      }
      if (intent.type === 'set-mode') {
        const wantAccessible = intent.mode === 'accessible';
        setAccessibleMode(wantAccessible);
        return {
          handled: true,
          reply: wantAccessible
            ? 'Erişilebilir görünüme geçildi.'
            : 'Normal görünüme geçildi.',
        };
      }
      if (intent.type === 'navigate') {
        if (intent.to === 'stock' && intent.symbol) {
          navigate(`/stock/${intent.symbol.toLowerCase()}`);
          return { handled: true, reply: `${intent.symbol} detay sayfasını açıyorum.` };
        }
        if (intent.to !== 'stock') {
          navigate(intent.to);
          const name = ROUTE_TITLES[intent.to] ?? 'sayfa';
          return { handled: true, reply: `${name} açılıyor.` };
        }
      }
      if (intent.type === 'read') {
        if (intent.what === 'portfolio') {
          return { handled: true, reply: buildPortfolioSpeech(portfolio, stocks, conciseMode) };
        }
        if (intent.what === 'holdings') {
          return { handled: true, reply: buildHoldingsSpeech(portfolio, stocks, conciseMode) };
        }
        if (intent.what === 'cash') {
          return { handled: true, reply: `Nakit bakiyeniz ${fmtTry(portfolio.cashBalance)}.` };
        }
        if (intent.what === 'page') {
          return { handled: true, reply: buildPageSpeech(location.pathname, portfolio, stocks, conciseMode) };
        }
      }
      if (intent.type === 'buy') {
        const res = await portfolio.buyStock(intent.symbol, intent.quantity);
        return { handled: true, reply: res.message };
      }
      if (intent.type === 'sell') {
        pendingSellRef.current = {
          symbol: intent.symbol,
          quantity: intent.quantity,
          expires: Date.now() + 15_000,
        };
        return {
          handled: true,
          reply: `${intent.quantity} lot ${intent.symbol} satışını onaylıyor musunuz? Evet ya da hayır deyin.`,
        };
      }
      if (intent.type === 'list-stocks') {
        return { handled: true, reply: buildStocksSpeech(stocks, intent.count ?? 5) };
      }
      if (intent.type === 'list-predictions') {
        return {
          handled: true,
          reply: buildPredictionsSpeech(predictions, stocks, intent.count ?? 5),
        };
      }
      if (intent.type === 'stock-price') {
        const s = stocks.find((x) => x.symbol === intent.symbol);
        if (!s) return { handled: true, reply: `${intent.symbol} listemde yok.` };
        const dir = s.dailyChangePercent >= 0 ? 'yükselişte' : 'düşüşte';
        return {
          handled: true,
          reply: `${s.name}, sembol ${s.symbol}, fiyatı ${fmtTry(s.price)}, gün içi yüzde ${Math.abs(
            s.dailyChangePercent,
          ).toFixed(2)} ${dir}.`,
        };
      }
      if (intent.type === 'stock-prediction') {
        return { handled: true, reply: buildSinglePredictionSpeech(intent.symbol, predictions, stocks) };
      }
      return { handled: false };
    },
    [navigate, portfolio, stocks, predictions, location.pathname, conciseMode, shortcuts, setAccessibleMode],
  );

  // Klavye kısayolları
  useKeyboardShortcuts(
    {
      onToggleAssistant: () => window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantToggle)),
      onStartListening: () => window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantListen)),
      onCloseTopLayer: closeTopLayer,
      onOpenCommandPalette: () => setIsCommandPaletteOpen(true),
      onReadPage: handleReadPage,
      onToggleAccessibleMode: toggleAccessibleMode,
      onAnnounceFeatures: announceAllFeatures,
    },
    shortcuts,
    announce,
  );

  const registeredStocks = useMemo(
    () => stocks.filter((stock) => portfolio.registeredSymbols.includes(stock.symbol)),
    [portfolio.registeredSymbols, stocks],
  );

  const tickerItems = useMemo(
    () =>
      stocks.map((stock) => ({
        symbol: stock.symbol,
        priceText: stock.price.toLocaleString('tr-TR', {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        }),
        pct: stock.dailyChangePercent,
      })),
    [stocks],
  );

  const { user } = useAuth();
  const { locale, setLocale, t } = useI18n();

  if (accessibleMode) {
    return (
      <>
        <AccessibleShell
          portfolio={portfolio}
          stocks={stocks}
          marketDataWarning={marketDataWarning}
          onOpenAuth={() => setShowAuthModal(true)}
        />
        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          commands={COMMAND_ITEMS}
          onRunCommand={runCommand}
          onClose={() => setIsCommandPaletteOpen(false)}
        />
        <GlobalAssistant onVoiceCommand={handleVoiceCommand} shortcuts={shortcuts} concise uiMode="accessible" />
      </>
    );
  }

  return (
    <div className={`min-h-screen ai-grid-bg font-sans selection:bg-blue-200 text-slate-900 dark:text-slate-100 flex flex-col relative overflow-x-hidden`}>
        <a href="#main-content" className="skip-to-content">
          Ana içeriğe atla
        </a>
        <AccessibilityTour />
        <header role="banner" className="ai-glass ai-neon-border sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
            <Link
              to="/"
              className="flex items-center gap-3 outline-none focus:ring-4 focus:ring-blue-500 rounded px-1"
              aria-label="Finto Ana Sayfa"
            >
              <div className="w-9 h-9 md:w-10 md:h-10 rounded-lg flex items-center justify-center font-bold text-xl italic text-white bg-blue-700">F</div>
              <span className="text-xl md:text-2xl font-black tracking-tighter text-slate-900 dark:text-slate-100">FINTO</span>
            </Link>
            <div className="flex items-center gap-3">
              <nav className="hidden md:flex gap-2 font-semibold text-slate-600 dark:text-slate-300">
                <Link to="/" className="px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">{t('nav.home')}</Link>
                <Link to="/portfolio" className="px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">{t('nav.portfolio')}</Link>
                <Link to="/compare" className="px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">{t('nav.compare')}</Link>
              </nav>
              <SymbolSearch />
              <button
                onClick={() => setDarkMode((d) => !d)}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 transition-colors"
                aria-label={darkMode ? 'Aydınlık temaya geç' : 'Karanlık temaya geç'}
                aria-pressed={darkMode}
              >
                {darkMode ? <Sun size={18} aria-hidden="true" /> : <Moon size={18} aria-hidden="true" />}
              </button>
              <button
                onClick={() => setLocale(locale === 'tr' ? 'en' : 'tr')}
                className="px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-black text-slate-700 dark:text-slate-200 transition-colors"
                aria-label={t('common.lang')}
                title={t('common.lang')}
              >
                {locale.toUpperCase()}
              </button>
              {user ? (
                <Link to="/profile" className="flex items-center gap-2 px-3 py-1.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-blue-700 flex items-center justify-center font-black text-xs text-white">
                    {user.name ? user.name.charAt(0).toUpperCase() : <User size={14} />}
                  </div>
                  <span className="text-sm font-bold text-slate-700 dark:text-slate-200 hidden sm:block max-w-[120px] truncate">{user.name ?? user.email}</span>
                </Link>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-sm font-black transition-colors"
                >
                  <LogIn size={15} />
                  <span>Giriş Yap</span>
                </button>
              )}
            </div>
          </div>
          {tickerItems.length > 0 && (
            <div
              aria-hidden="true"
              className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 ticker-mask"
            >
              <div className="ticker-track py-2">
                {[...tickerItems, ...tickerItems].map((item, idx) => (
                  <div key={`${item.symbol}-${idx}`} className="flex items-center gap-2 px-4 whitespace-nowrap">
                    <span className="text-[11px] font-black text-slate-800 dark:text-slate-100">{item.symbol}</span>
                    <span className="text-[11px] font-semibold text-slate-600 dark:text-slate-300">{item.priceText} TL</span>
                    <span className={`text-[11px] font-black ${item.pct >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {item.pct >= 0 ? '+' : ''}%{item.pct.toFixed(2)}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </header>

        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}
        <CommandPalette
          isOpen={isCommandPaletteOpen}
          commands={COMMAND_ITEMS}
          onRunCommand={runCommand}
          onClose={() => setIsCommandPaletteOpen(false)}
        />

        {/* Arka plan filigran logolar (çapraz + yan yana) */}
        <div className="pointer-events-none fixed inset-0 z-0 hidden xl:block" aria-hidden="true">
          <div className="absolute left-[-92px] top-20 bottom-8 flex flex-col justify-between">
            {Array.from({ length: 9 }, (_, row) => (
              <img
                key={`wm-left-${row}`}
                src="/finto-wordmark.png"
                alt=""
                className="w-44 h-auto object-contain opacity-[0.045] dark:opacity-[0.07] -rotate-90 select-none"
              />
            ))}
          </div>
          <div className="absolute left-[-28px] top-24 bottom-10 flex flex-col justify-between">
            {Array.from({ length: 9 }, (_, row) => (
              <img
                key={`wm-left-cross-${row}`}
                src="/finto-wordmark.png"
                alt=""
                className="w-40 h-auto object-contain opacity-[0.03] dark:opacity-[0.055] -rotate-[72deg] select-none"
              />
            ))}
          </div>
          <div className="absolute right-[-92px] top-20 bottom-8 flex flex-col justify-between">
            {Array.from({ length: 9 }, (_, row) => (
              <img
                key={`wm-right-${row}`}
                src="/finto-wordmark.png"
                alt=""
                className="w-44 h-auto object-contain opacity-[0.04] dark:opacity-[0.065] rotate-90 select-none"
              />
            ))}
          </div>
          <div className="absolute right-[-28px] top-24 bottom-10 flex flex-col justify-between">
            {Array.from({ length: 9 }, (_, row) => (
              <img
                key={`wm-right-cross-${row}`}
                src="/finto-wordmark.png"
                alt=""
                className="w-40 h-auto object-contain opacity-[0.03] dark:opacity-[0.055] rotate-[72deg] select-none"
              />
            ))}
          </div>
        </div>

        <main id="main-content" tabIndex={-1} className="flex-1 max-w-5xl w-full mx-auto pb-32 pt-4 md:pt-8 relative z-10">
          <Routes>
            <Route
              path="/profile"
              element={
                <Profile
                  cashBalance={portfolio.cashBalance}
                  holdingsValue={portfolio.holdingsValue}
                  totalBalance={portfolio.totalBalance}
                  registeredCount={portfolio.registeredSymbols.length}
                  holdingsCount={portfolio.holdings.reduce((sum, holding) => sum + holding.quantity, 0)}
                  transactions={portfolio.transactions}
                  onDepositCash={portfolio.depositCash}
                  onWithdrawCash={portfolio.withdrawCash}
                  conciseMode={conciseMode}
                  onConciseModeChange={setConciseMode}
                  shortcuts={shortcuts}
                  onShortcutChange={setShortcut}
                  onShortcutReset={resetShortcuts}
                  onRestartOnboarding={() => setOnboardingSeen(false)}
                />
              }
            />
            <Route
              path="/"
              element={
                <Home
                  stocks={stocks}
                  predictions={predictions}
                  predictLoading={predictLoading}
                  lastUpdated={lastUpdated}
                  registeredSymbols={portfolio.registeredSymbols}
                  pinnedSymbols={portfolio.pinnedSymbols}
                  onToggleRegisteredStock={portfolio.toggleRegisteredStock}
                  onTogglePinnedStock={portfolio.togglePinnedStock}
                />
              }
            />
            <Route
              path="/portfolio"
              element={
                <Dashboard
                  cashBalance={portfolio.cashBalance}
                  holdings={portfolio.holdings}
                  holdingsValue={portfolio.holdingsValue}
                  totalBalance={portfolio.totalBalance}
                  stocks={registeredStocks}
                  allStocks={stocks}
                  registeredSymbols={portfolio.registeredSymbols}
                  predictions={predictions}
                  predictLoading={predictLoading}
                  predictUpdatedAt={predictUpdatedAt}
                  lastUpdated={lastUpdated}
                  marketDataWarning={marketDataWarning}
                  onBuyStock={portfolio.buyStock}
                  onSellStock={portfolio.sellStock}
                  onDepositCash={portfolio.depositCash}
                  onWithdrawCash={portfolio.withdrawCash}
                />
              }
            />
            <Route
              path="/stock/:symbol"
              element={
                <StockDetail
                  stocks={stocks}
                  predictions={predictions}
                  predictLoading={predictLoading}
                  predictUpdatedAt={predictUpdatedAt}
                  onRefreshPrediction={(symbol) => loadPredictions([symbol], { quiet: true })}
                />
              }
            />
            <Route
              path="/compare"
              element={
                <Compare
                  stocks={stocks}
                  predictions={predictions}
                  onRefreshPrediction={(symbol) => loadPredictions([symbol], { quiet: true })}
                />
              }
            />
            <Route path="/shortcuts" element={<Shortcuts />} />
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </main>

      <GlobalAssistant onVoiceCommand={handleVoiceCommand} shortcuts={shortcuts} concise={conciseMode} uiMode="standard" />
    </div>
  );
}
