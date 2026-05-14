import { Link } from 'react-router-dom';
import { useMemo, useRef, useState, useEffect } from 'react';
import { TrendingUp, TrendingDown, Minus, ArrowRight, Pin, PinOff } from 'lucide-react';
import type { TechnicalPrediction } from '../../../backend/predictionEngine.ts';
import { useAnnouncer } from '../hooks/useAnnouncer.tsx';

type MarketStock = {
  symbol: string;
  name: string;
  price: number;
  dailyChangePercent: number;
  marketTag: string;
};

type HomeProps = {
  stocks: MarketStock[];
  predictions: Record<string, TechnicalPrediction>;
  predictLoading: boolean;
  lastUpdated: Date | null;
  registeredSymbols: string[];
  pinnedSymbols: string[];
  onToggleRegisteredStock: (symbol: string) => Promise<{ ok: boolean; message: string }>;
  onTogglePinnedStock: (symbol: string) => Promise<{ ok: boolean; message: string }>;
};

const fmt = (n: number) =>
  n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });

export default function Home({
  stocks,
  predictions,
  predictLoading,
  lastUpdated,
  registeredSymbols,
  pinnedSymbols,
  onToggleRegisteredStock,
  onTogglePinnedStock,
}: HomeProps) {
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => () => {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
  }, []);

  const { announce } = useAnnouncer();

  function showFeedback(type: 'success' | 'error', text: string) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ type, text });
    announce(text, type === 'error' ? 'assertive' : 'polite');
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3200);
  }

  const dayStock = useMemo(() => {
    if (stocks.length === 0) return null;
    const dateKey = new Date().toLocaleDateString('tr-TR');
    const seed = Array.from(dateKey).reduce((acc, ch) => acc + ch.charCodeAt(0), 0);

    const ranked = [...stocks].sort((a, b) => {
      const scoreA = (predictions[a.symbol]?.score ?? 0) + a.dailyChangePercent;
      const scoreB = (predictions[b.symbol]?.score ?? 0) + b.dailyChangePercent;
      return scoreB - scoreA;
    });

    if (ranked.length === 1) return ranked[0];
    const topCount = Math.min(5, ranked.length);
    return ranked[seed % topCount];
  }, [stocks, predictions]);

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdated) return null;
    return lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdated]);

  const marketSummary = useMemo(() => {
    const advancing = stocks.filter((s) => s.dailyChangePercent > 0).length;
    const declining = stocks.filter((s) => s.dailyChangePercent < 0).length;
    const flat = stocks.length - advancing - declining;
    const averageDailyChange = stocks.length
      ? stocks.reduce((sum, s) => sum + s.dailyChangePercent, 0) / stocks.length
      : 0;
    const best = stocks.length ? [...stocks].sort((a, b) => b.dailyChangePercent - a.dailyChangePercent)[0] : null;
    const worst = stocks.length ? [...stocks].sort((a, b) => a.dailyChangePercent - b.dailyChangePercent)[0] : null;
    return { advancing, declining, flat, averageDailyChange, best, worst };
  }, [stocks]);

  const dayStockReasons = useMemo(() => {
    if (!dayStock) return [];
    const reasons: string[] = [];
    const pred = predictions[dayStock.symbol];
    if (pred) {
      reasons.push(`Teknik skor ${pred.score > 0 ? '+' : ''}${pred.score} ve trend "${pred.trend}" görünüyor.`);
    }
    reasons.push(`Günlük değişim %${dayStock.dailyChangePercent.toFixed(2)} ile piyasaya göre ${dayStock.dailyChangePercent >= 0 ? 'pozitif' : 'temkinli'} sinyal veriyor.`);
    reasons.push(registeredSymbols.includes(dayStock.symbol) ? 'Portföy takibinizde olduğu için karar sürecine hızlıca dahil edilebilir.' : 'Henüz kayıtlı değil; takip listesine alıp yakın izleme için uygun.');
    return reasons.slice(0, 3);
  }, [dayStock, predictions, registeredSymbols]);

  const sortedStocks = useMemo(() => {
    return [...stocks].sort((a, b) => {
      const aPinned = pinnedSymbols.includes(a.symbol) ? 1 : 0;
      const bPinned = pinnedSymbols.includes(b.symbol) ? 1 : 0;
      if (aPinned !== bPinned) return bPinned - aPinned;
      return a.symbol.localeCompare(b.symbol, 'tr');
    });
  }, [stocks, pinnedSymbols]);

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5" id="page-content" data-page="home">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <p className="text-xs font-black uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-1">Piyasa Özeti</p>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Ana Sayfa</h1>
          {lastUpdatedText && <p className="text-sm text-slate-500 dark:text-slate-400 font-semibold mt-2">Fiyat güncelleme: {lastUpdatedText}</p>}
        </div>
        <Link
          to="/portfolio"
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white font-black text-sm transition-colors"
        >
          Portföyüme Git
          <ArrowRight size={14} />
        </Link>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Yukselen</p>
          <p className="text-xl font-black text-green-600 mt-1">{marketSummary.advancing}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Dusen</p>
          <p className="text-xl font-black text-red-500 mt-1">{marketSummary.declining}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Ortalama %</p>
          <p className={`text-xl font-black mt-1 ${marketSummary.averageDailyChange >= 0 ? 'text-green-600' : 'text-red-500'}`}>
            {marketSummary.averageDailyChange >= 0 ? '+' : ''}%{marketSummary.averageDailyChange.toFixed(2)}
          </p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Piyasa Denge</p>
          <p className="text-xl font-black text-slate-800 dark:text-slate-200 mt-1">{marketSummary.flat}</p>
        </div>
      </div>

      {dayStock && (
        <div className="relative overflow-hidden bg-gradient-to-r from-blue-700 to-blue-900 rounded-2xl p-5 text-white">
          <div className="absolute -top-10 -right-10 w-40 h-40 rounded-full bg-white/10 blur-2xl pointer-events-none" />
          <p className="text-[11px] font-black uppercase tracking-widest text-blue-200 mb-1">Gunun One Cikan Hissesi</p>
          <div className="flex items-start justify-between gap-4 flex-wrap">
            <div>
              <h2 className="text-2xl font-black">{dayStock.symbol}</h2>
              <p className="text-blue-100 font-semibold text-sm">{dayStock.name}</p>
              <p className="text-blue-50 font-bold mt-2">{fmt(dayStock.price)} · %{dayStock.dailyChangePercent.toFixed(2)}</p>
            </div>
            <button
              onClick={async () => {
                const result = await onToggleRegisteredStock(dayStock.symbol);
                showFeedback(result.ok ? 'success' : 'error', result.message);
              }}
              className={`px-4 py-2 rounded-xl text-sm font-black transition-colors ${
                registeredSymbols.includes(dayStock.symbol)
                  ? 'bg-slate-900/20 hover:bg-slate-900/30 border border-white/40'
                  : 'bg-white text-blue-700 hover:bg-blue-100'
              }`}
            >
              {registeredSymbols.includes(dayStock.symbol) ? 'Kayıttan Çıkar' : 'Portföye Kaydet'}
            </button>
          </div>
          {dayStockReasons.length > 0 && (
            <div className="mt-4 bg-white/10 border border-white/20 rounded-xl p-3">
              <p className="text-[10px] uppercase tracking-widest font-black text-blue-100 mb-1">Neden Gunun Hissesi?</p>
              <ul className="space-y-1">
                {dayStockReasons.map((reason, idx) => (
                  <li key={`${dayStock.symbol}-reason-${idx}`} className="text-xs text-blue-50 font-medium">
                    • {reason}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      <div className="ai-glass ai-neon-border rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Genel Hisseler</p>
          <p className="text-xs font-bold text-slate-500 dark:text-slate-400">
            {registeredSymbols.length} kayıtlı · {pinnedSymbols.length} favori
          </p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
          {sortedStocks.map((stock) => {
            const pred = predictions[stock.symbol];
            const up = stock.dailyChangePercent >= 0;
            const TrendIcon = pred?.trend === 'Yukselis' ? TrendingUp : pred?.trend === 'Dusuk seyir' ? TrendingDown : Minus;
            const registered = registeredSymbols.includes(stock.symbol);
            const pinned = pinnedSymbols.includes(stock.symbol);
            return (
              <div key={stock.symbol} className="px-5 py-3.5 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                <Link
                  to={`/stock/${stock.symbol.toLowerCase()}`}
                  className="min-w-0 flex-1"
                  aria-label={
                    `${stock.name}, sembol ${stock.symbol}, fiyat ${fmt(stock.price)}, ` +
                    `gün içi yüzde ${Math.abs(stock.dailyChangePercent).toFixed(2)} ` +
                    `${up ? 'yükselişte' : 'düşüşte'}` +
                    (pred ? `, teknik tahmin ${pred.trend === 'Yukselis' ? 'yükseliş' : pred.trend === 'Dusuk seyir' ? 'düşüş' : 'yatay'} skor ${pred.score}` : '') +
                    (pinned ? ', favorilerde' : '') +
                    '. Detay sayfasını aç.'
                  }
                >
                  <p className="font-black text-sm text-slate-900 dark:text-white inline-flex items-center gap-1.5" aria-hidden="true">
                    {stock.symbol}
                    {pinned && <span className="text-[10px] px-1.5 py-0.5 rounded bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300">Favori</span>}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 truncate" aria-hidden="true">{stock.name}</p>
                  <div className="flex items-center gap-2 mt-1" aria-hidden="true">
                    <span className="font-black text-slate-800 dark:text-slate-100 text-sm">{fmt(stock.price)}</span>
                    <span className={`text-xs font-black ${up ? 'text-green-600' : 'text-red-500'}`}>
                      {up ? '+' : ''}%{stock.dailyChangePercent.toFixed(2)}
                    </span>
                    {pred && !predictLoading && (
                      <span className={`text-[10px] font-black inline-flex items-center gap-1 ${
                        pred.trend === 'Yukselis' ? 'text-green-600' : pred.trend === 'Dusuk seyir' ? 'text-red-500' : 'text-slate-400'
                      }`}>
                        <TrendIcon size={10} aria-hidden="true" />
                        {pred.score > 0 ? '+' : ''}{pred.score}
                      </span>
                    )}
                  </div>
                </Link>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const result = await onTogglePinnedStock(stock.symbol);
                      showFeedback(result.ok ? 'success' : 'error', result.message);
                    }}
                    className={`px-2.5 py-2 rounded-xl text-xs font-black border transition-colors inline-flex items-center gap-1 ${
                      pinned
                        ? 'text-amber-600 border-amber-200 dark:border-amber-800 hover:bg-amber-50 dark:hover:bg-amber-900/25'
                        : 'text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700'
                    }`}
                    aria-label={pinned ? `${stock.symbol} favorilerden çıkar` : `${stock.symbol} favorilere ekle`}
                    aria-pressed={pinned}
                    title={pinned ? 'Favoriden çıkar' : 'Favorilere ekle'}
                  >
                    {pinned ? <PinOff size={12} aria-hidden="true" /> : <Pin size={12} aria-hidden="true" />}
                  </button>
                  <button
                    onClick={async () => {
                      const result = await onToggleRegisteredStock(stock.symbol);
                      showFeedback(result.ok ? 'success' : 'error', result.message);
                    }}
                    aria-label={registered ? `${stock.symbol} kayıtlı hisselerden çıkar` : `${stock.symbol} kayıtlı hisselere ekle`}
                    className={`px-3 py-2 rounded-xl text-xs font-black border-2 transition-colors ${
                      registered
                        ? 'text-red-600 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/25'
                        : 'text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800 hover:bg-blue-50 dark:hover:bg-blue-900/25'
                    }`}
                  >
                    {registered ? 'Kaldır' : 'Kaydet'}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
        <div className="px-5 py-3 border-t border-slate-200 dark:border-slate-700 text-xs text-slate-500 dark:text-slate-400 font-semibold flex flex-wrap gap-x-4 gap-y-1">
          {marketSummary.best && <span>En iyi: {marketSummary.best.symbol} (%{marketSummary.best.dailyChangePercent.toFixed(2)})</span>}
          {marketSummary.worst && <span>En zayıf: {marketSummary.worst.symbol} (%{marketSummary.worst.dailyChangePercent.toFixed(2)})</span>}
        </div>
      </div>

      {feedback && (
        <div className={`px-4 py-3 rounded-xl text-sm font-bold border ${
          feedback.type === 'success'
            ? 'text-green-700 bg-green-50 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
            : 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
        }`}>
          {feedback.text}
        </div>
      )}
    </div>
  );
}
