import { Link } from 'react-router-dom';
import { FormEvent, useMemo, useState } from 'react';
import type { TechnicalPrediction } from '../../predictionEngine.ts';

type MarketStock = {
  symbol: string;
  name: string;
  price: number;
  dailyChangePercent: number;
  marketTag: string;
};

type Holding = {
  symbol: string;
  quantity: number;
  averageCost: number;
};

type DashboardProps = {
  cashBalance: number;
  holdings: Holding[];
  holdingsValue: number;
  totalBalance: number;
  stocks: MarketStock[];
  predictions: Record<string, TechnicalPrediction>;
  predictLoading: boolean;
  onBuyStock: (symbol: string, quantity: number) => { ok: boolean; message: string };
  onWithdrawCash: (amount: number) => { ok: boolean; message: string };
};

export default function Dashboard({
  cashBalance,
  holdings,
  holdingsValue,
  totalBalance,
  stocks,
  predictions,
  predictLoading,
  onBuyStock,
  onWithdrawCash,
}: DashboardProps) {
  const [selectedSymbol, setSelectedSymbol] = useState(stocks[0]?.symbol ?? '');
  const [lotInput, setLotInput] = useState('1');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  const holdingsCount = useMemo(
    () => holdings.reduce((total, holding) => total + holding.quantity, 0),
    [holdings],
  );

  function handleBuySubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const quantity = Number.parseInt(lotInput, 10);
    const result = onBuyStock(selectedSymbol, quantity);
    setFeedback({ type: result.ok ? 'success' : 'error', text: result.message });
  }

  function handleWithdrawSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const amount = Number(withdrawInput);
    const result = onWithdrawCash(amount);
    setFeedback({ type: result.ok ? 'success' : 'error', text: result.message });
    if (result.ok) {
      setWithdrawInput('');
    }
  }

  return (
    <div className="p-4 md:p-8 flex flex-col gap-8" id="main-content">
      {/* Header Section */}
      <header className="flex justify-between items-end">
        <div>
          <p className="text-slate-500 font-bold mb-1 uppercase tracking-tighter">Hoş geldiniz</p>
          <h1 className="text-5xl md:text-6xl font-black text-slate-900 leading-none tracking-tighter">Genel Bakış</h1>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
        <div className="col-span-1 md:col-span-2 bg-white border-4 border-slate-900 rounded-[32px] p-8 shadow-[12px_12px_0px_rgba(15,23,42,1)]">
          <div className="mb-12 flex justify-between items-start">
            <div>
              <p className="text-slate-400 font-bold uppercase text-xs tracking-widest">Toplam Bakiye</p>
              <h2 className="text-5xl md:text-7xl font-black tracking-tighter mt-2 truncate">
                {totalBalance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })}
              </h2>
              <p className="text-blue-600 font-bold text-lg mt-2">
                Nakit: {cashBalance.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })}
              </p>
            </div>
            
            <div className="hidden sm:block p-4 bg-slate-50 rounded-2xl border-2 border-slate-100 h-fit">
              <p className="text-xs font-black uppercase text-slate-400">Portföy</p>
              <p className="text-sm font-black text-slate-900 mt-1">{holdingsCount} lot</p>
              <p className="text-xs font-bold text-slate-500">
                Hisse Degeri: {holdingsValue.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })}
              </p>
            </div>
          </div>

          <div className="space-y-4">
            <p className="font-black text-xl mb-4 border-b-4 border-slate-900 inline-block tracking-tight">POPULER BIST HISSELERI</p>

            {stocks.map((stock) => (
              (() => {
                const prediction = predictions[stock.symbol];
                return (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol.toLowerCase()}`}
                    className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border-2 border-transparent hover:border-slate-900 outline-none focus:ring-4 focus:ring-blue-500 transition-all font-sans"
                  >
                    <div className="flex items-center gap-4">
                      <div className="w-12 h-12 bg-slate-200 rounded-full flex items-center justify-center font-bold text-slate-900">
                        {stock.symbol.slice(0, 3)}
                      </div>
                      <div>
                        <p className="font-bold text-slate-900">{stock.name} ({stock.symbol})</p>
                        <p className="text-xs font-bold text-slate-500 tracking-wider uppercase">{stock.marketTag}</p>
                        {predictLoading && !prediction ? (
                          <p className="text-xs font-bold text-slate-400 mt-1">Teknik tahmin yukleniyor...</p>
                        ) : prediction ? (
                          <p className="text-xs font-black text-blue-700 mt-1">
                            Teknik yon: {prediction.trend} · Skor {prediction.score} ({prediction.horizon})
                          </p>
                        ) : null}
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="font-black text-slate-900">
                        {stock.price.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })}
                      </p>
                      <p className={`font-black ${stock.dailyChangePercent >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                        {stock.dailyChangePercent >= 0 ? '+' : ''}
                        %{stock.dailyChangePercent.toFixed(2)}
                      </p>
                      {prediction && (
                        <p className="text-xs font-bold text-slate-600 mt-1">
                          Guven %{prediction.confidence} · Hedef:{' '}
                          {prediction.targetPrice.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 })}
                        </p>
                      )}
                    </div>
                  </Link>
                );
              })()
            ))}
          </div>
        </div>

        <div className="space-y-8">
          <div className="bg-blue-600 text-white rounded-[32px] p-8 border-4 border-slate-900 shadow-[8px_8px_0px_rgba(15,23,42,1)]">
            <h4 className="text-2xl font-black mb-4 leading-tight underline decoration-white decoration-4 underline-offset-4 tracking-tight">AI ÖNİZLEME</h4>
            <p className="text-blue-50 font-medium leading-relaxed">
               Asistanı açıp <span className="text-white font-bold underline">"Nakit akışım nasıl?"</span> veya <span className="text-white font-bold underline">"Borsada durum nedir?"</span> diyebilirsiniz. Finto o anki sayfayı okuyup analiz edecektir.
            </p>
          </div>

          <div className="bg-white rounded-[32px] p-8 border-4 border-slate-900">
            <p className="text-slate-400 font-bold uppercase text-xs tracking-widest mb-4">Hızlı Erişim</p>
            <form className="space-y-3 mb-4" onSubmit={handleWithdrawSubmit}>
              <input
                type="number"
                min="1"
                step="0.01"
                value={withdrawInput}
                onChange={(e) => setWithdrawInput(e.target.value)}
                placeholder="Cekilecek tutar (TL)"
                className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 font-semibold"
              />
              <button className="w-full py-3 bg-slate-900 hover:bg-slate-800 text-white rounded-2xl font-black text-lg tracking-tighter transition-colors">
                NAKIT CEK
              </button>
            </form>
            <form className="space-y-3" onSubmit={handleBuySubmit}>
              <select
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 font-semibold"
              >
                {stocks.map((stock) => (
                  <option key={stock.symbol} value={stock.symbol}>
                    {stock.symbol} - {stock.name}
                  </option>
                ))}
              </select>
              <input
                type="number"
                min="1"
                step="1"
                value={lotInput}
                onChange={(e) => setLotInput(e.target.value)}
                placeholder="Lot adedi"
                className="w-full rounded-xl border-2 border-slate-300 px-3 py-2 font-semibold"
              />
              <button className="w-full py-3 border-4 border-slate-900 hover:bg-slate-100 rounded-2xl font-black text-lg tracking-tighter text-slate-900 transition-colors">
                HISSE AL
              </button>
            </form>
            {feedback && (
              <p className={`mt-4 text-sm font-black ${feedback.type === 'success' ? 'text-green-700' : 'text-red-600'}`}>
                {feedback.text}
              </p>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
