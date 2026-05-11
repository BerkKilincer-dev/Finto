import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import GlobalAssistant from './components/GlobalAssistant';
import Home from './pages/Home';
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

type TransactionType = 'buy' | 'sell' | 'deposit' | 'withdraw';

type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  createdAt: string;
  symbol?: string;
  quantity?: number;
};

const INITIAL_BIST_STOCKS: MarketStock[] = BIST_WATCHLIST.map((s) => ({ ...s }));

export default function App() {
  const [stocks, setStocks] = useState<MarketStock[]>(INITIAL_BIST_STOCKS);
  const [predictions, setPredictions] = useState<Record<string, TechnicalPrediction>>({});
  const [predictLoading, setPredictLoading] = useState(true);
  const [predictUpdatedAt, setPredictUpdatedAt] = useState<Date | null>(null);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketDataWarning, setMarketDataWarning] = useState<string | null>(null);
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
  const [registeredSymbols, setRegisteredSymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('finto_registered_symbols');
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
        }
      }
    } catch {
      // noop
    }
    return [];
  });
  const [transactions, setTransactions] = useState<Transaction[]>(() => {
    try {
      const saved = localStorage.getItem('finto_transactions');
      if (saved) {
        const parsed = JSON.parse(saved) as unknown;
        if (Array.isArray(parsed)) {
          return parsed.filter((item): item is Transaction => {
            if (!item || typeof item !== 'object') return false;
            const rec = item as Record<string, unknown>;
            return (
              typeof rec.id === 'string' &&
              typeof rec.type === 'string' &&
              typeof rec.amount === 'number' &&
              typeof rec.createdAt === 'string'
            );
          });
        }
      }
    } catch {
      // noop
    }
    return [];
  });
  const [pinnedSymbols, setPinnedSymbols] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('finto_pinned_symbols');
      if (!saved) return [];
      const parsed = JSON.parse(saved) as unknown;
      if (!Array.isArray(parsed)) return [];
      return parsed.filter((item): item is string => typeof item === 'string' && item.trim().length > 0);
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

  useEffect(() => {
    setRegisteredSymbols((prev) => {
      const symbols = new Set(prev);
      holdings.forEach((holding) => symbols.add(holding.symbol));
      return Array.from(symbols);
    });
  }, [holdings]);

  useEffect(() => {
    localStorage.setItem('finto_registered_symbols', JSON.stringify(registeredSymbols));
  }, [registeredSymbols]);

  useEffect(() => {
    localStorage.setItem('finto_transactions', JSON.stringify(transactions));
  }, [transactions]);

  useEffect(() => {
    localStorage.setItem('finto_pinned_symbols', JSON.stringify(pinnedSymbols));
  }, [pinnedSymbols]);

  const holdingsValue = useMemo(() => {
    return holdings.reduce((total, holding) => {
      const stock = stocks.find((item) => item.symbol === holding.symbol);
      if (!stock) return total;
      return total + holding.quantity * stock.price;
    }, 0);
  }, [holdings, stocks]);

  const registeredStocks = useMemo(
    () => stocks.filter((stock) => registeredSymbols.includes(stock.symbol)),
    [registeredSymbols, stocks]
  );

  const tickerItems = useMemo(
    () =>
      stocks.map((stock) => ({
        symbol: stock.symbol,
        priceText: stock.price.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
        pct: stock.dailyChangePercent,
      })),
    [stocks]
  );

  const totalBalance = cashBalance + holdingsValue;

  function addTransaction(entry: Omit<Transaction, 'id' | 'createdAt'>) {
    setTransactions((prev) => [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...entry,
      },
      ...prev.slice(0, 49),
    ]);
  }

  function buyStock(symbol: string, quantity: number): { ok: boolean; message: string } {
    const stock = stocks.find((item) => item.symbol === symbol);
    if (!stock) return { ok: false, message: 'Hisse bulunamadı.' };
    if (!registeredSymbols.includes(symbol)) return { ok: false, message: 'Önce hisseyi kayıtlı hisselere ekleyin.' };
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
    addTransaction({ type: 'buy', amount: cost, symbol, quantity });
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
    addTransaction({ type: 'sell', amount: proceeds, symbol, quantity });
    return { ok: true, message: `${symbol} için ${quantity} lot satış gerçekleşti. +${proceeds.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })}` };
  }

  function withdrawCash(amount: number): { ok: boolean; message: string } {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: 'Çekilecek tutar 0\'dan büyük olmalı.' };
    if (amount > cashBalance) return { ok: false, message: 'Yetersiz nakit bakiye.' };
    setCashBalance((prev) => prev - amount);
    addTransaction({ type: 'withdraw', amount });
    return { ok: true, message: `${amount.toLocaleString('tr-TR')} TL çekim yapıldı.` };
  }

  function depositCash(amount: number): { ok: boolean; message: string } {
    if (!Number.isFinite(amount) || amount <= 0) return { ok: false, message: 'Yüklenecek tutar 0\'dan büyük olmalı.' };
    setCashBalance((prev) => prev + amount);
    addTransaction({ type: 'deposit', amount });
    return { ok: true, message: `${amount.toLocaleString('tr-TR')} TL bakiye eklendi.` };
  }

  function toggleRegisteredStock(symbol: string): { ok: boolean; message: string } {
    const exists = stocks.some((item) => item.symbol === symbol);
    if (!exists) return { ok: false, message: 'Hisse bulunamadı.' };

    const hasHolding = holdings.some((holding) => holding.symbol === symbol);
    const isRegistered = registeredSymbols.includes(symbol);
    if (isRegistered && hasHolding) {
      return { ok: false, message: 'Bu hissede pozisyonunuz varken kaydı kaldıramazsınız.' };
    }

    setRegisteredSymbols((prev) => {
      if (prev.includes(symbol)) return prev.filter((item) => item !== symbol);
      return [...prev, symbol];
    });
    return { ok: true, message: isRegistered ? `${symbol} kayıtlı hisselerden çıkarıldı.` : `${symbol} kayıtlı hisselere eklendi.` };
  }

  function togglePinnedStock(symbol: string): { ok: boolean; message: string } {
    const exists = stocks.some((item) => item.symbol === symbol);
    if (!exists) return { ok: false, message: 'Hisse bulunamadı.' };
    const isPinned = pinnedSymbols.includes(symbol);
    setPinnedSymbols((prev) => {
      if (isPinned) return prev.filter((item) => item !== symbol);
      return [...prev, symbol];
    });
    return { ok: true, message: isPinned ? `${symbol} favorilerden çıkarıldı.` : `${symbol} favorilere eklendi.` };
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
      const pu = payload?.updatedAt;
      if (typeof pu === 'string') setPredictUpdatedAt(new Date(pu));
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
        if (!response.ok) {
          if (!isCancelled) setMarketDataWarning('Canlı fiyatlar şu an güncellenemedi (ağ veya veri kaynağı).');
          return;
        }
        const payload = await response.json();
        const liveQuotes: Array<Partial<MarketStock> & { symbol: string }> = payload?.quotes ?? [];
        if (isCancelled || !Array.isArray(liveQuotes) || liveQuotes.length === 0) {
          if (!isCancelled) setMarketDataWarning('Canlı fiyatlar alınamadı.');
          return;
        }
        setMarketDataWarning(null);
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
      <div className={`min-h-screen ai-grid-bg font-sans selection:bg-blue-200 text-slate-900 dark:text-slate-100 flex flex-col relative overflow-x-hidden`}>
        <header className="ai-glass ai-neon-border sticky top-0 z-40">
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
                <Link to="/" className="px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">Ana Sayfa</Link>
                <Link to="/portfolio" className="px-3 py-1.5 rounded-lg hover:bg-blue-50 dark:hover:bg-slate-800 hover:text-blue-700 dark:hover:text-blue-300 transition-colors">Portföyüm</Link>
              </nav>
              <button
                onClick={() => setDarkMode((d) => !d)}
                className="p-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-200 transition-colors"
                aria-label="Karanlık mod"
              >
                {darkMode ? <Sun size={18} /> : <Moon size={18} />}
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
            <div className="border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/70 ticker-mask">
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

        <main className="flex-1 max-w-5xl w-full mx-auto pb-32 pt-4 md:pt-8 relative z-10">
          <Routes>
            <Route
              path="/profile"
              element={
                <Profile
                  cashBalance={cashBalance}
                  holdingsValue={holdingsValue}
                  totalBalance={totalBalance}
                  registeredCount={registeredSymbols.length}
                  holdingsCount={holdings.reduce((sum, holding) => sum + holding.quantity, 0)}
                  transactions={transactions}
                  onDepositCash={depositCash}
                  onWithdrawCash={withdrawCash}
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
                  registeredSymbols={registeredSymbols}
                  pinnedSymbols={pinnedSymbols}
                  onToggleRegisteredStock={toggleRegisteredStock}
                  onTogglePinnedStock={togglePinnedStock}
                />
              }
            />
            <Route
              path="/portfolio"
              element={
                <Dashboard
                  cashBalance={cashBalance}
                  holdings={holdings}
                  holdingsValue={holdingsValue}
                  totalBalance={totalBalance}
                  stocks={registeredStocks}
                  allStocks={stocks}
                  registeredSymbols={registeredSymbols}
                  predictions={predictions}
                  predictLoading={predictLoading}
                  predictUpdatedAt={predictUpdatedAt}
                  lastUpdated={lastUpdated}
                  marketDataWarning={marketDataWarning}
                  onBuyStock={buyStock}
                  onSellStock={sellStock}
                  onDepositCash={depositCash}
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
                  predictUpdatedAt={predictUpdatedAt}
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