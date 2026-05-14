import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import type { MarketStock } from './useStocksQuotes';

export type Holding = {
  symbol: string;
  quantity: number;
  averageCost: number;
};

export type TransactionType = 'buy' | 'sell' | 'deposit' | 'withdraw';

export type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  createdAt: string;
  symbol?: string;
  quantity?: number;
};

export type PortfolioActionResult = { ok: boolean; message: string };

export type PortfolioApi = {
  cashBalance: number;
  holdings: Holding[];
  transactions: Transaction[];
  registeredSymbols: string[];
  pinnedSymbols: string[];
  holdingsValue: number;
  totalBalance: number;
  buyStock: (symbol: string, quantity: number) => Promise<PortfolioActionResult>;
  sellStock: (symbol: string, quantity: number) => Promise<PortfolioActionResult>;
  depositCash: (amount: number) => Promise<PortfolioActionResult>;
  withdrawCash: (amount: number) => Promise<PortfolioActionResult>;
  toggleRegisteredStock: (symbol: string) => Promise<PortfolioActionResult>;
  togglePinnedStock: (symbol: string) => Promise<PortfolioActionResult>;
};

const STORAGE = {
  cash: 'finto_cash',
  holdings: 'finto_holdings',
  registered: 'finto_registered_symbols',
  pinned: 'finto_pinned_symbols',
  transactions: 'finto_transactions',
};
const DEFAULT_CASH = 30000;
const MAX_TX = 50;

type Snapshot = {
  cashBalance: number;
  holdings: Holding[];
  transactions: Transaction[];
  registeredSymbols: string[];
  pinnedSymbols: string[];
};

function readNumber(key: string, fallback: number): number {
  try {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    const parsed = Number(raw);
    return Number.isFinite(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

function readJson<T>(key: string, guard: (x: unknown) => x is T, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw) as unknown;
    return guard(parsed) ? parsed : fallback;
  } catch {
    return fallback;
  }
}

const isStringArray = (x: unknown): x is string[] =>
  Array.isArray(x) && x.every((s) => typeof s === 'string' && s.trim().length > 0);

const isHoldingArray = (x: unknown): x is Holding[] =>
  Array.isArray(x) &&
  x.every(
    (h) =>
      h &&
      typeof h === 'object' &&
      typeof (h as Holding).symbol === 'string' &&
      typeof (h as Holding).quantity === 'number' &&
      typeof (h as Holding).averageCost === 'number',
  );

const isTransactionArray = (x: unknown): x is Transaction[] =>
  Array.isArray(x) &&
  x.every((t) => {
    if (!t || typeof t !== 'object') return false;
    const r = t as Record<string, unknown>;
    return (
      typeof r.id === 'string' &&
      typeof r.type === 'string' &&
      typeof r.amount === 'number' &&
      typeof r.createdAt === 'string'
    );
  });

function readLocalSnapshot(): Snapshot {
  return {
    cashBalance: readNumber(STORAGE.cash, DEFAULT_CASH),
    holdings: readJson(STORAGE.holdings, isHoldingArray, []),
    transactions: readJson(STORAGE.transactions, isTransactionArray, []),
    registeredSymbols: readJson(STORAGE.registered, isStringArray, []),
    pinnedSymbols: readJson(STORAGE.pinned, isStringArray, []),
  };
}

function writeLocalSnapshot(snap: Snapshot) {
  localStorage.setItem(STORAGE.cash, String(snap.cashBalance));
  localStorage.setItem(STORAGE.holdings, JSON.stringify(snap.holdings));
  localStorage.setItem(STORAGE.transactions, JSON.stringify(snap.transactions.slice(0, MAX_TX)));
  localStorage.setItem(STORAGE.registered, JSON.stringify(snap.registeredSymbols));
  localStorage.setItem(STORAGE.pinned, JSON.stringify(snap.pinnedSymbols));
}

function clearLocalSnapshot() {
  localStorage.removeItem(STORAGE.cash);
  localStorage.removeItem(STORAGE.holdings);
  localStorage.removeItem(STORAGE.transactions);
  localStorage.removeItem(STORAGE.registered);
  localStorage.removeItem(STORAGE.pinned);
}

async function fetchSnapshot(): Promise<Snapshot> {
  const res = await fetch('/api/portfolio', { credentials: 'include' });
  if (!res.ok) throw new Error(`Portföy yüklenemedi: ${res.status}`);
  return (await res.json()) as Snapshot;
}

async function callPortfolio(endpoint: string, body: Record<string, unknown>): Promise<{
  ok: boolean;
  snapshot?: Snapshot;
  error?: string;
}> {
  try {
    const res = await fetch(`/api/portfolio/${endpoint}`, {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) return { ok: false, error: (data as { error?: string }).error ?? 'İşlem başarısız.' };
    return { ok: true, snapshot: data as Snapshot };
  } catch {
    return { ok: false, error: 'Sunucuya ulaşılamadı.' };
  }
}

export function usePortfolio(stocks: MarketStock[]): PortfolioApi {
  const { user, loading: authLoading } = useAuth();
  const [snap, setSnap] = useState<Snapshot>(() => readLocalSnapshot());
  const lastUserIdRef = useRef<string | null>(null);

  // Anonim modda local'e yaz.
  useEffect(() => {
    if (user) return;
    writeLocalSnapshot(snap);
  }, [snap, user]);

  // Giriş/çıkış geçişlerinde server snapshot'ını yükle (gerekirse import et).
  useEffect(() => {
    if (authLoading) return;
    let cancelled = false;

    async function syncWithServer(userId: string) {
      // Aynı kullanıcı için tekrar import deneme
      const isInitialLogin = lastUserIdRef.current !== userId;
      lastUserIdRef.current = userId;

      try {
        let serverSnap = await fetchSnapshot();
        const serverEmpty =
          serverSnap.holdings.length === 0 &&
          serverSnap.transactions.length === 0 &&
          serverSnap.cashBalance === DEFAULT_CASH &&
          serverSnap.registeredSymbols.length === 0 &&
          serverSnap.pinnedSymbols.length === 0;

        if (isInitialLogin && serverEmpty) {
          const local = readLocalSnapshot();
          const localHasData =
            local.holdings.length > 0 ||
            local.transactions.length > 0 ||
            local.cashBalance !== DEFAULT_CASH ||
            local.registeredSymbols.length > 0 ||
            local.pinnedSymbols.length > 0;
          if (localHasData) {
            const res = await fetch('/api/portfolio/import', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify(local),
            });
            if (res.ok) {
              const data = (await res.json()) as { imported: boolean; snapshot: Snapshot };
              serverSnap = data.snapshot;
              clearLocalSnapshot();
            }
          }
        }

        if (!cancelled) setSnap(serverSnap);
      } catch {
        // sunucu yoksa local'de kal
      }
    }

    if (user) {
      void syncWithServer(user.id);
    } else {
      lastUserIdRef.current = null;
      setSnap(readLocalSnapshot());
    }

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  const holdingsValue = useMemo(
    () =>
      snap.holdings.reduce((total, holding) => {
        const stock = stocks.find((item) => item.symbol === holding.symbol);
        if (!stock) return total;
        return total + holding.quantity * stock.price;
      }, 0),
    [snap.holdings, stocks],
  );

  // Holding'lere sahip semboller otomatik kayıtlı sayılsın (eski davranış).
  useEffect(() => {
    if (user) return;
    setSnap((prev) => {
      const set = new Set(prev.registeredSymbols);
      let changed = false;
      for (const h of prev.holdings) {
        if (!set.has(h.symbol)) {
          set.add(h.symbol);
          changed = true;
        }
      }
      if (!changed) return prev;
      return { ...prev, registeredSymbols: Array.from(set) };
    });
  }, [snap.holdings, user]);

  // ---- Mutations ----
  // TTS dostu: "₺1.234,56" yerine "1234 lira" — ekran okuyucu binlik ayracı doğru telaffuz edemiyor.
  const fmtTry = (n: number) => {
    if (!Number.isFinite(n)) return '0 lira';
    const sign = n < 0 ? 'eksi ' : '';
    const abs = Math.abs(n);
    const lira = Math.floor(abs);
    const kurus = Math.round((abs - lira) * 100);
    if (kurus === 0) return `${sign}${lira} lira`;
    if (kurus === 100) return `${sign}${lira + 1} lira`;
    return `${sign}${lira} lira ${kurus} kuruş`;
  };

  const localMutate = useCallback((updater: (s: Snapshot) => Snapshot) => {
    setSnap((prev) => updater(prev));
  }, []);

  const addLocalTx = (s: Snapshot, entry: Omit<Transaction, 'id' | 'createdAt'>): Snapshot => ({
    ...s,
    transactions: [
      {
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        ...entry,
      },
      ...s.transactions.slice(0, MAX_TX - 1),
    ],
  });

  const buyStock = useCallback(
    async (symbol: string, quantity: number): Promise<PortfolioActionResult> => {
      const stock = stocks.find((item) => item.symbol === symbol);
      if (!stock) return { ok: false, message: 'Hisse bulunamadı.' };
      if (!Number.isFinite(quantity) || quantity <= 0)
        return { ok: false, message: 'Lot adedi 1 veya daha büyük olmalı.' };

      if (user) {
        const result = await callPortfolio('buy', { symbol, quantity, price: stock.price });
        if (!result.ok) return { ok: false, message: result.error ?? 'Alım başarısız.' };
        if (result.snapshot) setSnap(result.snapshot);
        return { ok: true, message: `${symbol} için ${quantity} lot alım gerçekleşti.` };
      }

      // Local mod
      const cost = stock.price * quantity;
      if (cost > snap.cashBalance) return { ok: false, message: 'Yetersiz nakit bakiye.' };

      localMutate((prev) => {
        const existing = prev.holdings.find((h) => h.symbol === symbol);
        const holdings = !existing
          ? [...prev.holdings, { symbol, quantity, averageCost: stock.price }]
          : prev.holdings.map((h) => {
              if (h.symbol !== symbol) return h;
              const newQty = h.quantity + quantity;
              const weightedAvg = (h.averageCost * h.quantity + cost) / newQty;
              return { ...h, quantity: newQty, averageCost: weightedAvg };
            });
        const registeredSymbols = prev.registeredSymbols.includes(symbol)
          ? prev.registeredSymbols
          : [...prev.registeredSymbols, symbol];
        return addLocalTx(
          { ...prev, cashBalance: prev.cashBalance - cost, holdings, registeredSymbols },
          { type: 'buy', amount: cost, symbol, quantity },
        );
      });
      return { ok: true, message: `${symbol} için ${quantity} lot alım gerçekleşti.` };
    },
    [user, stocks, snap.cashBalance, localMutate],
  );

  const sellStock = useCallback(
    async (symbol: string, quantity: number): Promise<PortfolioActionResult> => {
      const stock = stocks.find((item) => item.symbol === symbol);
      if (!stock) return { ok: false, message: 'Hisse bulunamadı.' };
      if (!Number.isFinite(quantity) || quantity <= 0)
        return { ok: false, message: 'Lot adedi 1 veya daha büyük olmalı.' };

      if (user) {
        const result = await callPortfolio('sell', { symbol, quantity, price: stock.price });
        if (!result.ok) return { ok: false, message: result.error ?? 'Satış başarısız.' };
        if (result.snapshot) setSnap(result.snapshot);
        const proceeds = stock.price * quantity;
        return {
          ok: true,
          message: `${symbol} için ${quantity} lot satış gerçekleşti. +${fmtTry(proceeds)}`,
        };
      }

      const holding = snap.holdings.find((item) => item.symbol === symbol);
      if (!holding) return { ok: false, message: 'Bu hissede pozisyon bulunmuyor.' };
      if (quantity > holding.quantity)
        return { ok: false, message: `En fazla ${holding.quantity} lot satabilirsiniz.` };

      const proceeds = stock.price * quantity;
      localMutate((prev) => {
        const newQty = holding.quantity - quantity;
        const holdings =
          newQty === 0
            ? prev.holdings.filter((item) => item.symbol !== symbol)
            : prev.holdings.map((item) =>
                item.symbol === symbol ? { ...item, quantity: newQty } : item,
              );
        return addLocalTx(
          { ...prev, cashBalance: prev.cashBalance + proceeds, holdings },
          { type: 'sell', amount: proceeds, symbol, quantity },
        );
      });
      return {
        ok: true,
        message: `${symbol} için ${quantity} lot satış gerçekleşti. +${fmtTry(proceeds)}`,
      };
    },
    [user, stocks, snap.holdings, localMutate],
  );

  const depositCash = useCallback(
    async (amount: number): Promise<PortfolioActionResult> => {
      if (!Number.isFinite(amount) || amount <= 0)
        return { ok: false, message: "Yüklenecek tutar 0'dan büyük olmalı." };
      if (user) {
        const result = await callPortfolio('deposit', { amount });
        if (!result.ok) return { ok: false, message: result.error ?? 'İşlem başarısız.' };
        if (result.snapshot) setSnap(result.snapshot);
        return { ok: true, message: `${amount.toLocaleString('tr-TR')} TL bakiye eklendi.` };
      }
      localMutate((prev) =>
        addLocalTx({ ...prev, cashBalance: prev.cashBalance + amount }, { type: 'deposit', amount }),
      );
      return { ok: true, message: `${amount.toLocaleString('tr-TR')} TL bakiye eklendi.` };
    },
    [user, localMutate],
  );

  const withdrawCash = useCallback(
    async (amount: number): Promise<PortfolioActionResult> => {
      if (!Number.isFinite(amount) || amount <= 0)
        return { ok: false, message: "Çekilecek tutar 0'dan büyük olmalı." };
      if (user) {
        const result = await callPortfolio('withdraw', { amount });
        if (!result.ok) return { ok: false, message: result.error ?? 'İşlem başarısız.' };
        if (result.snapshot) setSnap(result.snapshot);
        return { ok: true, message: `${amount.toLocaleString('tr-TR')} TL çekim yapıldı.` };
      }
      if (amount > snap.cashBalance) return { ok: false, message: 'Yetersiz nakit bakiye.' };
      localMutate((prev) =>
        addLocalTx({ ...prev, cashBalance: prev.cashBalance - amount }, { type: 'withdraw', amount }),
      );
      return { ok: true, message: `${amount.toLocaleString('tr-TR')} TL çekim yapıldı.` };
    },
    [user, snap.cashBalance, localMutate],
  );

  const toggleRegisteredStock = useCallback(
    async (symbol: string): Promise<PortfolioActionResult> => {
      const exists = stocks.some((item) => item.symbol === symbol);
      if (!exists) return { ok: false, message: 'Hisse bulunamadı.' };

      if (user) {
        const result = await callPortfolio('registered/toggle', { symbol });
        if (!result.ok) return { ok: false, message: result.error ?? 'İşlem başarısız.' };
        if (result.snapshot) setSnap(result.snapshot);
        const isRegisteredNow = result.snapshot?.registeredSymbols.includes(symbol);
        return {
          ok: true,
          message: isRegisteredNow
            ? `${symbol} kayıtlı hisselere eklendi.`
            : `${symbol} kayıtlı hisselerden çıkarıldı.`,
        };
      }

      const hasHolding = snap.holdings.some((h) => h.symbol === symbol);
      const isRegistered = snap.registeredSymbols.includes(symbol);
      if (isRegistered && hasHolding) {
        return { ok: false, message: 'Bu hissede pozisyonunuz varken kaydı kaldıramazsınız.' };
      }
      localMutate((prev) => ({
        ...prev,
        registeredSymbols: prev.registeredSymbols.includes(symbol)
          ? prev.registeredSymbols.filter((s) => s !== symbol)
          : [...prev.registeredSymbols, symbol],
      }));
      return {
        ok: true,
        message: isRegistered
          ? `${symbol} kayıtlı hisselerden çıkarıldı.`
          : `${symbol} kayıtlı hisselere eklendi.`,
      };
    },
    [user, stocks, snap.holdings, snap.registeredSymbols, localMutate],
  );

  const togglePinnedStock = useCallback(
    async (symbol: string): Promise<PortfolioActionResult> => {
      const exists = stocks.some((item) => item.symbol === symbol);
      if (!exists) return { ok: false, message: 'Hisse bulunamadı.' };

      if (user) {
        const result = await callPortfolio('pinned/toggle', { symbol });
        if (!result.ok) return { ok: false, message: result.error ?? 'İşlem başarısız.' };
        if (result.snapshot) setSnap(result.snapshot);
        const isPinnedNow = result.snapshot?.pinnedSymbols.includes(symbol);
        return {
          ok: true,
          message: isPinnedNow ? `${symbol} favorilere eklendi.` : `${symbol} favorilerden çıkarıldı.`,
        };
      }

      const isPinned = snap.pinnedSymbols.includes(symbol);
      localMutate((prev) => ({
        ...prev,
        pinnedSymbols: prev.pinnedSymbols.includes(symbol)
          ? prev.pinnedSymbols.filter((s) => s !== symbol)
          : [...prev.pinnedSymbols, symbol],
      }));
      return {
        ok: true,
        message: isPinned ? `${symbol} favorilerden çıkarıldı.` : `${symbol} favorilere eklendi.`,
      };
    },
    [user, stocks, snap.pinnedSymbols, localMutate],
  );

  return {
    cashBalance: snap.cashBalance,
    holdings: snap.holdings,
    transactions: snap.transactions,
    registeredSymbols: snap.registeredSymbols,
    pinnedSymbols: snap.pinnedSymbols,
    holdingsValue,
    totalBalance: snap.cashBalance + holdingsValue,
    buyStock,
    sellStock,
    depositCash,
    withdrawCash,
    toggleRegisteredStock,
    togglePinnedStock,
  };
}
