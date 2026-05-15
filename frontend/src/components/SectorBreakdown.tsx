import { useMemo } from 'react';
import { buildSectorBreakdown } from '../data/sectors';
import type { MarketStock } from '../hooks/useStocksQuotes';

type Holding = {
  symbol: string;
  quantity: number;
  averageCost: number;
};

type Props = {
  holdings: Holding[];
  stocks: MarketStock[];
};

export default function SectorBreakdown({ holdings, stocks }: Props) {
  const data = useMemo(() => {
    const priceOf = (sym: string) => stocks.find((s) => s.symbol === sym)?.price ?? 0;
    return buildSectorBreakdown(holdings, priceOf);
  }, [holdings, stocks]);

  if (data.bySector.length === 0) return null;

  return (
    <section
      aria-labelledby="sector-breakdown-title"
      className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-3"
    >
      <div>
        <h2 id="sector-breakdown-title" className="text-[10px] uppercase tracking-widest font-black text-slate-400">
          Sektör Dağılımı
        </h2>
        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{data.diversificationNote}</p>
      </div>
      <ul className="space-y-1.5">
        {data.bySector.map((row) => (
          <li key={row.sector} className="space-y-0.5">
            <div className="flex justify-between text-xs">
              <span className="font-black text-slate-800 dark:text-slate-200">{row.sector}</span>
              <span className="font-bold text-slate-600 dark:text-slate-300">%{row.percent.toFixed(0)}</span>
            </div>
            <div
              className="h-1.5 bg-slate-100 dark:bg-slate-700 rounded-full overflow-hidden"
              role="progressbar"
              aria-valuenow={Math.round(row.percent)}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`${row.sector} yüzde ${row.percent.toFixed(0)}`}
            >
              <div
                className="h-full bg-blue-600"
                style={{ width: `${Math.min(100, row.percent)}%` }}
              />
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}
