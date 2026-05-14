import { useEffect, useState } from 'react';
import { BIST_WATCHLIST } from '../data/bistWatchlist';

export type MarketStock = {
  symbol: string;
  name: string;
  price: number;
  dailyChangePercent: number;
  marketTag: string;
  marketCap?: number;
  source?: string;
};

const INITIAL_BIST_STOCKS: MarketStock[] = BIST_WATCHLIST.map((s) => ({ ...s }));
const POLL_MS = 60_000;

export function useStocksQuotes() {
  const [stocks, setStocks] = useState<MarketStock[]>(INITIAL_BIST_STOCKS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketDataWarning, setMarketDataWarning] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadLiveQuotes() {
      try {
        const response = await fetch('/api/stocks/quotes');
        if (!response.ok) {
          if (!isCancelled) setMarketDataWarning('Canlı fiyatlar şu an güncellenemedi (ağ veya veri kaynağı).');
          return;
        }
        const payload = await response.json();
        const liveQuotes: Array<Partial<MarketStock> & { symbol: string }> = payload?.quotes ?? [];
        if (isCancelled || !Array.isArray(liveQuotes) || liveQuotes.length === 0) {
          if (!isCancelled) setMarketDataWarning('Canlı fiyatlar alınamadı.');
          return;
        }
        setMarketDataWarning(null);
        setStocks((prev) =>
          prev.map((stock) => {
            const live = liveQuotes.find((q) => q.symbol === stock.symbol);
            if (!live || typeof live.price !== 'number') return stock;
            const pctRaw = live.dailyChangePercent;
            const pct =
              typeof pctRaw === 'number'
                ? pctRaw
                : typeof pctRaw === 'string'
                  ? Number.parseFloat(pctRaw)
                  : NaN;
            return {
              ...stock,
              name: typeof live.name === 'string' && live.name.trim() ? live.name : stock.name,
              price: live.price,
              dailyChangePercent: Number.isFinite(pct) ? pct : stock.dailyChangePercent,
              marketCap: typeof live.marketCap === 'number' ? live.marketCap : stock.marketCap,
              source: typeof live.source === 'string' ? live.source : stock.source,
            };
          }),
        );
        setLastUpdated(new Date());
      } catch {
        // Fiyat alınamazsa mevcut değerleri koru.
      }
    }

    loadLiveQuotes();
    const interval = setInterval(loadLiveQuotes, POLL_MS);
    return () => {
      isCancelled = true;
      clearInterval(interval);
    };
  }, []);

  return { stocks, lastUpdated, marketDataWarning };
}
