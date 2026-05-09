import { useState } from 'react';
import { useParams } from 'react-router-dom';
import type { TechnicalPrediction } from '../../predictionEngine.ts';

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

export default function StockDetail({
  stocks,
  predictions,
  predictLoading,
  onRefreshPrediction,
}: StockDetailProps) {
  const { symbol } = useParams();
  const symbolUpper = symbol?.toUpperCase() ?? '';
  const stock = stocks.find((item) => item.symbol === symbolUpper);
  const prediction = symbolUpper ? predictions[symbolUpper] : undefined;
  const [refreshBusy, setRefreshBusy] = useState(false);

  async function handleRefresh() {
    if (!symbolUpper) return;
    setRefreshBusy(true);
    try {
      await onRefreshPrediction(symbolUpper);
    } finally {
      setRefreshBusy(false);
    }
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-8" id="main-content">
      <header className="flex justify-between items-end mb-4">
        <div>
          <p className="text-slate-500 font-bold mb-1 uppercase tracking-tighter">Piyasa Verileri</p>
          <h1 className="text-5xl md:text-6xl font-black text-slate-900 leading-none tracking-tighter">{symbolUpper}</h1>
          <p className="text-slate-600 font-bold mt-2">{stock?.name ?? 'Hisse bilgisi bulunamadi'}</p>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="bg-white p-8 rounded-[32px] border-4 border-slate-900 shadow-[8px_8px_0px_rgba(15,23,42,1)]">
          <h2 className="text-slate-400 font-bold uppercase text-xs tracking-widest mb-2">Günün Fiyatı</h2>
          <p className="text-5xl font-black tracking-tighter text-slate-900">
            {(stock?.price ?? 0).toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })}
          </p>
          <p className={`font-bold text-lg mt-2 ${(stock?.dailyChangePercent ?? 0) >= 0 ? 'text-green-600' : 'text-red-600'}`}>
            {(stock?.dailyChangePercent ?? 0) >= 0 ? '+' : ''} %{(stock?.dailyChangePercent ?? 0).toFixed(2)}
          </p>
        </div>

        <div className="bg-white p-8 rounded-[32px] border-4 border-slate-900 shadow-[8px_8px_0px_rgba(15,23,42,1)]">
          <h2 className="text-slate-400 font-bold uppercase text-xs tracking-widest mb-2">Piyasa Değeri</h2>
          <p className="text-5xl font-black tracking-tighter text-slate-900">
            {stock?.marketCap
              ? stock.marketCap.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 })
              : '-'}
          </p>
        </div>

        <div className="bg-white p-8 rounded-[32px] border-4 border-slate-900 shadow-[8px_8px_0px_rgba(15,23,42,1)]">
          <h2 className="text-slate-400 font-bold uppercase text-xs tracking-widest mb-2">Bilanço (Net Kar)</h2>
          <p className="text-5xl font-black tracking-tighter text-slate-900">1.2<span className="text-xl inline-block ml-1">Milyar ₺</span></p>
        </div>
      </div>

      {stock?.source && (
        <p className="text-xs font-bold text-slate-500 mt-2">
          Veri kaynagi: {stock.source}
        </p>
      )}

      <div className="bg-white p-8 rounded-[32px] border-4 border-slate-900 shadow-[8px_8px_0px_rgba(15,23,42,1)]">
        <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
          <div>
            <h3 className="text-2xl font-black tracking-tight">Teknik tahmin motoru</h3>
            <p className="text-slate-500 font-semibold">
              SMA + RSI + momentum skoru (3 aylik gunluk veri)
            </p>
          </div>
          <button
            type="button"
            disabled={refreshBusy || predictLoading}
            onClick={() => void handleRefresh()}
            className="py-3 px-5 bg-slate-900 hover:bg-slate-800 disabled:opacity-60 text-white rounded-2xl font-black tracking-tight"
          >
            {refreshBusy ? 'GUNCELLENIYOR...' : 'TAHMINI YENILE'}
          </button>
        </div>

        {(predictLoading || refreshBusy) && !prediction ? (
          <p className="mt-6 font-bold text-slate-500">Teknik tahmin yukleniyor...</p>
        ) : prediction ? (
          <>
            <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mt-6">
              <div className="rounded-2xl bg-slate-50 border-2 border-slate-200 p-4">
                <p className="text-xs font-black uppercase text-slate-400">Yon</p>
                <p
                  className={`text-2xl font-black mt-1 ${
                    prediction.trend === 'Yukselis'
                      ? 'text-green-700'
                      : prediction.trend === 'Dusuk seyir'
                        ? 'text-red-700'
                        : 'text-slate-700'
                  }`}
                >
                  {prediction.trend}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 border-2 border-slate-200 p-4">
                <p className="text-xs font-black uppercase text-slate-400">Teknik skor</p>
                <p className="text-2xl font-black mt-1 text-slate-900">{prediction.score}</p>
                <p className="text-xs text-slate-500 mt-1">-100 ile +100</p>
              </div>
              <div className="rounded-2xl bg-slate-50 border-2 border-slate-200 p-4">
                <p className="text-xs font-black uppercase text-slate-400">Hedef (model)</p>
                <p className="text-2xl font-black mt-1 text-slate-900">
                  {prediction.targetPrice.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })}
                </p>
              </div>
              <div className="rounded-2xl bg-slate-50 border-2 border-slate-200 p-4">
                <p className="text-xs font-black uppercase text-slate-400">Guven</p>
                <p className="text-2xl font-black mt-1 text-slate-900">%{prediction.confidence}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="rounded-2xl border-2 border-slate-200 p-4">
                <p className="text-xs font-black uppercase text-slate-400 mb-2">Gostergeler</p>
                <ul className="text-sm font-semibold text-slate-700 space-y-1">
                  <li>
                    RSI (14):{' '}
                    {prediction.rsi14 !== null ? prediction.rsi14.toFixed(1) : '—'}
                  </li>
                  <li>
                    Fiyat vs SMA20:{' '}
                    {prediction.vsSma20Percent !== null ? `%${prediction.vsSma20Percent.toFixed(2)}` : '—'}
                  </li>
                  <li>Ufuk: {prediction.horizon}</li>
                </ul>
              </div>
              <div className="rounded-2xl border-2 border-slate-200 p-4">
                <p className="text-xs font-black uppercase text-slate-400 mb-2">Sinyal ozeti</p>
                <p className="text-sm font-medium text-slate-800 leading-relaxed">{prediction.summary}</p>
              </div>
            </div>

            <div className="mt-6">
              <p className="text-xs font-black uppercase text-slate-400 mb-2">Detayli tetikleyiciler</p>
              <ul className="list-disc pl-5 space-y-2 text-slate-700 font-medium text-sm">
                {prediction.drivers.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>

            <p className="mt-4 text-xs font-bold text-slate-500 leading-relaxed">
              Uyari: Bu sonuclar otomatik teknik kurallara dayanir; yatirim tavsiyesi degildir. Gercek piyasa oynakligi farkli olabilir.
            </p>
          </>
        ) : (
          <p className="mt-6 font-bold text-red-600">Bu hisse icin teknik tahmin uretilemedi.</p>
        )}
      </div>

      <div className="mt-4 bg-blue-600 p-8 rounded-[32px] border-4 border-slate-900 shadow-[12px_12px_0px_rgba(15,23,42,1)] text-white">
        <h3 className="text-2xl font-black mb-4 leading-tight underline decoration-white decoration-4 underline-offset-4">Finto Yapay Zeka Özeti</h3>
        <p className="text-blue-50 font-medium leading-relaxed text-lg">
          {symbolUpper} sirketinin son ceyrek net kari beklentilerin uzerinde geldi.
          Piyasa koşulları ve son bilançolar baz alındığında teknik analizler kısa vadede pozitif bir görünüm sunuyor,
          ancak uzun vadeli yatırımcılar <span className="text-white font-bold underline">temettü verimliliğini</span> de göz önüne almalıdır.
        </p>
      </div>
    </div>
  );
}
