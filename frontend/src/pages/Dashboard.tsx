import { Link } from 'react-router-dom';
import { useEffect, useRef, useMemo, useState } from 'react';
import type { TechnicalPrediction } from '../../../backend/predictionEngine.ts';
import { Search, TrendingUp, TrendingDown, Minus, ArrowUpRight } from 'lucide-react';

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
  lastUpdated: Date | null;
  onBuyStock: (symbol: string, quantity: number) => { ok: boolean; message: string };
  onSellStock: (symbol: string, quantity: number) => { ok: boolean; message: string };
  onWithdrawCash: (amount: number) => { ok: boolean; message: string };
};

type ConfirmModal = {
  type: 'buy' | 'sell';
  symbol: string;
  quantity: number;
  totalTL: number;
};

const fmt = (n: number) =>
  n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });

export default function Dashboard({
  cashBalance,
  holdings,
  holdingsValue,
  totalBalance,
  stocks,
  predictions,
  predictLoading,
  lastUpdated,
  onBuyStock,
  onSellStock,
  onWithdrawCash,
}: DashboardProps) {
  const [selectedSymbol, setSelectedSymbol] = useState(stocks[0]?.symbol ?? '');
  const [lotInput, setLotInput] = useState('1');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  const [sellSymbol, setSellSymbol] = useState('');
  const [sellLotInput, setSellLotInput] = useState('1');
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  function showFeedback(type: 'success' | 'error', text: string) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ type, text });
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500);
  }

  useEffect(() => () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); }, []);

  const holdingsCount = useMemo(() => holdings.reduce((t, h) => t + h.quantity, 0), [holdings]);

  const totalPnl = useMemo(() => holdings.reduce((t, h) => {
    const stock = stocks.find((s) => s.symbol === h.symbol);
    return t + ((stock?.price ?? h.averageCost) - h.averageCost) * h.quantity;
  }, 0), [holdings, stocks]);

  const filteredStocks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return stocks;
    return stocks.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [stocks, searchQuery]);

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdated) return null;
    return lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdated]);

  function handleBuySubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const quantity = Number.parseInt(lotInput, 10);
    if (isNaN(quantity) || quantity <= 0) { showFeedback('error', 'Geçerli bir lot adedi girin.'); return; }
    const stock = stocks.find((s) => s.symbol === selectedSymbol);
    if (!stock) return;
    setConfirmModal({ type: 'buy', symbol: selectedSymbol, quantity, totalTL: stock.price * quantity });
  }

  function handleSellSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const sym = sellSymbol || holdings[0]?.symbol;
    const quantity = Number.parseInt(sellLotInput, 10);
    if (isNaN(quantity) || quantity <= 0) { showFeedback('error', 'Geçerli bir lot adedi girin.'); return; }
    const stock = stocks.find((s) => s.symbol === sym);
    if (!stock) return;
    setConfirmModal({ type: 'sell', symbol: sym, quantity, totalTL: stock.price * quantity });
  }

  function handleConfirm() {
    if (!confirmModal) return;
    const result = confirmModal.type === 'buy'
      ? onBuyStock(confirmModal.symbol, confirmModal.quantity)
      : onSellStock(confirmModal.symbol, confirmModal.quantity);
    showFeedback(result.ok ? 'success' : 'error', result.message);
    setConfirmModal(null);
  }

  function handleWithdrawSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const amount = Number(withdrawInput);
    if (isNaN(amount) || amount <= 0) { showFeedback('error', 'Geçerli bir tutar girin.'); return; }
    const result = onWithdrawCash(amount);
    showFeedback(result.ok ? 'success' : 'error', result.message);
    if (result.ok) setWithdrawInput('');
  }

  const inputCls = 'w-full rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2.5 font-semibold text-sm focus:outline-none focus:border-blue-500 transition-colors';
  const labelCls = 'text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-2 block';

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5" id="main-content">

      {/* Onay Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div className="bg-white dark:bg-slate-800 border-4 border-slate-900 dark:border-slate-600 rounded-3xl p-7 w-full max-w-sm shadow-2xl">
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">
              {confirmModal.type === 'buy' ? 'Alım Onayı' : 'Satış Onayı'}
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4">
              {confirmModal.symbol}
            </h3>
            <div className="bg-slate-50 dark:bg-slate-700 rounded-2xl p-4 mb-5 space-y-1">
              <div className="flex justify-between text-sm font-semibold text-slate-600 dark:text-slate-300">
                <span>Miktar</span><span className="font-black text-slate-900 dark:text-white">{confirmModal.quantity} lot</span>
              </div>
              <div className="flex justify-between text-sm font-semibold text-slate-600 dark:text-slate-300">
                <span>Toplam</span>
                <span className={`font-black ${confirmModal.type === 'buy' ? 'text-red-600' : 'text-green-600'}`}>
                  {fmt(confirmModal.totalTL)}
                </span>
              </div>
            </div>
            <div className="flex gap-3">
              <button onClick={() => setConfirmModal(null)}
                className="flex-1 py-3 rounded-2xl font-black text-slate-600 dark:text-slate-300 border-2 border-slate-200 dark:border-slate-600 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm">
                İptal
              </button>
              <button onClick={handleConfirm}
                className={`flex-1 py-3 rounded-2xl font-black text-white text-sm transition-colors ${confirmModal.type === 'buy' ? 'bg-blue-600 hover:bg-blue-700' : 'bg-red-500 hover:bg-red-600'}`}>
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sayfa başlığı */}
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Genel Bakış</p>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Portföyüm</h1>
      </div>

      {/* Üst stat kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2 bg-slate-900 dark:bg-slate-800 rounded-2xl p-5">
          <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">Toplam Bakiye</p>
          <p className="text-3xl md:text-4xl font-black text-white tracking-tight">{fmt(totalBalance)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <p className={labelCls}>Nakit</p>
          <p className="text-xl font-black text-blue-600 dark:text-blue-400">{fmt(cashBalance)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5">
          <p className={labelCls}>Hisse Değeri</p>
          <p className="text-xl font-black text-slate-900 dark:text-white">{fmt(holdingsValue)}</p>
          {holdingsCount > 0 && (
            <p className={`text-xs font-black mt-1 ${totalPnl >= 0 ? 'text-green-600' : 'text-red-500'}`}>
              {totalPnl >= 0 ? '+' : ''}{fmt(totalPnl)}
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">

        {/* Sol — Pozisyonlar + Piyasa */}
        <div className="lg:col-span-2 flex flex-col gap-5">

          {/* Pozisyonlarım */}
          {holdings.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">Pozisyonlarım · {holdingsCount} lot</p>
              </div>
              <div className="divide-y divide-slate-50 dark:divide-slate-700">
                {holdings.map((holding) => {
                  const stock = stocks.find((s) => s.symbol === holding.symbol);
                  const cur = stock?.price ?? holding.averageCost;
                  const pnlTL = (cur - holding.averageCost) * holding.quantity;
                  const pnlPct = ((cur - holding.averageCost) / holding.averageCost) * 100;
                  const up = pnlTL >= 0;
                  return (
                    <div key={holding.symbol} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-black text-xs text-slate-700 dark:text-slate-200">
                          {holding.symbol.slice(0, 4)}
                        </div>
                        <div>
                          <p className="font-black text-sm text-slate-900 dark:text-white">{holding.symbol}</p>
                          <p className="text-xs text-slate-400">{holding.quantity} lot · {fmt(holding.averageCost)}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <p className="font-black text-sm text-slate-900 dark:text-white">{fmt(cur)}</p>
                          <p className={`text-xs font-black ${up ? 'text-green-600' : 'text-red-500'}`}>
                            {up ? '+' : ''}{fmt(pnlTL)} ({up ? '+' : ''}{pnlPct.toFixed(2)}%)
                          </p>
                        </div>
                        <button
                          onClick={() => { setSellSymbol(holding.symbol); setSellLotInput('1'); }}
                          className="px-3 py-1.5 text-xs font-black text-red-600 border-2 border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors"
                        >
                          SAT
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Piyasa listesi */}
          <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-400">BIST Hisseleri</p>
              {lastUpdatedText && (
                <p className="text-[10px] font-bold text-slate-400">⟳ {lastUpdatedText}</p>
              )}
            </div>

            <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-700">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Sembol veya isim ara..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-200 dark:border-slate-600 bg-slate-50 dark:bg-slate-700/50 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-400 transition-colors"
                />
              </div>
            </div>

            <div className="divide-y divide-slate-50 dark:divide-slate-700/50 max-h-[500px] overflow-y-auto">
              {filteredStocks.length === 0 && (
                <p className="text-center text-slate-400 text-sm font-semibold py-8">Hisse bulunamadı.</p>
              )}
              {filteredStocks.map((stock) => {
                const pred = predictions[stock.symbol];
                const up = stock.dailyChangePercent >= 0;
                const TrendIcon = pred?.trend === 'Yukselis' ? TrendingUp : pred?.trend === 'Dusuk seyir' ? TrendingDown : Minus;
                return (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol.toLowerCase()}`}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-700/50 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center font-black text-[10px] text-slate-700 dark:text-slate-200 flex-shrink-0">
                        {stock.symbol.slice(0, 4)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{stock.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-black text-slate-400 uppercase">{stock.symbol}</span>
                          {!predictLoading && pred && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-black ${pred.trend === 'Yukselis' ? 'text-green-600' : pred.trend === 'Dusuk seyir' ? 'text-red-500' : 'text-slate-400'}`}>
                              <TrendIcon size={10} />
                              {pred.trend} {pred.score > 0 ? '+' : ''}{pred.score}
                            </span>
                          )}
                          {predictLoading && !pred && <span className="text-[10px] text-slate-300">yükleniyor...</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4">
                      <p className="font-black text-sm text-slate-900 dark:text-white">{fmt(stock.price)}</p>
                      <p className={`text-xs font-black ${up ? 'text-green-600' : 'text-red-500'}`}>
                        {up ? '+' : ''}%{stock.dailyChangePercent.toFixed(2)}
                      </p>
                    </div>
                    <ArrowUpRight size={14} className="ml-2 text-slate-300 group-hover:text-slate-600 dark:group-hover:text-slate-300 flex-shrink-0 transition-colors" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sağ — İşlemler */}
        <div className="flex flex-col gap-4">

          {/* Hisse Al */}
          <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5">
            <p className={labelCls}>Hisse Al</p>
            <form className="space-y-2.5" onSubmit={handleBuySubmit}>
              <select value={selectedSymbol} onChange={(e) => setSelectedSymbol(e.target.value)} className={inputCls}>
                {stocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>
                ))}
              </select>
              <input type="number" min="1" step="1" value={lotInput} onChange={(e) => setLotInput(e.target.value)} placeholder="Lot adedi" className={inputCls} />
              <button className="w-full py-2.5 bg-blue-600 hover:bg-blue-700 text-white rounded-xl font-black text-sm transition-colors">
                Satın Al
              </button>
            </form>
          </div>

          {/* Hisse Sat */}
          {holdings.length > 0 && (
            <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5">
              <p className={labelCls}>Hisse Sat</p>
              <form className="space-y-2.5" onSubmit={handleSellSubmit}>
                <select value={sellSymbol || holdings[0]?.symbol} onChange={(e) => setSellSymbol(e.target.value)} className={inputCls}>
                  {holdings.map((h) => (
                    <option key={h.symbol} value={h.symbol}>{h.symbol} — {h.quantity} lot</option>
                  ))}
                </select>
                <input type="number" min="1" step="1" value={sellLotInput} onChange={(e) => setSellLotInput(e.target.value)} placeholder="Lot adedi" className={inputCls} />
                <button className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black text-sm transition-colors">
                  Sat
                </button>
              </form>
            </div>
          )}

          {/* Nakit Çek */}
          <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-5">
            <p className={labelCls}>Nakit Çek</p>
            <form className="space-y-2.5" onSubmit={handleWithdrawSubmit}>
              <input type="number" min="1" step="0.01" value={withdrawInput} onChange={(e) => setWithdrawInput(e.target.value)} placeholder="Tutar (TL)" className={inputCls} />
              <button className="w-full py-2.5 bg-slate-800 dark:bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-black text-sm transition-colors">
                Çek
              </button>
            </form>
          </div>

          {/* AI Asistan kartı */}
          <div className="bg-gradient-to-br from-blue-600 to-blue-700 rounded-2xl p-5 text-white">
            <p className="text-[11px] font-black uppercase tracking-widest text-blue-200 mb-2">AI Asistan</p>
            <p className="text-sm font-semibold text-blue-50 leading-relaxed">
              Mavi butona tıklayın, <span className="text-white font-bold">"Portföyüm nasıl?"</span> gibi sorular sorun.
            </p>
          </div>

          {/* Feedback */}
          {feedback && (
            <div className={`px-4 py-3 rounded-xl text-sm font-bold border ${feedback.type === 'success' ? 'text-green-700 bg-green-50 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800' : 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'}`}>
              {feedback.text}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
