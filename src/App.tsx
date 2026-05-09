import { BrowserRouter as Router, Routes, Route, Link } from 'react-router-dom';
import GlobalAssistant from './components/GlobalAssistant';
import Dashboard from './pages/Dashboard';
import StockDetail from './pages/StockDetail';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { BIST_SYMBOLS, BIST_WATCHLIST } from './data/bistWatchlist';
import type { TechnicalPrediction } from '../predictionEngine.ts';

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
  const [cashBalance, setCashBalance] = useState(30000);
  const [holdings, setHoldings] = useState<Holding[]>([
    { symbol: 'KCHOL', quantity: 40, averageCost: 210.5 },
    { symbol: 'THYAO', quantity: 25, averageCost: 280.0 },
  ]);

  const holdingsValue = useMemo(() => {
    return holdings.reduce((total, holding) => {
      const stock = stocks.find((item) => item.symbol === holding.symbol);
      if (!stock) {
        return total;
      }
      return total + holding.quantity * stock.price;
    }, 0);
  }, [holdings, stocks]);

  const totalBalance = cashBalance + holdingsValue;

  function buyStock(symbol: string, quantity: number): { ok: boolean; message: string } {
    const stock = stocks.find((item) => item.symbol === symbol);
    if (!stock) {
      return { ok: false, message: 'Hisse bulunamadi.' };
    }

    if (!Number.isFinite(quantity) || quantity <= 0) {
      return { ok: false, message: 'Lot adedi 1 veya daha buyuk olmali.' };
    }

    const cost = stock.price * quantity;
    if (cost > cashBalance) {
      return { ok: false, message: 'Yetersiz nakit bakiye.' };
    }

    setCashBalance((prev) => prev - cost);
    setHoldings((prev) => {
      const existing = prev.find((item) => item.symbol === symbol);
      if (!existing) {
        return [...prev, { symbol, quantity, averageCost: stock.price }];
      }

      const newQty = existing.quantity + quantity;
      const weightedAvg = ((existing.averageCost * existing.quantity) + cost) / newQty;
      return prev.map((item) =>
        item.symbol === symbol ? { ...item, quantity: newQty, averageCost: weightedAvg } : item,
      );
    });

    return { ok: true, message: `${symbol} icin ${quantity} lot alim gerceklesti.` };
  }

  function withdrawCash(amount: number): { ok: boolean; message: string } {
    if (!Number.isFinite(amount) || amount <= 0) {
      return { ok: false, message: 'Cekilecek tutar 0dan buyuk olmali.' };
    }
    if (amount > cashBalance) {
      return { ok: false, message: 'Yetersiz nakit bakiye.' };
    }
    setCashBalance((prev) => prev - amount);
    return { ok: true, message: `${amount.toLocaleString('tr-TR')} TL cekim yapildi.` };
  }

  const loadPredictions = useCallback(async (symbols?: string[], options?: { quiet?: boolean }) => {
    if (!options?.quiet) {
      setPredictLoading(true);
    }
    try {
      const response = await fetch('/api/stocks/predict', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ symbols: symbols ?? BIST_SYMBOLS }),
      });
      if (!response.ok) {
        return;
      }
      const payload = await response.json();
      const map = payload?.predictions as Record<string, TechnicalPrediction> | undefined;
      if (map && typeof map === 'object') {
        setPredictions((prev) => ({ ...prev, ...map }));
      }
    } catch {
      // Tahmin servisi kapaliysa onceki cache kalir
    } finally {
      if (!options?.quiet) {
        setPredictLoading(false);
      }
    }
  }, []);

  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  useEffect(() => {
    const interval = setInterval(() => {
      loadPredictions(undefined, { quiet: true });
    }, 5 * 60_000);
    return () => clearInterval(interval);
  }, [loadPredictions]);

  useEffect(() => {
    let isCancelled = false;

    async function loadLiveQuotes() {
      try {
        const response = await fetch('/api/stocks/quotes');
        if (!response.ok) {
          return;
        }
        const payload = await response.json();
        const liveQuotes: Array<Partial<MarketStock> & { symbol: string }> = payload?.quotes ?? [];
        if (isCancelled || !Array.isArray(liveQuotes) || liveQuotes.length === 0) {
          return;
        }

        setStocks((prev) =>
          prev.map((stock) => {
            const live = liveQuotes.find((quote) => quote.symbol === stock.symbol);
            if (!live || typeof live.price !== 'number') {
              return stock;
            }
            const pctRaw = live.dailyChangePercent;
            const pct =
              typeof pctRaw === 'number' ? pctRaw : typeof pctRaw === 'string' ? Number.parseFloat(pctRaw) : NaN;

            return {
              ...stock,
              name: typeof live.name === 'string' && live.name.trim() ? live.name : stock.name,
              price: live.price,
              dailyChangePercent: Number.isFinite(pct) ? pct : stock.dailyChangePercent,
              marketCap: typeof live.marketCap === 'number' ? live.marketCap : stock.marketCap,
              source: typeof live.source === 'string' ? live.source : stock.source,
            };
          }),
        );
      } catch {
        // Live quote alınamazsa mevcut fiyatları koruyoruz.
      }
    }

    loadLiveQuotes();
    const interval = setInterval(loadLiveQuotes, 60_000);

    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  return (
    <Router>
      <div className="min-h-screen bg-slate-50 font-sans selection:bg-blue-200 text-slate-900 flex flex-col">
        
        {/* Erişilebilir/Evrensel Header */}
        <header className="bg-slate-900 text-white border-b-4 border-slate-900 sticky top-0 z-40">
          <div className="max-w-5xl mx-auto px-8 h-20 flex items-center justify-between">
            <Link 
              to="/" 
              className="flex items-center gap-3 outline-none focus:ring-4 focus:ring-blue-500 rounded px-1"
              aria-label="Finto Ana Sayfa"
            >
              <div className="w-10 h-10 bg-blue-600 rounded-lg flex items-center justify-center font-bold text-xl italic text-white">F</div>
              <span className="text-2xl font-black tracking-tighter text-white">FINTO</span>
            </Link>

            <nav className="hidden md:flex gap-6 font-semibold text-slate-300">
              <Link to="/" className="hover:text-white outline-none focus:ring-2 focus:ring-blue-500 rounded">Portföyüm</Link>
              <Link to="/stock/thyao" className="hover:text-white outline-none focus:ring-2 focus:ring-blue-500 rounded">Piyasalar</Link>
            </nav>
          </div>
        </header>

        {/* Ana Sayfa Yönlendirmeleri (Next.js App Router Mantığında) */}
        <main className="flex-1 max-w-5xl w-full mx-auto pb-32 pt-8">
          <Routes>
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
                  onBuyStock={buyStock}
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

        {/* Global Sesli Asistan (Tüm uygulamanın üzerinde yüzen, her path'de geçerli) */}
        <GlobalAssistant />
      </div>
    </Router>
  );
}

