import { useEffect, useState } from 'react';

type HistoryItem = {
  id: string;
  symbol: string;
  trend: string;
  score: number;
  target_price: number;
  target_low: number;
  target_high: number;
  snapshot_price: number;
  created_at: number;
};

type Props = {
  symbol: string;
};

export default function PredictionHistory({ symbol }: Props) {
  const [items, setItems] = useState<HistoryItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    setError(null);
    fetch(`/api/predictions/${symbol}/history?limit=14`)
      .then((r) => r.json())
      .then((data) => {
        if (cancelled) return;
        setItems(data.history ?? []);
      })
      .catch(() => {
        if (!cancelled) setError('Tahmin geçmişi alınamadı.');
      });
    return () => {
      cancelled = true;
    };
  }, [symbol]);

  if (error) return null;
  if (!items) {
    return (
      <p className="text-xs text-slate-400 px-5 py-3">Tahmin geçmişi yükleniyor...</p>
    );
  }
  if (items.length === 0) {
    return (
      <p className="text-xs text-slate-400 px-5 py-3">
        Bu hisse için henüz tahmin geçmişi yok. Tahminler her gün otomatik kaydedilir.
      </p>
    );
  }

  return (
    <section
      aria-labelledby={`pred-hist-${symbol}`}
      className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700">
        <h2 id={`pred-hist-${symbol}`} className="font-black text-slate-900 dark:text-white">
          Tahmin Geçmişi
        </h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Son {items.length} gün — sistemin geçmişteki tahminleri ile o anki fiyat.
        </p>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-slate-700/60 max-h-64 overflow-auto">
        {items.map((it) => {
          const trendColor =
            it.trend === 'Yukselis'
              ? 'text-green-600'
              : it.trend === 'Dusuk seyir'
                ? 'text-red-500'
                : 'text-slate-500';
          return (
            <li key={it.id} className="px-5 py-3 flex items-center justify-between gap-3 text-sm">
              <span className="text-slate-500 dark:text-slate-400 font-semibold">
                {new Date(it.created_at * 1000).toLocaleDateString('tr-TR')}
              </span>
              <span className={`font-black ${trendColor}`}>{it.trend}</span>
              <span className="font-black text-slate-700 dark:text-slate-300">
                Skor {it.score > 0 ? '+' : ''}{it.score.toFixed(0)}
              </span>
              <span className="text-slate-500 dark:text-slate-400 text-xs">
                Hedef {it.target_price.toFixed(2)}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
