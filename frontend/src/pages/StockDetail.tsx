import { useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ArrowLeft, RefreshCw, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import type { TechnicalPrediction } from '../../../backend/predictionEngine.ts';

type MarketStock = {
  symbol: string;
  name: string;
  price: number;
  dailyChangePercent: number;
  marketTag: string;
  marketCap?: number;
  source?: string;
};

type StockDetailProps = {
  stocks: MarketStock[];
  predictions: Record<string, TechnicalPrediction>;
  predictLoading: boolean;
  onRefreshPrediction: (symbol: string) => Promise<void>;
};

const fmt = (n: number) =>
  n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });

export default function StockDetail({ stocks, predictions, predictLoading, onRefreshPrediction }: StockDetailProps) {
  const { symbol } = useParams();
  const symbolUpper = symbol?.toUpperCase() ?? '';
  const stock = stocks.find((s) => s.symbol === symbolUpper);
  const prediction = symbolUpper ? predictions[symbolUpper] : undefined;
  const [refreshBusy, setRefreshBusy] = useState(false);

  async function handleRefresh() {
    if (!symbolUpper) return;
    setRefreshBusy(true);
    try { await onRefreshPrediction(symbolUpper); }
    finally { setRefreshBusy(false); }
  }

  const up = (stock?.dailyChangePercent ?? 0) >= 0;
  const TrendIcon = prediction?.trend === 'Yukselis' ? TrendingUp : prediction?.trend === 'Dusuk seyir' ? TrendingDown : Minus;
  const trendColor = prediction?.trend === 'Yukselis' ? 'text-green-600' : prediction?.trend === 'Dusuk seyir' ? 'text-red-500' : 'text-slate-500';
  const labelCls = 'text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1';

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5" id="main-content">

      {/* Geri + başlık */}
      <div className="flex items-start gap-3">
        <Link to="/" className="mt-1 p-2 rounded-xl bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 transition-colors">
          <ArrowLeft size={16} className="text-slate-600 dark:text-slate-300" />
        </Link>
        <div>
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500">{stock?.marketTag ?? 'BIST'}</p>
          <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">{symbolUpper}</h1>
          <p className="text-slate-500 dark:text-slate-400 font-semibold text-sm mt-0.5">{stock?.name ?? 'Hisse bilgisi bulunamadı'}</p>
        </div>
      </div>

      {/* Fiyat + metrik kartları */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        {/* Fiyat — büyük kart */}
        <div className="col-span-2 md:col-span-1 bg-slate-900 dark:bg-slate-800 rounded-2xl p-5">
          <p className={`${labelCls} text-slate-500`}>Güncel Fiyat</p>
          <p className="text-3xl font-black text-white tracking-tight">
            {fmt(stock?.price ?? 0)}
          </p>
          <p className={`text-sm font-black mt-1 ${up ? 'text-green-400' : 'text-red-400'}`}>
            {up ? '+' : ''}%{(stock?.dailyChangePercent ?? 0).toFixed(2)} bugün
          </p>
        </div>

        {/* Piyasa Değeri */}
        <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <p className={labelCls}>Piyasa Değeri</p>
          {stock?.marketCap ? (
            <>
              <p className="text-xl font-black text-slate-900 dark:text-white">
                {(stock.marketCap / 1_000_000_000).toLocaleString('tr-TR', { maximumFractionDigits: 1 })}
                <span className="text-sm font-bold text-slate-400 ml-1">Milyar ₺</span>
              </p>
            </>
          ) : (
            <p className="text-xl font-black text-slate-300 dark:text-slate-600">—</p>
          )}
        </div>

        {/* Teknik Trend */}
        <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <p className={labelCls}>Teknik Görünüm</p>
          {prediction ? (
            <div className={`flex items-center gap-1.5 ${trendColor}`}>
              <TrendIcon size={20} />
              <p className="text-lg font-black">{prediction.trend}</p>
            </div>
          ) : (
            <p className="text-slate-300 dark:text-slate-600 font-black text-lg">—</p>
          )}
          {prediction && <p className="text-xs font-bold text-slate-400 mt-1">Skor: {prediction.score > 0 ? '+' : ''}{prediction.score} / 100</p>}
        </div>
      </div>

      {/* Teknik Analiz */}
      <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
          <div>
            <p className="font-black text-slate-900 dark:text-white">Teknik Analiz</p>
            <p className="text-xs text-slate-400 mt-0.5">SMA · RSI · Momentum · 3 aylık veri</p>
          </div>
          <button
            type="button"
            disabled={refreshBusy || predictLoading}
            onClick={() => void handleRefresh()}
            className="flex items-center gap-2 px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 disabled:opacity-50 rounded-xl font-black text-sm text-slate-700 dark:text-slate-200 transition-colors"
          >
            <RefreshCw size={14} className={refreshBusy ? 'animate-spin' : ''} />
            {refreshBusy ? 'Güncelleniyor' : 'Yenile'}
          </button>
        </div>

        {(predictLoading || refreshBusy) && !prediction ? (
          <div className="p-8 text-center">
            <div className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-2" />
            <p className="text-sm font-semibold text-slate-400">Tahmin hesaplanıyor...</p>
          </div>
        ) : prediction ? (
          <div className="p-5 space-y-5">
            {/* 4 metrik */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {[
                { label: 'Trend', value: prediction.trend, color: trendColor },
                { label: 'Teknik Skor', value: `${prediction.score > 0 ? '+' : ''}${prediction.score}`, sub: '-100 / +100' },
                { label: 'Hedef Fiyat', value: fmt(prediction.targetPrice) },
                { label: 'Güven', value: `%${prediction.confidence}` },
              ].map(({ label, value, sub, color }) => (
                <div key={label} className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                  <p className={labelCls}>{label}</p>
                  <p className={`text-lg font-black ${color ?? 'text-slate-900 dark:text-white'}`}>{value}</p>
                  {sub && <p className="text-[10px] text-slate-400 mt-0.5">{sub}</p>}
                </div>
              ))}
            </div>

            {/* Göstergeler + Özet */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4 space-y-2">
                <p className={labelCls}>Göstergeler</p>
                <div className="space-y-1.5 text-sm">
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">RSI (14)</span>
                    <span className="font-black text-slate-900 dark:text-white">
                      {prediction.rsi14 !== null ? prediction.rsi14.toFixed(1) : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Fiyat / SMA20</span>
                    <span className={`font-black ${(prediction.vsSma20Percent ?? 0) >= 0 ? 'text-green-600' : 'text-red-500'}`}>
                      {prediction.vsSma20Percent !== null ? `${prediction.vsSma20Percent >= 0 ? '+' : ''}%${prediction.vsSma20Percent.toFixed(2)}` : '—'}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span className="font-semibold text-slate-500 dark:text-slate-400">Ufuk</span>
                    <span className="font-black text-slate-900 dark:text-white">{prediction.horizon}</span>
                  </div>
                </div>
              </div>

              <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
                <p className={labelCls}>Sinyal Özeti</p>
                <p className="text-sm font-medium text-slate-700 dark:text-slate-300 leading-relaxed">{prediction.summary}</p>
              </div>
            </div>

            {/* Tetikleyiciler */}
            <div className="bg-slate-50 dark:bg-slate-700/50 rounded-xl p-4">
              <p className={`${labelCls} mb-2`}>Detaylı Tetikleyiciler</p>
              <ul className="space-y-1.5">
                {prediction.drivers.map((d, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm text-slate-700 dark:text-slate-300 font-medium">
                    <span className="text-blue-500 mt-0.5">·</span>
                    {d}
                  </li>
                ))}
              </ul>
            </div>

            <p className="text-[11px] text-slate-400 font-semibold">
              ⚠ Bu sonuçlar otomatik teknik kurallara dayanır; yatırım tavsiyesi değildir.
            </p>
          </div>
        ) : (
          <div className="p-8 text-center">
            <p className="text-sm font-bold text-red-500">Bu hisse için tahmin üretilemedi.</p>
          </div>
        )}
      </div>

      {/* Veri kaynağı */}
      {stock?.source && (
        <p className="text-[11px] text-slate-400 font-semibold">
          Kaynak: {stock.source}
        </p>
      )}
    </div>
  );
}
