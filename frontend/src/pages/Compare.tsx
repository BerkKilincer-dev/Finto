import { useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeft, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { TechnicalPrediction } from '../../../backend/predictionEngine.ts';
import type { MarketStock } from '../hooks/useStocksQuotes';
import { BIST_WATCHLIST } from '../data/bistWatchlist';

type Props = {
  stocks: MarketStock[];
  predictions: Record<string, TechnicalPrediction>;
  onRefreshPrediction: (symbol: string) => Promise<void>;
};

const fmt = (n: number) =>
  n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });

/**
 * İki seriyi aynı kutuya çizen mini SVG. Her seri kendi min/max'ine göre
 * normalize edilir (yüzde değişim karşılaştırması), böylece farklı fiyat
 * skalalarındaki hisseler eş düzlemde görünür.
 */
function DualSparkline({
  a,
  b,
  width = 320,
  height = 80,
}: {
  a: { values: number[]; color: string; label: string };
  b: { values: number[]; color: string; label: string };
  width?: number;
  height?: number;
}) {
  function lineFor(values: number[]) {
    if (values.length < 2) return '';
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = width / (values.length - 1);
    return values
      .map((v, i) => `${(i * stepX).toFixed(2)},${(height - ((v - min) / range) * height).toFixed(2)}`)
      .join(' ');
  }
  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      width="100%"
      height={height}
      role="img"
      aria-label={`${a.label} ve ${b.label} fiyat hareketleri (normalleştirilmiş)`}
      preserveAspectRatio="none"
    >
      <polyline points={lineFor(a.values)} fill="none" stroke={a.color} strokeWidth="2" strokeLinejoin="round" />
      <polyline points={lineFor(b.values)} fill="none" stroke={b.color} strokeWidth="2" strokeLinejoin="round" />
    </svg>
  );
}

function SymbolPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{label}</span>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-black text-slate-900 dark:text-white"
      >
        {BIST_WATCHLIST.map((s) => (
          <option key={s.symbol} value={s.symbol}>
            {s.symbol} — {s.name}
          </option>
        ))}
      </select>
    </label>
  );
}

export default function Compare({ stocks, predictions, onRefreshPrediction }: Props) {
  const [params, setParams] = useSearchParams();
  const aSym = (params.get('a') || 'GARAN').toUpperCase();
  const bSym = (params.get('b') || 'AKBNK').toUpperCase();

  const a = stocks.find((s) => s.symbol === aSym);
  const b = stocks.find((s) => s.symbol === bSym);
  const aPred = predictions[aSym];
  const bPred = predictions[bSym];

  // Eksik tahminleri arka planda iste — kullanıcı bekleyişe takılmasın.
  useEffect(() => {
    if (!aPred) void onRefreshPrediction(aSym);
    if (!bPred) void onRefreshPrediction(bSym);
  }, [aSym, bSym, aPred, bPred, onRefreshPrediction]);

  const winner = useMemo(() => {
    if (!aPred || !bPred) return null;
    if (Math.abs(aPred.score - bPred.score) < 5) return 'tied';
    return aPred.score > bPred.score ? aSym : bSym;
  }, [aPred, bPred, aSym, bSym]);

  function updateSym(slot: 'a' | 'b', v: string) {
    const next = new URLSearchParams(params);
    next.set(slot, v);
    setParams(next, { replace: true });
  }

  function CompareCard({
    stock,
    pred,
  }: {
    stock: MarketStock | undefined;
    pred: TechnicalPrediction | undefined;
  }) {
    if (!stock) {
      return (
        <div className="p-5 text-center text-slate-400 border border-slate-200 dark:border-slate-700 rounded-2xl">
          Hisse bulunamadı.
        </div>
      );
    }
    const TrendIcon = pred?.trend === 'Yukselis' ? TrendingUp : pred?.trend === 'Dusuk seyir' ? TrendingDown : Minus;
    const trendColor = pred?.trend === 'Yukselis' ? 'text-green-600' : pred?.trend === 'Dusuk seyir' ? 'text-red-500' : 'text-slate-500';
    const up = stock.dailyChangePercent >= 0;
    return (
      <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5 space-y-3">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">{stock.marketTag ?? 'BIST'}</p>
            <h2 className="text-2xl font-black text-slate-900 dark:text-white">{stock.symbol}</h2>
            <p className="text-sm text-slate-500 dark:text-slate-400">{stock.name}</p>
          </div>
          <Link
            to={`/stock/${stock.symbol.toLowerCase()}`}
            className="text-xs font-black text-blue-700 dark:text-blue-300 hover:underline"
          >
            Detay →
          </Link>
        </div>
        <div>
          <p className="text-2xl font-black text-slate-900 dark:text-white">{fmt(stock.price)}</p>
          <p className={`text-sm font-black ${up ? 'text-green-600' : 'text-red-500'}`}>
            {up ? '+' : ''}%{stock.dailyChangePercent.toFixed(2)} bugün
          </p>
        </div>
        {pred ? (
          <div className="space-y-1">
            <div className={`flex items-center gap-1.5 ${trendColor}`}>
              <TrendIcon size={18} aria-hidden="true" />
              <span className="font-black">{pred.trend}</span>
              <span className="text-xs font-bold text-slate-400">
                Skor {pred.score > 0 ? '+' : ''}{pred.score}
              </span>
            </div>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Hedef: {fmt(pred.targetPrice)} ({fmt(pred.targetPriceLow)} — {fmt(pred.targetPriceHigh)})
            </p>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              RSI: {pred.rsi14 !== null ? pred.rsi14.toFixed(1) : '—'} ·
              {' '}MACD: {pred.macdHistogram !== null ? pred.macdHistogram.toFixed(3) : '—'}
            </p>
          </div>
        ) : (
          <p className="text-xs text-slate-400">Tahmin yükleniyor...</p>
        )}
      </div>
    );
  }

  return (
    <div className="p-4 md:p-6 max-w-4xl mx-auto space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/" className="p-2 rounded-xl bg-slate-100 dark:bg-slate-700">
          <ArrowLeft size={16} aria-hidden="true" />
        </Link>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white">Hisse Karşılaştırma</h1>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <SymbolPicker label="Hisse A" value={aSym} onChange={(v) => updateSym('a', v)} />
        <SymbolPicker label="Hisse B" value={bSym} onChange={(v) => updateSym('b', v)} />
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <CompareCard stock={a} pred={aPred} />
        <CompareCard stock={b} pred={bPred} />
      </div>

      {aPred?.recentCloses && bPred?.recentCloses && (
        <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2">
            Son ~30 günlük fiyat hareketi (normalleştirilmiş)
          </p>
          <DualSparkline
            a={{ values: aPred.recentCloses, color: '#2563eb', label: aSym }}
            b={{ values: bPred.recentCloses, color: '#dc2626', label: bSym }}
          />
          <div className="flex gap-4 mt-2 text-xs">
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1 bg-blue-600" aria-hidden="true" />
              <span className="font-black">{aSym}</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="inline-block w-3 h-1 bg-red-600" aria-hidden="true" />
              <span className="font-black">{bSym}</span>
            </span>
          </div>
        </div>
      )}

      {winner && winner !== 'tied' && (
        <p className="text-sm font-bold text-center text-slate-700 dark:text-slate-300">
          Teknik skor karşılaştırması: <span className="text-blue-700 dark:text-blue-300 font-black">{winner}</span> şu an daha güçlü görünüyor.
          <span className="block text-xs text-slate-400 font-normal mt-1">
            Bu skor doğruluk garantisi değildir; gösterge tutarlılığını yansıtır.
          </span>
        </p>
      )}
      {winner === 'tied' && (
        <p className="text-sm font-bold text-center text-slate-500">
          İki hissenin teknik skoru birbirine yakın.
        </p>
      )}
    </div>
  );
}
