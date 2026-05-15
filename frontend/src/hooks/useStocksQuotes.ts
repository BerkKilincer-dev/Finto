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
const RETRY_DELAYS_MS = [1_000, 3_000, 8_000]; // Exponential-ish backoff

async function fetchWithRetry(url: string, signal: AbortSignal): Promise<Response | null> {
  let lastErr: unknown = null;
  for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
    try {
      const r = await fetch(url, { signal });
      if (r.ok) return r;
      // 4xx kalıcıdır, retry boşa gider; sadece 5xx ve network hatalarında tekrar dene.
      if (r.status >= 400 && r.status < 500) return r;
      lastErr = new Error(`HTTP ${r.status}`);
    } catch (e) {
      if ((e as Error).name === 'AbortError') return null;
      lastErr = e;
    }
    const delay = RETRY_DELAYS_MS[attempt];
    if (delay === undefined) break;
    await new Promise((r) => setTimeout(r, delay));
    if (signal.aborted) return null;
  }
  console.warn('[useStocksQuotes] Tüm retry denemeleri başarısız:', lastErr);
  return null;
}

export function useStocksQuotes() {
  const [stocks, setStocks] = useState<MarketStock[]>(INITIAL_BIST_STOCKS);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [marketDataWarning, setMarketDataWarning] = useState<string | null>(null);

  useEffect(() => {
    const ac = new AbortController();
    let interval: ReturnType<typeof setInterval> | null = null;

    async function loadLiveQuotes() {
      // Tab gizliyse fetch yapma — kullanıcı dönünce visibilitychange tetikler.
      if (typeof document !== 'undefined' && document.hidden) return;
      const response = await fetchWithRetry('/api/stocks/quotes', ac.signal);
      if (ac.signal.aborted) return;
      if (!response) {
        setMarketDataWarning('Canlı fiyatlar şu an alınamadı (ağ sorunu).');
        return;
      }
      if (!response.ok) {
        setMarketDataWarning('Canlı fiyatlar şu an güncellenemedi.');
        return;
      }
      try {
        const payload = await response.json();
        const liveQuotes: Array<Partial<MarketStock> & { symbol: string }> = payload?.quotes ?? [];
        if (!Array.isArray(liveQuotes) || liveQuotes.length === 0) {
          setMarketDataWarning('Canlı fiyatlar alınamadı.');
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
        // JSON parse vs. — sessizce geç, mevcut değerleri koru.
      }
    }

    function startPolling() {
      if (interval) return;
      loadLiveQuotes();
      interval = setInterval(loadLiveQuotes, POLL_MS);
    }
    function stopPolling() {
      if (!interval) return;
      clearInterval(interval);
      interval = null;
    }

    function onVisibility() {
      if (document.hidden) {
        stopPolling();
      } else {
        // Tab geri geldi → hemen taze veri çek + polling'i tekrar kur.
        startPolling();
      }
    }

    startPolling();
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      ac.abort();
      stopPolling();
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  return { stocks, lastUpdated, marketDataWarning };
}
