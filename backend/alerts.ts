import { Router, Request, Response } from 'express';
import { v4 as uuidv4 } from 'uuid';
import db from './db.ts';
import { requireAuth } from './auth.ts';

const router = Router();

type AuthedReq = Request & { user: { id: string } };

type AlertRow = {
  id: string;
  user_id: string;
  symbol: string;
  direction: 'above' | 'below';
  target_price: number;
  active: number;
  triggered_at: number | null;
  created_at: number;
};

type AlertOut = {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  targetPrice: number;
  active: boolean;
  triggeredAt: number | null;
  createdAt: number;
};

function toOut(r: AlertRow): AlertOut {
  return {
    id: r.id,
    symbol: r.symbol,
    direction: r.direction,
    targetPrice: r.target_price,
    active: !!r.active,
    triggeredAt: r.triggered_at,
    createdAt: r.created_at,
  };
}

// GET /api/alerts — kullanıcının tüm alarmları
router.get('/', requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedReq).user.id;
  const rows = db.prepare(
    'SELECT * FROM alerts WHERE user_id = ? ORDER BY active DESC, created_at DESC',
  ).all(userId) as AlertRow[];
  return res.json({ alerts: rows.map(toOut) });
});

// POST /api/alerts — yeni alarm
router.post('/', requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedReq).user.id;
  const { symbol, direction, targetPrice } = req.body as {
    symbol?: string;
    direction?: string;
    targetPrice?: number;
  };
  if (!symbol || typeof symbol !== 'string') {
    return res.status(400).json({ error: 'Sembol zorunlu.' });
  }
  if (direction !== 'above' && direction !== 'below') {
    return res.status(400).json({ error: 'direction "above" veya "below" olmalı.' });
  }
  if (typeof targetPrice !== 'number' || !Number.isFinite(targetPrice) || targetPrice <= 0) {
    return res.status(400).json({ error: 'Geçerli bir hedef fiyat girin.' });
  }

  const id = uuidv4();
  db.prepare(
    'INSERT INTO alerts (id, user_id, symbol, direction, target_price) VALUES (?, ?, ?, ?, ?)',
  ).run(id, userId, symbol.toUpperCase(), direction, targetPrice);

  const row = db.prepare('SELECT * FROM alerts WHERE id = ?').get(id) as AlertRow;
  return res.json({ alert: toOut(row) });
});

// POST /api/alerts/:id/trigger — alarm tetiklendiğinde frontend bildirir
router.post('/:id/trigger', requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedReq).user.id;
  const id = req.params.id;
  const row = db.prepare('SELECT * FROM alerts WHERE id = ? AND user_id = ?').get(id, userId) as
    | AlertRow
    | undefined;
  if (!row) return res.status(404).json({ error: 'Alarm bulunamadı.' });
  db.prepare('UPDATE alerts SET active = 0, triggered_at = unixepoch() WHERE id = ?').run(id);
  return res.json({ ok: true });
});

// DELETE /api/alerts/:id
router.delete('/:id', requireAuth, (req: Request, res: Response) => {
  const userId = (req as AuthedReq).user.id;
  const id = req.params.id;
  const r = db.prepare('DELETE FROM alerts WHERE id = ? AND user_id = ?').run(id, userId);
  if (r.changes === 0) return res.status(404).json({ error: 'Alarm bulunamadı.' });
  return res.json({ ok: true });
});

export default router;
