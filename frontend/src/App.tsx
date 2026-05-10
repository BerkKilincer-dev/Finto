import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import GlobalAssistant from './components/GlobalAssistant';
import Dashboard from './pages/Dashboard';
import StockDetail from './pages/StockDetail';
import Profile from './pages/Profile';
import AuthModal from './components/AuthModal';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BIST_SYMBOLS, BIST_WATCHLIST } from './data/bistWatchlist';
import type { TechnicalPrediction } from '../../backend/predictionEngine.ts';
import { Moon, Sun, User, LogIn } from 'lucide-react';
import { useAuth } from './contexts/AuthContext.tsx';

type MarketStock = {
  symbol: string;
  name: string;
  price: number;
  dailyChangePercent: number;
  marketTag: string;
  marketCap?: number;
  source?: string;
};

type Holding = {
  symbol: string;
  quantity: number;
  averageCost: number;
};

const INITIAL_BIST_STOCKS: MarketStock[] = BIST_WATCHLIST.map((s) => ({ ...s }));

export default function App() {
  const [stocks, setStocks] = useState<MarketStock[]>(INITIAL_BIST_STOCKS);
  const [predictions, setPredictions] = useState<Record<string, TechnicalPrediction>>({});
  const [predictLoading, setPredictLoading] = useState(true);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [darkMode, setDarkMode] = useState<boolean>(() => {
    return localStorage.getItem('finto_dark') === 'true';
  });
  const [cashBalance, setCashBalance] = useState<number>(() => {
    const saved = localStorage.getItem('finto_cash');
    return saved !== null ? Number(saved) : 30000;
  });
  const [holdings, setHoldings] = useState<Holding[]>(() => {
    try {
      const saved = localStorage.getItem('finto_holdings');
      return saved ? (JSON.parse(saved) as Holding[]) : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    if (darkMode) {
      document.documentElement.classList.add('dark');
    } else {
      document.documentElement.classList.remove('dark');
    }
    localStorage.setItem('finto_dark', String(darkMode));
  }, [darkMode]);

  useEffect(() => {
    localStorage.setItem('finto_cash', String(cashBalance));
  }, [cashBalance]);

  useEffect(() => {
    localStorage.setItem('finto_holdings', JSON.stringify(holdings));
  }, [holdings]);

  const holdingsValue = useMemo(() => {
    return holdings.reduce((total, holding) => {
      const stock = stocks.find((item) => item.symbol === holding.symbol);
      if (!stock) return total;
      return total + holding.quantity * stock.price;
    }, 0);
  }, [holdings, stocks]);

  const totalBalance = cashBalance + holdingsValue;

  function buyStock(symbol: string, quantity: number): { ok: boolean; message: string } {
    const stock = stocks.find((item) => item.symbol === symbol);
    if (!stock) return { ok: false, message: 'Hisse bulunamadı.' };
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, message: 'Lot adedi 1 veya daha büyük olmalı.' };

    const cost = stock.price * quantity;
    if (cost > cashBalance) return { ok: false, message: 'Yetersiz nakit bakiye.' };

    setCashBalance((prev) => prev - cost);
    setHoldings((prev) => {
      const existing = prev.find((item) => item.symbol === symbol);
      if (!existing) return [...prev, { symbol, quantity, averageCost: stock.price }];
      const newQty = existing.quantity + quantity;
      const weightedAvg = (existing.averageCost * existing.quantity + cost) / newQty;
      return prev.map((item) => item.symbol === symbol ? { ...item, quantity: newQty, averageCost: weightedAvg } : item);
    });
    return { ok: true, message: `${symbol} için ${quantity} lot alım gerçekleşti.` };
  }

  function sellStock(symbol: string, quantity: number): { ok: boolean; message: string } {
    const stock = stocks.find((item) => item.symbol === symbol);
    if (!stock) return { ok: false, message: 'Hisse bulunamadı.' };
    const holding = holdings.find((item) => item.symbol === symbol);
    if (!holding) return { ok: false, message: 'Bu hissede pozisyon bulunmuyor.' };
    if (!Number.isFinite(quantity) || quantity <= 0) return { ok: false, message: 'Lot adedi 1 veya daha büyük olmalı.' };
    if (quantity > holding.quantity) return { ok: false, message: `En fazla ${holding.quantity} lot satabilirsiniz.` };

    const proceeds = stock.price * quantity;
    setCashBalance((prev) => prev + proceeds);
    setHoldings((prev) => {
      const newQty = holding.quantity - quantity;
      if (newQty === 0) return prev.filter((item) => item.symbol !== symbol);
      return prev.map((item) => item.symbol === symbol ? { ...item, quantity: newQty } : item);
    });
    return { ok: true, message: `${symbol} için ${quantity} lot satış gerçekleşti. +${proceeds.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })}` };
  }

  function withdrawCash(amount: number): { ok: boolean; message: string } {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: 'Çekilecek tutar 0\'dan büyük olmalı.' };
    if (amount > cashBalance) return { ok: false, message: 'Yetersiz nakit bakiye.' };
    setCashBalance((prev) => prev - amount);
    return { ok: true, message: `${amount.toLocaleString('tr-TR')} TL çekim yapıldı.` };
  }

  const loadPredictions = useCallback(async (symbols?: string[], options?: { quiet?: boolean }) => {
    if (!options?.quiet) setPredictLoading(true);
    try {
      const response = await fetch('/api/stocks/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbols ?? BIST_SYMBOLS }),
      });
      if (!response.ok) return;
      const payload = await response.json();
      const map = payload?.predictions as Record<string, TechnicalPrediction> | undefined;
      if (map && typeof map === 'object') setPredictions((prev) => ({ ...prev, ...map }));
    } catch {
      // Tahmin servisi kapalıysa önceki cache kalır
    } finally {
      if (!options?.quiet) setPredictLoading(false);
    }
  }, []);

  useEffect(() => { loadPredictions(); }, [loadPredictions]);

  useEffect(() => {
    const interval = setInterval(() => loadPredictions(undefined, { quiet: true }), 5 * 60_000);
    return () => clearInterval(interval);
  }, [loadPredictions]);

  useEffect(() => {
    let isCancelled = false;
    async function loadLiveQuotes() {
      try {
        const response = await fetch('/api/stocks/quotes');
        if (!response.ok) return;
        const payload = await response.json();
        const liveQuotes: Array<Partial<MarketStock> & { symbol: string }> = payload?.quotes ?? [];
        if (isCancelled || !Array.isArray(liveQuotes) || liveQuotes.length === 0) return;
        setStocks((prev) =>
          prev.map((stock) => {
            const live = liveQuotes.find((q) => q.symbol === stock.symbol);
            if (!live || typeof live.price !== 'number') return stock;
            const pctRaw = live.dailyChangePercent;
            const pct = typeof pctRaw === 'number' ? pctRaw : typeof pctRaw === 'string' ? Number.parseFloat(pctRaw) : NaN;
            return {
              ...stock,
              name: typeof live.name === 'string' && live.name.trim() ? live.name : stock.name,
              price: live.price,
              dailyChangePercent: Number.isFinite(pct) ? pct : stock.dailyChangePercent,
              marketCap: typeof live.marketCap === 'number' ? live.marketCap : stock.marketCap,
              source: typeof live.source === 'string' ? live.source : stock.source,
            };
          })
        );
        setLastUpdated(new Date());
      } catch {
        // Live quote alınamazsa mevcut fiyatları koruyoruz.
      }
    }
    loadLiveQuotes();
    const interval = setInterval(loadLiveQuotes, 60_000);
    return () => { isCancelled = true; clearInterval(interval); };
  }, []);

  const { user } = useAuth();
  const [showAuthModal, setShowAuthModal] = useState(false);

  return (
    <Router>
      <div className={`min-h-screen bg-slate-50 dark:bg-slate-950 font-sans selection:bg-blue-200 text-slate-900 dark:text-slate-100 flex flex-col`}>
        <header className="bg-slate-900 dark:bg-slate-800 text-white border-b-4 border-slate-900 sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-4 md:px-8 h-16 md:h-20 flex items-center justify-between">
            <Link
              to="/"
              className="flex items-center gap-3 outline-none focus:ring-4 focus:ring-blue-500 rounded px-1"
              aria-label="Finto Ana Sayfa"
            >
              <div className="w-9 h-9 md:w-10 md:h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl italic text-white">F</div>
              <span className="text-xl md:text-2xl font-black tracking-tighter text-white">FINTO</span>
            </Link>
            <div className="flex items-center gap-3">
              <nav className="hidden md:flex gap-6 font-semibold text-slate-300">
                <Link to="/" className="hover:text-white transition-colors">Portföy</Link>
              </nav>
              <button
                onClick={() => setDarkMode((d) => !d)}
                className="p-2 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-slate-300 hover:text-white transition-colors"
                aria-label="Karanlık mod"
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
              </button>
              {user ? (
                <Link to="/profile" className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 transition-colors">
                  <div className="w-7 h-7 rounded-full bg-blue-600 flex items-center justify-center font-black text-xs text-white">
                    {user.name ? user.name.charAt(0).toUpperCase() : <User size={14} />}
                  </div>
                  <span className="text-sm font-bold text-slate-200 hidden sm:block max-w-[120px] truncate">{user.name ?? user.email}</span>
                </Link>
              ) : (
                <button
                  onClick={() => setShowAuthModal(true)}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white text-sm font-black transition-colors"
                >
                  <LogIn size={15} />
                  <span>Giriş Yap</span>
                </button>
              )}
            </div>
          </div>
        </header>

        {showAuthModal && <AuthModal onClose={() => setShowAuthModal(false)} />}

        <main className="flex-1 max-w-5xl w-full mx-auto pb-32 pt-4 md:pt-8">
          <Routes>
            <Route path="/profile" element={<Profile />} />
            <Route
              path="/"
              element={
                <Dashboard
                  cashBalance={cashBalance}
                  holdings={holdings}
                  holdingsValue={holdingsValue}
                  totalBalance={totalBalance}
                  stocks={stocks}
                  predictions={predictions}
                  predictLoading={predictLoading}
                  lastUpdated={lastUpdated}
                  onBuyStock={buyStock}
                  onSellStock={sellStock}
                  onWithdrawCash={withdrawCash}
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
                  onRefreshPrediction={(symbol) => loadPredictions([symbol], { quiet: true })}
                />
              }
            />
          </Routes>
        </main>

        <GlobalAssistant />
      </div>
    </Router>
  );
}