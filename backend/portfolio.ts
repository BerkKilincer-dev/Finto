import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from './db.ts';
import { requireAuth } from './auth.ts';

const router = Router();
router.use(requireAuth);

type Holding = { symbol: string; quantity: number; averageCost: number };
type TransactionType = 'buy' | 'sell' | 'deposit' | 'withdraw';
type Transaction = {
  id: string;
  type: TransactionType;
  amount: number;
  createdAt: string;
  symbol?: string;
  quantity?: number;
};
type PortfolioSnapshot = {
  cashBalance: number;
  holdings: Holding[];
  transactions: Transaction[];
  registeredSymbols: string[];
  pinnedSymbols: string[];
};

const DEFAULT_CASH = 30000;
const MAX_TRANSACTIONS = 50;

function userId(req: Request): string {
  return (req as Request & { user: { id: string } }).user.id;
}

function ensurePortfolioRow(uid: string) {
  db.prepare('INSERT OR IGNORE INTO portfolios (user_id, cash_balance) VALUES (?, ?)').run(
    uid,
    DEFAULT_CASH,
  );
  db.prepare('INSERT OR IGNORE INTO preferences (user_id) VALUES (?)').run(uid);
}

function safeJsonArray(raw: string | null | undefined): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((x): x is string => typeof x === 'string' && x.trim().length > 0);
  } catch {
    return [];
  }
}

function readSnapshot(uid: string): PortfolioSnapshot {
  ensurePortfolioRow(uid);
  const pf = db
    .prepare('SELECT cash_balance FROM portfolios WHERE user_id = ?')
    .get(uid) as { cash_balance: number } | undefined;
  const holdings = db
    .prepare('SELECT symbol, quantity, average_cost FROM holdings WHERE user_id = ?')
    .all(uid) as Array<{ symbol: string; quantity: number; average_cost: number }>;
  const txRows = db
    .prepare(
      `SELECT id, type, amount, symbol, quantity, created_at
         FROM transactions WHERE user_id = ?
         ORDER BY created_at DESC LIMIT ?`,
    )
    .all(uid, MAX_TRANSACTIONS) as Array<{
    id: string;
    type: TransactionType;
    amount: number;
    symbol: string | null;
    quantity: number | null;
    created_at: number;
  }>;
  const prefs = db
    .prepare('SELECT registered_symbols, pinned_symbols FROM preferences WHERE user_id = ?')
    .get(uid) as { registered_symbols: string; pinned_symbols: string } | undefined;

  return {
    cashBalance: pf?.cash_balance ?? DEFAULT_CASH,
    holdings: holdings.map((h) => ({
      symbol: h.symbol,
      quantity: h.quantity,
      averageCost: h.average_cost,
    })),
    transactions: txRows.map((r) => ({
      id: r.id,
      type: r.type,
      amount: r.amount,
      symbol: r.symbol ?? undefined,
      quantity: r.quantity ?? undefined,
      createdAt: new Date(r.created_at * 1000).toISOString(),
    })),
    registeredSymbols: safeJsonArray(prefs?.registered_symbols),
    pinnedSymbols: safeJsonArray(prefs?.pinned_symbols),
  };
}

function recordTransaction(
  uid: string,
  entry: { type: TransactionType; amount: number; symbol?: string; quantity?: number },
) {
  const id = uuidv4();
  db.prepare(
    `INSERT INTO transactions (id, user_id, type, amount, symbol, quantity)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(id, uid, entry.type, entry.amount, entry.symbol ?? null, entry.quantity ?? null);

  // Eski kayıtları kırp (kullanıcı başına son MAX_TRANSACTIONS kalsın)
  db.prepare(
    `DELETE FROM transactions
       WHERE user_id = ?
         AND id NOT IN (
           SELECT id FROM transactions WHERE user_id = ?
             ORDER BY created_at DESC LIMIT ?
         )`,
  ).run(uid, uid, MAX_TRANSACTIONS);
}

router.get('/', (req: Request, res: Response) => {
  res.json(readSnapshot(userId(req)));
});

router.post('/buy', (req: Request, res: Response) => {
  const { symbol, quantity, price } = req.body as {
    symbol?: string;
    quantity?: number;
    price?: number;
  };
  if (!symbol || typeof symbol !== 'string') return res.status(400).json({ error: 'Geçersiz sembol.' });
  if (!Number.isFinite(quantity) || (quantity ?? 0) <= 0)
    return res.status(400).json({ error: 'Lot adedi 1 veya daha büyük olmalı.' });
  if (!Number.isFinite(price) || (price ?? 0) <= 0)
    return res.status(400).json({ error: 'Geçersiz fiyat.' });

  const uid = userId(req);
  ensurePortfolioRow(uid);
  const qty = quantity as number;
  const px = price as number;
  const cost = qty * px;

  const tx = db.transaction(() => {
    const pf = db
      .prepare('SELECT cash_balance FROM portfolios WHERE user_id = ?')
      .get(uid) as { cash_balance: number };
    if (cost > pf.cash_balance) throw new Error('INSUFFICIENT_CASH');

    const prefsRow = db
      .prepare('SELECT registered_symbols FROM preferences WHERE user_id = ?')
      .get(uid) as { registered_symbols: string } | undefined;
    const registered = new Set(safeJsonArray(prefsRow?.registered_symbols));
    if (!registered.has(symbol)) throw new Error('NOT_REGISTERED');

    db.prepare('UPDATE portfolios SET cash_balance = cash_balance - ?, updated_at = unixepoch() WHERE user_id = ?')
      .run(cost, uid);

    const existing = db
      .prepare('SELECT quantity, average_cost FROM holdings WHERE user_id = ? AND symbol = ?')
      .get(uid, symbol) as { quantity: number; average_cost: number } | undefined;
    if (!existing) {
      db.prepare(
        'INSERT INTO holdings (user_id, symbol, quantity, average_cost) VALUES (?, ?, ?, ?)',
      ).run(uid, symbol, qty, px);
    } else {
      const newQty = existing.quantity + qty;
      const newAvg = (existing.average_cost * existing.quantity + cost) / newQty;
      db.prepare('UPDATE holdings SET quantity = ?, average_cost = ? WHERE user_id = ? AND symbol = ?')
        .run(newQty, newAvg, uid, symbol);
    }
    recordTransaction(uid, { type: 'buy', amount: cost, symbol, quantity: qty });
  });

  try {
    tx();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'INSUFFICIENT_CASH') return res.status(400).json({ error: 'Yetersiz nakit bakiye.' });
    if (msg === 'NOT_REGISTERED')
      return res.status(400).json({ error: 'Önce hisseyi kayıtlı hisselere ekleyin.' });
    return res.status(500).json({ error: 'Alım gerçekleştirilemedi.' });
  }
  res.json(readSnapshot(uid));
});

router.post('/sell', (req: Request, res: Response) => {
  const { symbol, quantity, price } = req.body as {
    symbol?: string;
    quantity?: number;
    price?: number;
  };
  if (!symbol || typeof symbol !== 'string') return res.status(400).json({ error: 'Geçersiz sembol.' });
  if (!Number.isFinite(quantity) || (quantity ?? 0) <= 0)
    return res.status(400).json({ error: 'Lot adedi 1 veya daha büyük olmalı.' });
  if (!Number.isFinite(price) || (price ?? 0) <= 0)
    return res.status(400).json({ error: 'Geçersiz fiyat.' });

  const uid = userId(req);
  ensurePortfolioRow(uid);
  const qty = quantity as number;
  const px = price as number;
  const proceeds = qty * px;

  const tx = db.transaction(() => {
    const existing = db
      .prepare('SELECT quantity FROM holdings WHERE user_id = ? AND symbol = ?')
      .get(uid, symbol) as { quantity: number } | undefined;
    if (!existing) throw new Error('NO_POSITION');
    if (qty > existing.quantity) throw new Error('OVERSELL');

    const newQty = existing.quantity - qty;
    if (newQty === 0) {
      db.prepare('DELETE FROM holdings WHERE user_id = ? AND symbol = ?').run(uid, symbol);
    } else {
      db.prepare('UPDATE holdings SET quantity = ? WHERE user_id = ? AND symbol = ?').run(
        newQty,
        uid,
        symbol,
      );
    }
    db.prepare('UPDATE portfolios SET cash_balance = cash_balance + ?, updated_at = unixepoch() WHERE user_id = ?')
      .run(proceeds, uid);
    recordTransaction(uid, { type: 'sell', amount: proceeds, symbol, quantity: qty });
  });

  try {
    tx();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'NO_POSITION') return res.status(400).json({ error: 'Bu hissede pozisyon bulunmuyor.' });
    if (msg === 'OVERSELL') return res.status(400).json({ error: 'Pozisyondan fazla satamazsınız.' });
    return res.status(500).json({ error: 'Satış gerçekleştirilemedi.' });
  }
  res.json(readSnapshot(uid));
});

router.post('/deposit', (req: Request, res: Response) => {
  const { amount } = req.body as { amount?: number };
  if (!Number.isFinite(amount) || (amount ?? 0) <= 0)
    return res.status(400).json({ error: 'Tutar 0\'dan büyük olmalı.' });
  const uid = userId(req);
  ensurePortfolioRow(uid);
  const tx = db.transaction(() => {
    db.prepare('UPDATE portfolios SET cash_balance = cash_balance + ?, updated_at = unixepoch() WHERE user_id = ?')
      .run(amount, uid);
    recordTransaction(uid, { type: 'deposit', amount: amount as number });
  });
  tx();
  res.json(readSnapshot(uid));
});

router.post('/withdraw', (req: Request, res: Response) => {
  const { amount } = req.body as { amount?: number };
  if (!Number.isFinite(amount) || (amount ?? 0) <= 0)
    return res.status(400).json({ error: 'Tutar 0\'dan büyük olmalı.' });
  const uid = userId(req);
  ensurePortfolioRow(uid);
  const tx = db.transaction(() => {
    const pf = db
      .prepare('SELECT cash_balance FROM portfolios WHERE user_id = ?')
      .get(uid) as { cash_balance: number };
    if ((amount as number) > pf.cash_balance) throw new Error('INSUFFICIENT_CASH');
    db.prepare('UPDATE portfolios SET cash_balance = cash_balance - ?, updated_at = unixepoch() WHERE user_id = ?')
      .run(amount, uid);
    recordTransaction(uid, { type: 'withdraw', amount: amount as number });
  });
  try {
    tx();
  } catch (err) {
    const msg = err instanceof Error ? err.message : '';
    if (msg === 'INSUFFICIENT_CASH') return res.status(400).json({ error: 'Yetersiz nakit bakiye.' });
    return res.status(500).json({ error: 'Çekim gerçekleştirilemedi.' });
  }
  res.json(readSnapshot(uid));
});

router.post('/registered/toggle', (req: Request, res: Response) => {
  const { symbol } = req.body as { symbol?: string };
  if (!symbol || typeof symbol !== 'string') return res.status(400).json({ error: 'Geçersiz sembol.' });
  const uid = userId(req);
  ensurePortfolioRow(uid);
  const tx = db.transaction(() => {
    const prefs = db
      .prepare('SELECT registered_symbols FROM preferences WHERE user_id = ?')
      .get(uid) as { registered_symbols: string };
    const list = safeJsonArray(prefs.registered_symbols);
    const idx = list.indexOf(symbol);
    if (idx >= 0) {
      const hasHolding = db
        .prepare('SELECT 1 FROM holdings WHERE user_id = ? AND symbol = ?')
        .get(uid, symbol) as { 1: number } | undefined;
      if (hasHolding) throw new Error('HAS_POSITION');
      list.splice(idx, 1);
    } else {
      list.push(symbol);
    }
    db.prepare('UPDATE preferences SET registered_symbols = ? WHERE user_id = ?')
      .run(JSON.stringify(list), uid);
  });
  try {
    tx();
  } catch (err) {
    if (err instanceof Error && err.message === 'HAS_POSITION')
      return res.status(400).json({ error: 'Bu hissede pozisyonunuz varken kaydı kaldıramazsınız.' });
    return res.status(500).json({ error: 'İşlem başarısız.' });
  }
  res.json(readSnapshot(uid));
});

router.post('/pinned/toggle', (req: Request, res: Response) => {
  const { symbol } = req.body as { symbol?: string };
  if (!symbol || typeof symbol !== 'string') return res.status(400).json({ error: 'Geçersiz sembol.' });
  const uid = userId(req);
  ensurePortfolioRow(uid);
  const prefs = db
    .prepare('SELECT pinned_symbols FROM preferences WHERE user_id = ?')
    .get(uid) as { pinned_symbols: string };
  const list = safeJsonArray(prefs.pinned_symbols);
  const idx = list.indexOf(symbol);
  if (idx >= 0) list.splice(idx, 1);
  else list.push(symbol);
  db.prepare('UPDATE preferences SET pinned_symbols = ? WHERE user_id = ?')
    .run(JSON.stringify(list), uid);
  res.json(readSnapshot(uid));
});

router.post('/import', (req: Request, res: Response) => {
  const body = req.body as Partial<PortfolioSnapshot>;
  const uid = userId(req);
  ensurePortfolioRow(uid);

  const existing = readSnapshot(uid);
  const hasServerData =
    existing.holdings.length > 0 ||
    existing.transactions.length > 0 ||
    existing.cashBalance !== DEFAULT_CASH;
  if (hasServerData) {
    return res.json({ imported: false, reason: 'SERVER_HAS_DATA', snapshot: existing });
  }

  const tx = db.transaction(() => {
    if (Number.isFinite(body.cashBalance)) {
      db.prepare('UPDATE portfolios SET cash_balance = ?, updated_at = unixepoch() WHERE user_id = ?')
        .run(body.cashBalance, uid);
    }
    if (Array.isArray(body.holdings)) {
      const ins = db.prepare(
        'INSERT INTO holdings (user_id, symbol, quantity, average_cost) VALUES (?, ?, ?, ?)',
      );
      for (const h of body.holdings) {
        if (h && typeof h.symbol === 'string' && Number.isFinite(h.quantity) && Number.isFinite(h.averageCost)) {
          ins.run(uid, h.symbol, h.quantity, h.averageCost);
        }
      }
    }
    if (Array.isArray(body.transactions)) {
      const ins = db.prepare(
        'INSERT INTO transactions (id, user_id, type, amount, symbol, quantity, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      );
      for (const t of body.transactions.slice(0, MAX_TRANSACTIONS)) {
        if (!t || typeof t.id !== 'string') continue;
        const created = Date.parse(t.createdAt ?? '');
        const epoch = Number.isFinite(created) ? Math.floor(created / 1000) : Math.floor(Date.now() / 1000);
        ins.run(t.id, uid, t.type, t.amount, t.symbol ?? null, t.quantity ?? null, epoch);
      }
    }
    if (Array.isArray(body.registeredSymbols) || Array.isArray(body.pinnedSymbols)) {
      db.prepare('UPDATE preferences SET registered_symbols = ?, pinned_symbols = ? WHERE user_id = ?')
        .run(
          JSON.stringify(Array.isArray(body.registeredSymbols) ? body.registeredSymbols : []),
          JSON.stringify(Array.isArray(body.pinnedSymbols) ? body.pinnedSymbols : []),
          uid,
        );
    }
  });

  tx();
  res.json({ imported: true, snapshot: readSnapshot(uid) });
});

// GET /api/portfolio/transactions.csv — vergi/raporlama için CSV export
router.get('/transactions.csv', (req: Request, res: Response) => {
  const userId = (req as Request & { user: { id: string } }).user.id;
  type TxRow = {
    id: string;
    type: string;
    amount: number;
    symbol: string | null;
    quantity: number | null;
    created_at: number;
  };
  const rows = db.prepare(
    'SELECT id, type, amount, symbol, quantity, created_at FROM transactions WHERE user_id = ? ORDER BY created_at DESC',
  ).all(userId) as TxRow[];

  const header = 'id,tarih,tip,sembol,lot,tutar_tl\n';
  const escape = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const body = rows
    .map((r) => {
      const date = new Date(r.created_at * 1000).toISOString();
      return [
        escape(r.id),
        escape(date),
        escape(r.type),
        escape(r.symbol ?? ''),
        r.quantity ?? '',
        r.amount.toFixed(2),
      ].join(',');
    })
    .join('\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader(
    'Content-Disposition',
    `attachment; filename="finto-islemler-${new Date().toISOString().slice(0, 10)}.csv"`,
  );
  // UTF-8 BOM — Excel'in Türkçe karakterleri doğru okuması için.
  res.send('﻿' + header + body + '\n');
});

export default router;
