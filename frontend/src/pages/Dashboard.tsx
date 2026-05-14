import { Link } from 'react-router-dom';
import { useEffect, useRef, useMemo, useState } from 'react';
import type { TechnicalPrediction } from '../../../backend/predictionEngine.ts';
import { Search, TrendingUp, TrendingDown, Minus, ArrowUpRight } from 'lucide-react';
import { useAnnouncer } from '../hooks/useAnnouncer.tsx';
import { APP_EVENTS } from '../hooks/appEvents';

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
  allStocks: MarketStock[];
  registeredSymbols: string[];
  predictions: Record<string, TechnicalPrediction>;
  predictLoading: boolean;
  /** Teknik tahminlerin son güncellenme zamanı */
  predictUpdatedAt: Date | null;
  lastUpdated: Date | null;
  /** Yahoo / API erişilemediğinde kısa uyarı */
  marketDataWarning: string | null;
  onBuyStock: (symbol: string, quantity: number) => Promise<{ ok: boolean; message: string }>;
  onSellStock: (symbol: string, quantity: number) => Promise<{ ok: boolean; message: string }>;
  onDepositCash: (amount: number) => Promise<{ ok: boolean; message: string }>;
  onWithdrawCash: (amount: number) => Promise<{ ok: boolean; message: string }>;
};

type SortMode = 'score' | 'change' | 'symbol' | 'name';

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
  allStocks,
  registeredSymbols,
  predictions,
  predictLoading,
  predictUpdatedAt,
  lastUpdated,
  marketDataWarning,
  onBuyStock,
  onSellStock,
  onDepositCash,
  onWithdrawCash,
}: DashboardProps) {
  const [selectedSymbol, setSelectedSymbol] = useState(stocks[0]?.symbol ?? '');
  const [sortBy, setSortBy] = useState<SortMode>('score');
  const [lotInput, setLotInput] = useState('1');
  const [depositInput, setDepositInput] = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [confirmModal, setConfirmModal] = useState<ConfirmModal | null>(null);
  const [sellSymbol, setSellSymbol] = useState('');
  const [sellLotInput, setSellLotInput] = useState('1');
  const [buyError, setBuyError] = useState<string | null>(null);
  const [sellError, setSellError] = useState<string | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const confirmDialogRef = useRef<HTMLDivElement | null>(null);
  const confirmCancelButtonRef = useRef<HTMLButtonElement | null>(null);
  const lastFocusedBeforeConfirmRef = useRef<HTMLElement | null>(null);
  const buySymbolSelectRef = useRef<HTMLSelectElement | null>(null);
  const sellSymbolSelectRef = useRef<HTMLSelectElement | null>(null);

  const { announce } = useAnnouncer();

  function showFeedback(type: 'success' | 'error', text: string) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ type, text });
    announce(text, type === 'error' ? 'assertive' : 'polite');
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3500);
  }

  useEffect(() => () => { if (feedbackTimer.current) clearTimeout(feedbackTimer.current); }, []);

  useEffect(() => {
    function onLayerCloseTop() {
      if (confirmModal) setConfirmModal(null);
    }
    window.addEventListener(APP_EVENTS.layerCloseTop, onLayerCloseTop);
    return () => window.removeEventListener(APP_EVENTS.layerCloseTop, onLayerCloseTop);
  }, [confirmModal]);

  useEffect(() => {
    if (!selectedSymbol && stocks[0]?.symbol) setSelectedSymbol(stocks[0].symbol);
  }, [stocks, selectedSymbol]);

  const holdingsCount = useMemo(() => holdings.reduce((t, h) => t + h.quantity, 0), [holdings]);

  const totalPnl = useMemo(() => holdings.reduce((t, h) => {
    const stock = allStocks.find((s) => s.symbol === h.symbol);
    return t + ((stock?.price ?? h.averageCost) - h.averageCost) * h.quantity;
  }, 0), [holdings, allStocks]);

  const filteredStocks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return stocks;
    return stocks.filter((s) => s.symbol.toLowerCase().includes(q) || s.name.toLowerCase().includes(q));
  }, [stocks, searchQuery]);

  const sortedStocks = useMemo(() => {
    const arr = [...filteredStocks];
    const scoreOf = (sym: string) => predictions[sym]?.score ?? -Infinity;
    switch (sortBy) {
      case 'score':
        return arr.sort((a, b) => scoreOf(b.symbol) - scoreOf(a.symbol));
      case 'change':
        return arr.sort((a, b) => b.dailyChangePercent - a.dailyChangePercent);
      case 'symbol':
        return arr.sort((a, b) => a.symbol.localeCompare(b.symbol, 'tr'));
      case 'name':
        return arr.sort((a, b) => a.name.localeCompare(b.name, 'tr'));
      default:
        return arr;
    }
  }, [filteredStocks, sortBy, predictions]);

  const lastUpdatedText = useMemo(() => {
    if (!lastUpdated) return null;
    return lastUpdated.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [lastUpdated]);

  const predictUpdatedText = useMemo(() => {
    if (!predictUpdatedAt) return null;
    return predictUpdatedAt.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }, [predictUpdatedAt]);

  function handleBuySubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const quantity = Number.parseInt(lotInput, 10);
    if (isNaN(quantity) || quantity <= 0) {
      const message = 'Geçerli bir lot adedi girin.';
      setBuyError(message);
      showFeedback('error', message);
      return;
    }
    setBuyError(null);
    const stock = stocks.find((s) => s.symbol === selectedSymbol);
    if (!stock) return;
    lastFocusedBeforeConfirmRef.current = document.activeElement as HTMLElement | null;
    setConfirmModal({ type: 'buy', symbol: selectedSymbol, quantity, totalTL: stock.price * quantity });
    announce(`${selectedSymbol} için alım onayı açıldı.`, 'polite');
  }

  function handleSellSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const sym = sellSymbol || holdings[0]?.symbol;
    const quantity = Number.parseInt(sellLotInput, 10);
    if (isNaN(quantity) || quantity <= 0) {
      const message = 'Geçerli bir lot adedi girin.';
      setSellError(message);
      showFeedback('error', message);
      return;
    }
    setSellError(null);
    const stock = allStocks.find((s) => s.symbol === sym);
    if (!stock) return;
    lastFocusedBeforeConfirmRef.current = document.activeElement as HTMLElement | null;
    setConfirmModal({ type: 'sell', symbol: sym, quantity, totalTL: stock.price * quantity });
    announce(`${sym} için satış onayı açıldı.`, 'polite');
  }

  async function handleConfirm() {
    if (!confirmModal) return;
    const result = await (confirmModal.type === 'buy'
      ? onBuyStock(confirmModal.symbol, confirmModal.quantity)
      : onSellStock(confirmModal.symbol, confirmModal.quantity));
    showFeedback(result.ok ? 'success' : 'error', result.message);
    setConfirmModal(null);
    lastFocusedBeforeConfirmRef.current?.focus?.();
  }

  async function handleDepositSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const amount = Number(depositInput);
    if (isNaN(amount) || amount <= 0) {
      const message = 'Geçerli bir tutar girin.';
      setDepositError(message);
      showFeedback('error', message);
      return;
    }
    setDepositError(null);
    const result = await onDepositCash(amount);
    showFeedback(result.ok ? 'success' : 'error', result.message);
    if (result.ok) setDepositInput('');
  }

  async function handleWithdrawSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const amount = Number(withdrawInput);
    if (isNaN(amount) || amount <= 0) {
      const message = 'Geçerli bir tutar girin.';
      setWithdrawError(message);
      showFeedback('error', message);
      return;
    }
    setWithdrawError(null);
    const result = await onWithdrawCash(amount);
    showFeedback(result.ok ? 'success' : 'error', result.message);
    if (result.ok) setWithdrawInput('');
  }

  useEffect(() => {
    if (!confirmModal) return;
    confirmCancelButtonRef.current?.focus();
    const dialog = confirmDialogRef.current;
    if (!dialog) return;
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        setConfirmModal(null);
        lastFocusedBeforeConfirmRef.current?.focus?.();
        return;
      }
      if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        e.preventDefault();
        void handleConfirm();
        return;
      }
      if (e.key !== 'Tab' || focusables.length === 0) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [confirmModal]);

  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if (e.altKey && e.key.toLowerCase() === 'b') {
        e.preventDefault();
        buySymbolSelectRef.current?.focus();
        announce('Hisse al bölümüne odaklandı.', 'polite');
      }
      if (e.altKey && e.key.toLowerCase() === 's') {
        e.preventDefault();
        sellSymbolSelectRef.current?.focus();
        announce('Hisse sat bölümüne odaklandı.', 'polite');
      }
    }
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [announce]);

  const inputCls = 'w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-white px-3 py-2.5 font-semibold text-sm focus:outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-500/20 transition-colors';
  const labelCls = 'text-[11px] font-black uppercase tracking-widest text-slate-500 dark:text-slate-400 mb-2 block';

  return (
    <div className="p-4 md:p-6 flex flex-col gap-5" id="page-content" data-page="portfolio">

      {/* Onay Modal */}
      {confirmModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
          <div
            ref={confirmDialogRef}
            role="dialog"
            aria-modal="true"
            aria-label={confirmModal.type === 'buy' ? 'Alım onayı' : 'Satış onayı'}
            aria-describedby="confirm-modal-desc"
            className="ai-glass ai-neon-border rounded-3xl p-7 w-full max-w-sm shadow-2xl"
          >
            <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 mb-1">
              {confirmModal.type === 'buy' ? 'Alım Onayı' : 'Satış Onayı'}
            </p>
            <h3 className="text-2xl font-black text-slate-900 dark:text-white mb-4">
              {confirmModal.symbol}
            </h3>
            <div id="confirm-modal-desc" className="bg-slate-50 dark:bg-slate-800 rounded-2xl p-4 mb-5 space-y-1">
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
              <button
                ref={confirmCancelButtonRef}
                onClick={() => {
                  setConfirmModal(null);
                  lastFocusedBeforeConfirmRef.current?.focus?.();
                }}
                className="flex-1 py-3 rounded-2xl font-black text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors text-sm">
                İptal
              </button>
              <button onClick={handleConfirm}
                className={`flex-1 py-3 rounded-2xl font-black text-white text-sm transition-colors ${confirmModal.type === 'buy' ? 'bg-blue-700 hover:bg-blue-800' : 'bg-red-500 hover:bg-red-600'}`}>
                Onayla
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Sayfa başlığı */}
      <div>
        <p className="text-xs font-black uppercase tracking-widest text-blue-700 dark:text-blue-300 mb-1">Genel Bakış</p>
        <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Portföyüm</h1>
        {marketDataWarning && (
          <div className="mt-3 px-4 py-3 rounded-xl bg-amber-50 dark:bg-amber-950/40 border-2 border-amber-200 dark:border-amber-800 text-amber-900 dark:text-amber-100 text-sm font-semibold">
            {marketDataWarning}
          </div>
        )}
        <p className="text-sm text-slate-500 dark:text-slate-400 mt-2 font-semibold">
          Kayıtlı hisseler: <span className="font-black text-slate-800 dark:text-slate-200">{registeredSymbols.length}</span>
        </p>
      </div>

      {/* Üst stat kartları */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="col-span-2 rounded-2xl p-5 bg-blue-900">
          <p className="text-[11px] font-black uppercase tracking-widest text-blue-200 mb-1">Toplam Bakiye</p>
          <p className="text-3xl md:text-4xl font-black text-white tracking-tight">{fmt(totalBalance)}</p>
        </div>
        <div className="ai-glass ai-neon-border rounded-2xl p-5">
          <p className={labelCls}>Nakit</p>
          <p className="text-xl font-black text-blue-700 dark:text-blue-300">{fmt(cashBalance)}</p>
        </div>
        <div className="ai-glass ai-neon-border rounded-2xl p-5">
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
            <div className="ai-glass ai-neon-border rounded-2xl overflow-hidden">
              <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700">
                <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Pozisyonlarım · {holdingsCount} lot</p>
              </div>
              <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {holdings.map((holding) => {
                  const stock = allStocks.find((s) => s.symbol === holding.symbol);
                  const cur = stock?.price ?? holding.averageCost;
                  const pnlTL = (cur - holding.averageCost) * holding.quantity;
                  const pnlPct = ((cur - holding.averageCost) / holding.averageCost) * 100;
                  const up = pnlTL >= 0;
                  return (
                    <div key={holding.symbol} className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center font-black text-xs text-blue-800 dark:text-blue-200">
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
                          className="px-3 py-1.5 text-xs font-black text-red-600 border border-red-200 dark:border-red-800 hover:bg-red-50 dark:hover:bg-red-900/30 rounded-xl transition-colors"
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

          {/* Kayıtlı hisse listesi */}
          <div className="ai-glass ai-neon-border rounded-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-[11px] font-black uppercase tracking-widest text-slate-500">Kayıtlı Hisseler</p>
              <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-[10px] font-bold text-slate-500 dark:text-slate-400">
                {lastUpdatedText && <span>Fiyat ⟳ {lastUpdatedText}</span>}
                {predictUpdatedText && <span>Tahmin ⟳ {predictUpdatedText}</span>}
              </div>
            </div>

            <div className="px-5 py-3 border-b border-slate-200 dark:border-slate-700 flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <label htmlFor="stock-search" className="sr-only">Kayıtlı hisse ara</label>
                <Search size={14} aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input
                  id="stock-search"
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Kayıtlı hisse ara..."
                  className="w-full pl-8 pr-3 py-2 rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm text-slate-900 dark:text-white placeholder:text-slate-400 focus:outline-none focus:border-blue-500 transition-colors"
                />
              </div>
              <label className="flex items-center gap-2 text-xs font-bold text-slate-500 dark:text-slate-400 whitespace-nowrap">
                <span>Sırala</span>
                <select
                  value={sortBy}
                  onChange={(e) => setSortBy(e.target.value as SortMode)}
                  className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-2 font-semibold text-slate-900 dark:text-white text-xs"
                >
                  <option value="score">Teknik skor (yüksek)</option>
                  <option value="change">Günlük % (yüksek)</option>
                  <option value="symbol">Sembol (A-Z)</option>
                  <option value="name">Şirket adı</option>
                </select>
              </label>
            </div>

            <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
              {sortedStocks.length === 0 && (
                <p className="text-center text-slate-400 text-sm font-semibold py-8">Kayıtlı hisse bulunamadı. Ana sayfadan hisse kaydedin.</p>
              )}
              {sortedStocks.map((stock) => {
                const pred = predictions[stock.symbol];
                const up = stock.dailyChangePercent >= 0;
                const TrendIcon = pred?.trend === 'Yukselis' ? TrendingUp : pred?.trend === 'Dusuk seyir' ? TrendingDown : Minus;
                const rowAria =
                  `${stock.name}, sembol ${stock.symbol}, fiyat ${fmt(stock.price)}, ` +
                  `gün içi yüzde ${Math.abs(stock.dailyChangePercent).toFixed(2)} ${up ? 'yükselişte' : 'düşüşte'}` +
                  (pred ? `, teknik tahmin ${pred.trend === 'Yukselis' ? 'yükseliş' : pred.trend === 'Dusuk seyir' ? 'düşüş' : 'yatay'} skor ${pred.score}` : '') +
                  '. Detay sayfasını aç.';
                return (
                  <Link
                    key={stock.symbol}
                    to={`/stock/${stock.symbol.toLowerCase()}`}
                    aria-label={rowAria}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-slate-50 dark:hover:bg-slate-800/60 transition-colors group"
                  >
                    <div className="flex items-center gap-3 min-w-0" aria-hidden="true">
                      <div className="w-9 h-9 rounded-xl bg-blue-100 dark:bg-blue-900/40 flex items-center justify-center font-black text-[10px] text-blue-800 dark:text-blue-200 flex-shrink-0">
                        {stock.symbol.slice(0, 4)}
                      </div>
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-slate-900 dark:text-white truncate">{stock.name}</p>
                        <div className="flex items-center gap-2 mt-0.5">
                          <span className="text-[10px] font-black text-slate-400 uppercase">{stock.symbol}</span>
                          {!predictLoading && pred && (
                            <span className={`flex items-center gap-0.5 text-[10px] font-black ${pred.trend === 'Yukselis' ? 'text-green-600' : pred.trend === 'Dusuk seyir' ? 'text-red-500' : 'text-slate-400'}`}>
                              <TrendIcon size={10} aria-hidden="true" />
                              {pred.trend} {pred.score > 0 ? '+' : ''}{pred.score}
                            </span>
                          )}
                          {predictLoading && !pred && <span className="text-[10px] text-slate-300">yükleniyor...</span>}
                        </div>
                      </div>
                    </div>
                    <div className="text-right flex-shrink-0 ml-4" aria-hidden="true">
                      <p className="font-black text-sm text-slate-900 dark:text-white">{fmt(stock.price)}</p>
                      <p className={`text-xs font-black ${up ? 'text-green-600' : 'text-red-500'}`}>
                        {up ? '+' : ''}%{stock.dailyChangePercent.toFixed(2)}
                      </p>
                    </div>
                    <ArrowUpRight size={14} aria-hidden="true" className="ml-2 text-slate-300 group-hover:text-slate-600 dark:group-hover:text-slate-300 flex-shrink-0 transition-colors" />
                  </Link>
                );
              })}
            </div>
          </div>
        </div>

        {/* Sağ — İşlemler */}
        <div className="flex flex-col gap-4">

          {/* Hisse Al */}
          <section aria-labelledby="buy-section-title" className="ai-glass ai-neon-border rounded-2xl p-5">
            <h2 id="buy-section-title" className={labelCls}>Hisse Al</h2>
            <form className="space-y-2.5" onSubmit={handleBuySubmit} aria-describedby="buy-section-title">
              <label htmlFor="buy-symbol" className="sr-only">Hisse seç</label>
              <select
                ref={buySymbolSelectRef}
                id="buy-symbol"
                value={selectedSymbol}
                onChange={(e) => setSelectedSymbol(e.target.value)}
                className={inputCls}
              >
                {stocks.map((s) => (
                  <option key={s.symbol} value={s.symbol}>{s.symbol} — {s.name}</option>
                ))}
              </select>
              <label htmlFor="buy-lot" className="sr-only">Lot adedi</label>
              <input
                id="buy-lot"
                type="number"
                min="1"
                step="1"
                value={lotInput}
                onChange={(e) => setLotInput(e.target.value)}
                placeholder="Lot adedi"
                className={inputCls}
                aria-invalid={!!buyError}
                aria-describedby={buyError ? 'buy-error' : undefined}
              />
              {buyError && <p id="buy-error" className="text-xs font-bold text-red-600 dark:text-red-400">{buyError}</p>}
              <button
                disabled={stocks.length === 0}
                className="w-full py-2.5 bg-blue-700 hover:bg-blue-800 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-xl font-black text-sm transition-colors"
              >
                Satın Al
              </button>
            </form>
            {stocks.length === 0 && (
              <p className="text-xs text-slate-400 font-semibold mt-2">Alım için önce ana sayfadan hisse kaydedin.</p>
            )}
          </section>

          {/* Hisse Sat */}
          {holdings.length > 0 && (
            <section aria-labelledby="sell-section-title" className="ai-glass ai-neon-border rounded-2xl p-5">
              <h2 id="sell-section-title" className={labelCls}>Hisse Sat</h2>
              <form className="space-y-2.5" onSubmit={handleSellSubmit}>
                <label htmlFor="sell-symbol" className="sr-only">Satılacak hisse</label>
                <select
                  ref={sellSymbolSelectRef}
                  id="sell-symbol"
                  value={sellSymbol || holdings[0]?.symbol}
                  onChange={(e) => setSellSymbol(e.target.value)}
                  className={inputCls}
                >
                  {holdings.map((h) => (
                    <option key={h.symbol} value={h.symbol}>{h.symbol} — {h.quantity} lot</option>
                  ))}
                </select>
                <label htmlFor="sell-lot" className="sr-only">Satılacak lot adedi</label>
                <input
                  id="sell-lot"
                  type="number"
                  min="1"
                  step="1"
                  value={sellLotInput}
                  onChange={(e) => setSellLotInput(e.target.value)}
                  placeholder="Lot adedi"
                  className={inputCls}
                  aria-invalid={!!sellError}
                  aria-describedby={sellError ? 'sell-error' : undefined}
                />
                {sellError && <p id="sell-error" className="text-xs font-bold text-red-600 dark:text-red-400">{sellError}</p>}
                <button className="w-full py-2.5 bg-red-500 hover:bg-red-600 text-white rounded-xl font-black text-sm transition-colors">
                  Sat
                </button>
              </form>
            </section>
          )}

          {/* Para Ekle */}
          <section aria-labelledby="deposit-section-title" className="ai-glass ai-neon-border rounded-2xl p-5">
            <h2 id="deposit-section-title" className={labelCls}>Ana Bakiyeye Para Ekle</h2>
            <form className="space-y-2.5" onSubmit={handleDepositSubmit}>
              <label htmlFor="deposit-amount" className="sr-only">Eklenecek tutar (TL)</label>
              <input
                id="deposit-amount"
                type="number"
                min="1"
                step="0.01"
                value={depositInput}
                onChange={(e) => setDepositInput(e.target.value)}
                placeholder="Tutar (TL)"
                className={inputCls}
                aria-invalid={!!depositError}
                aria-describedby={depositError ? 'deposit-error' : undefined}
              />
              {depositError && <p id="deposit-error" className="text-xs font-bold text-red-600 dark:text-red-400">{depositError}</p>}
              <button className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-black text-sm transition-colors">
                Para Ekle
              </button>
            </form>
          </section>

          {/* Para Çek */}
          <section aria-labelledby="withdraw-section-title" className="ai-glass ai-neon-border rounded-2xl p-5">
            <h2 id="withdraw-section-title" className={labelCls}>Ana Bakiyeden Para Çek</h2>
            <form className="space-y-2.5" onSubmit={handleWithdrawSubmit}>
              <label htmlFor="withdraw-amount" className="sr-only">Çekilecek tutar (TL)</label>
              <input
                id="withdraw-amount"
                type="number"
                min="1"
                step="0.01"
                value={withdrawInput}
                onChange={(e) => setWithdrawInput(e.target.value)}
                placeholder="Tutar (TL)"
                className={inputCls}
                aria-invalid={!!withdrawError}
                aria-describedby={withdrawError ? 'withdraw-error' : undefined}
              />
              {withdrawError && <p id="withdraw-error" className="text-xs font-bold text-red-600 dark:text-red-400">{withdrawError}</p>}
              <button className="w-full py-2.5 bg-slate-800 dark:bg-slate-600 hover:bg-slate-700 text-white rounded-xl font-black text-sm transition-colors">
                Para Çek
              </button>
            </form>
          </section>

          {/* AI Asistan kartı */}
          <div className="bg-blue-800 rounded-2xl p-5 text-white">
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
