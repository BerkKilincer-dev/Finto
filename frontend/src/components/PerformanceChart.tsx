import { useMemo } from 'react';

type Tx = {
  id: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdraw';
  amount: number;
  createdAt: string;
};

type Props = {
  transactions: Tx[];
  currentTotal: number;
};

/**
 * Basit kümülatif performans grafiği:
 * - Tarih sırasıyla net nakit akışını ekle (deposit + sell - buy - withdraw)
 * - En son noktayı şu anki toplam varlığa eşitle (yaklaşık)
 * Yatırılan vs. şu anki değer karşılaştırması verir.
 */
export default function PerformanceChart({ transactions, currentTotal }: Props) {
  const { points, invested, profit, profitPct } = useMemo(() => {
    if (transactions.length === 0) return { points: [], invested: 0, profit: 0, profitPct: 0 };

    const sorted = [...transactions].sort(
      (a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime(),
    );
    let netInvested = 0;
    const cumulative: Array<{ t: number; value: number }> = [];
    for (const tx of sorted) {
      // "Yatırılan" sadece deposit; satışlar/alımlar nakit içinde dönüyor.
      if (tx.type === 'deposit') netInvested += tx.amount;
      else if (tx.type === 'withdraw') netInvested -= tx.amount;
      cumulative.push({ t: new Date(tx.createdAt).getTime(), value: netInvested });
    }
    // Son noktaya şu anki toplam değer
    cumulative.push({ t: Date.now(), value: currentTotal });

    return {
      points: cumulative,
      invested: netInvested,
      profit: currentTotal - netInvested,
      profitPct: netInvested > 0 ? ((currentTotal - netInvested) / netInvested) * 100 : 0,
    };
  }, [transactions, currentTotal]);

  if (points.length < 2) {
    return (
      <p className="text-xs text-slate-400 px-5 py-4">
        Yeterli işlem geçmişi yok. Para yatırıp hisse aldıkça performansınız burada görünecek.
      </p>
    );
  }

  const w = 320;
  const h = 80;
  const ts = points.map((p) => p.t);
  const vs = points.map((p) => p.value);
  const tMin = Math.min(...ts);
  const tMax = Math.max(...ts);
  const tRange = tMax - tMin || 1;
  const vMin = Math.min(0, ...vs);
  const vMax = Math.max(...vs);
  const vRange = vMax - vMin || 1;
  const poly = points
    .map((p) => {
      const x = ((p.t - tMin) / tRange) * w;
      const y = h - ((p.value - vMin) / vRange) * h;
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(' ');
  const profitColor = profit >= 0 ? 'text-green-600' : 'text-red-500';
  const lineColor = profit >= 0 ? '#16a34a' : '#dc2626';

  return (
    <section
      aria-labelledby="perf-chart-title"
      className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl overflow-hidden"
    >
      <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-700 flex items-center justify-between">
        <div>
          <h2 id="perf-chart-title" className="font-black text-slate-900 dark:text-white">
            Performans
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Yatırılan vs şu anki toplam varlık
          </p>
        </div>
        <div className={`text-right ${profitColor}`}>
          <p className="text-lg font-black">
            {profit >= 0 ? '+' : ''}{profit.toLocaleString('tr-TR', { maximumFractionDigits: 2 })} TL
          </p>
          <p className="text-xs font-bold">
            {profit >= 0 ? '+' : ''}%{profitPct.toFixed(1)}
          </p>
        </div>
      </div>
      <div className="p-4">
        <svg
          viewBox={`0 0 ${w} ${h}`}
          width="100%"
          height={h}
          role="img"
          aria-label={`Toplam varlık trendi. Yatırılan: ${invested.toFixed(0)} TL, şu an: ${currentTotal.toFixed(0)} TL.`}
          preserveAspectRatio="none"
        >
          <polyline points={poly} fill="none" stroke={lineColor} strokeWidth="2" strokeLinejoin="round" />
        </svg>
        <div className="flex justify-between text-[10px] text-slate-400 mt-1">
          <span>Yatırılan: {invested.toLocaleString('tr-TR')} TL</span>
          <span>Şu an: {currentTotal.toLocaleString('tr-TR')} TL</span>
        </div>
      </div>
    </section>
  );
}
