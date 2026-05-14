import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from './db.ts';

const router = Router();

const IS_PROD = process.env.NODE_ENV === 'production';

function resolveJwtSecret(): string {
  const raw = process.env.JWT_SECRET;
  if (raw && raw.length >= 32) return raw;
  if (IS_PROD) {
    throw new Error(
      'JWT_SECRET tanımlı değil veya 32 karakterden kısa. Üretim ortamında güçlü bir secret zorunludur.',
    );
  }
  // Sadece local geliştirme için makine başına sabit bir uyarı secret'ı.
  console.warn('[auth] JWT_SECRET tanımsız ya da kısa; geliştirme amaçlı geçici secret kullanılıyor.');
  return 'finto-dev-secret-DO-NOT-USE-IN-PRODUCTION-0123456789';
}

const JWT_SECRET = resolveJwtSecret();

type UserRow = { id: string; email: string; name: string | null; password_hash: string };
type SafeUser = { id: string; email: string; name: string | null };

function setAuthCookie(res: Response, user: SafeUser) {
  const token = jwt.sign(user, JWT_SECRET, { expiresIn: '30d' });
  res.cookie('finto_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
    maxAge: 30 * 24 * 60 * 60 * 1000,
  });
}

export function requireAuth(
  req: Request,
  res: Response,
  next: () => void,
): void {
  const token = req.cookies?.finto_token as string | undefined;
  if (!token) {
    res.status(401).json({ error: 'Oturum gerekli.' });
    return;
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SafeUser;
    (req as Request & { user: SafeUser }).user = decoded;
    next();
  } catch {
    res.status(401).json({ error: 'Geçersiz oturum.' });
  }
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const { name, email, password } = req.body as { name?: string; email?: string; password?: string };

  if (!email || !password) return res.status(400).json({ error: 'Email ve şifre zorunludur.' });
  if (password.length < 6) return res.status(400).json({ error: 'Şifre en az 6 karakter olmalıdır.' });

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(email);
  if (existing) return res.status(409).json({ error: 'Bu email zaten kayıtlı.' });

  try {
    const passwordHash = await bcrypt.hash(password, 10);
    const id = uuidv4();
    const safeName = name?.trim() || null;

    db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)')
      .run(id, email.toLowerCase().trim(), safeName, passwordHash);

    const user: SafeUser = { id, email: email.toLowerCase().trim(), name: safeName };
    setAuthCookie(res, user);
    return res.json({ user });
  } catch (err) {
    console.error('Kayıt hatası:', err);
    return res.status(500).json({ error: 'Kayıt sırasında hata oluştu.' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const { email, password } = req.body as { email?: string; password?: string };

  if (!email || !password) return res.status(400).json({ error: 'Email ve şifre zorunludur.' });

  const row = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
    .get(email.toLowerCase().trim()) as UserRow | undefined;

  if (!row) return res.status(401).json({ error: 'Email veya şifre hatalı.' });

  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return res.status(401).json({ error: 'Email veya şifre hatalı.' });

  const user: SafeUser = { id: row.id, email: row.email, name: row.name };
  setAuthCookie(res, user);
  return res.json({ user });
});

// GET /api/auth/me
router.get('/me', (req: Request, res: Response) => {
  const token = req.cookies?.finto_token as string | undefined;
  if (!token) return res.status(401).json({ user: null });

  try {
    const decoded = jwt.verify(token, JWT_SECRET) as SafeUser;
    const row = db.prepare('SELECT id, email, name FROM users WHERE id = ?')
      .get(decoded.id) as SafeUser | undefined;
    if (!row) return res.status(401).json({ user: null });
    return res.json({ user: row });
  } catch {
    return res.status(401).json({ user: null });
  }
});

// POST /api/auth/logout
router.post('/logout', (_req: Request, res: Response) => {
  res.clearCookie('finto_token', {
    httpOnly: true,
    sameSite: 'lax',
    secure: IS_PROD,
  });
  return res.json({ ok: true });
});

export default router;
