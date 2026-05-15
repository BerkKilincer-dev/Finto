import { useState } from 'react';
import { Bell, Trash2 } from 'lucide-react';
import { useAlerts } from '../hooks/useAlerts';
import type { MarketStock } from '../hooks/useStocksQuotes';

type Props = {
  stocks: MarketStock[];
  /** Belirli bir hisseye özel panel ise sadece o sembol için göster. */
  symbol?: string;
};

export default function AlertPanel({ stocks, symbol }: Props) {
  const { alerts, createAlert, deleteAlert } = useAlerts(stocks);
  const [direction, setDirection] = useState<'above' | 'below'>('above');
  const [target, setTarget] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const visible = symbol ? alerts.filter((a) => a.symbol === symbol) : alerts;
  const currentPrice = symbol ? stocks.find((s) => s.symbol === symbol)?.price : undefined;

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError(null);
    if (!symbol) {
      setError('Sembol seçili değil.');
      return;
    }
    const price = Number(target);
    if (!Number.isFinite(price) || price <= 0) {
      setError('Geçerli bir hedef fiyat girin.');
      return;
    }
    setBusy(true);
    const result = await createAlert(symbol, direction, price);
    setBusy(false);
    if (!result) {
      setError('Alarm oluşturulamadı.');
      return;
    }
    setTarget('');
  }

  return (
    <section
      aria-labelledby={`alert-panel-${symbol ?? 'global'}`}
      className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center gap-2">
        <Bell size={16} className="text-blue-700 dark:text-blue-300" aria-hidden="true" />
        <h2 id={`alert-panel-${symbol ?? 'global'}`} className="font-black text-slate-900 dark:text-white">
          Fiyat Alarmı{symbol ? ` — ${symbol}` : ''}
        </h2>
      </div>

      {symbol && (
        <form onSubmit={handleSubmit} className="p-5 space-y-3 border-b border-slate-100 dark:border-slate-700">
          {typeof currentPrice === 'number' && (
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Şu anki fiyat: <span className="font-black text-slate-800 dark:text-slate-200">{currentPrice.toFixed(2)} TL</span>
            </p>
          )}
          <div className="flex gap-2 flex-wrap">
            <div role="radiogroup" aria-label="Yön" className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-lg p-1">
              <button
                type="button"
                role="radio"
                aria-checked={direction === 'above'}
                onClick={() => setDirection('above')}
                className={`px-3 py-1 text-xs font-black rounded-md ${direction === 'above' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow' : 'text-slate-500'}`}
              >
                Üstüne çıkarsa
              </button>
              <button
                type="button"
                role="radio"
                aria-checked={direction === 'below'}
                onClick={() => setDirection('below')}
                className={`px-3 py-1 text-xs font-black rounded-md ${direction === 'below' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow' : 'text-slate-500'}`}
              >
                Altına inerse
              </button>
            </div>
            <input
              type="number"
              step="0.01"
              min="0.01"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              placeholder="Hedef fiyat"
              aria-label="Hedef fiyat (TL)"
              className="flex-1 min-w-[120px] px-3 py-1.5 rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-sm font-semibold text-slate-900 dark:text-white"
              required
            />
            <button
              type="submit"
              disabled={busy}
              className="px-4 py-1.5 rounded-lg bg-blue-700 hover:bg-blue-800 disabled:opacity-50 text-white font-black text-sm"
            >
              Alarm Kur
            </button>
          </div>
          {error && (
            <p role="alert" className="text-xs font-bold text-red-600 dark:text-red-400">
              {error}
            </p>
          )}
        </form>
      )}

      <ul className="divide-y divide-slate-100 dark:divide-slate-700/60">
        {visible.length === 0 && (
          <li className="px-5 py-4 text-sm text-slate-400 dark:text-slate-500">
            Henüz alarm yok.{symbol ? ' Yukarıdan ekleyebilirsiniz.' : ''}
          </li>
        )}
        {visible.map((a) => (
          <li key={a.id} className="px-5 py-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-black text-slate-900 dark:text-white">
                {a.symbol} {a.direction === 'above' ? '≥' : '≤'} {a.targetPrice.toFixed(2)} TL
              </p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {a.active ? 'Aktif' : `Tetiklendi: ${a.triggeredAt ? new Date(a.triggeredAt * 1000).toLocaleString('tr-TR') : '—'}`}
              </p>
            </div>
            <button
              type="button"
              onClick={() => void deleteAlert(a.id)}
              aria-label={`${a.symbol} alarmını sil`}
              className="p-2 rounded-lg text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/30"
            >
              <Trash2 size={14} aria-hidden="true" />
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
