import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import rateLimit from 'express-rate-limit';
import crypto from 'crypto';
import db from './db.ts';

const router = Router();

const IS_PROD = process.env.NODE_ENV === 'production';

// Login brute force koruması: IP başına 15 dakikada en fazla 8 başarısız deneme.
const loginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 8,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: true,
  message: { error: 'Çok fazla başarısız giriş denemesi. 15 dakika sonra tekrar deneyin.' },
});

// Şifre sıfırlama isteği: IP başına saatte 5 (token enumeration / spam koruması).
const resetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla şifre sıfırlama isteği. Bir saat sonra tekrar deneyin.' },
});

/**
 * Şifre politikası: en az 10 karakter VE en az bir rakam içermeli.
 * Çok katı değil — kullanıcı dostu ama brute force'a karşı yeterli.
 */
function validatePassword(pw: string): string | null {
  if (pw.length < 10) return 'Şifre en az 10 karakter olmalıdır.';
  if (!/\d/.test(pw)) return 'Şifre en az bir rakam içermelidir.';
  return null;
}

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
  const pwError = validatePassword(password);
  if (pwError) return res.status(400).json({ error: pwError });

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

// POST /api/auth/login (brute force korumalı)
router.post('/login', loginLimiter, async (req: Request, res: Response) => {
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

// POST /api/auth/demo — anlık demo hesabı oluştur ve giriş yap.
// Demo hesaplar `demo+<id>@finto.local` formatında; ileride cron ile temizlenebilir.
const demoLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Çok fazla demo isteği. Bir saat sonra tekrar deneyin.' },
});

router.post('/demo', demoLimiter, async (req: Request, res: Response) => {
  try {
    const id = uuidv4();
    const email = `demo+${id.slice(0, 8)}@finto.local`;
    const name = 'Demo Kullanıcı';
    const password = crypto.randomBytes(16).toString('hex');
    const passwordHash = await bcrypt.hash(password, 10);

    const tx = db.transaction(() => {
      db.prepare('INSERT INTO users (id, email, name, password_hash) VALUES (?, ?, ?, ?)')
        .run(id, email, name, passwordHash);
      // Başlangıç bakiyesi (portfolios tablosundaki default 30000 zaten yeterli).
      db.prepare('INSERT INTO portfolios (user_id) VALUES (?)').run(id);
      // Birkaç favori sembolle başlasın ki kullanıcı boş ekran görmesin.
      db.prepare(
        'INSERT INTO preferences (user_id, registered_symbols, pinned_symbols) VALUES (?, ?, ?)',
      ).run(id, JSON.stringify(['GARAN', 'ASELS', 'THYAO']), JSON.stringify(['GARAN']));
    });
    tx();

    const user: SafeUser = { id, email, name };
    setAuthCookie(res, user);
    return res.json({ user, demo: true });
  } catch (err) {
    console.error('Demo hesap hatası:', err);
    return res.status(500).json({ error: 'Demo hesap oluşturulamadı.' });
  }
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

// POST /api/auth/change-password (oturum gerekli)
router.post('/change-password', requireAuth, async (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body as {
    currentPassword?: string;
    newPassword?: string;
  };
  const authedUser = (req as Request & { user: SafeUser }).user;

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Mevcut şifre ve yeni şifre zorunludur.' });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });
  if (currentPassword === newPassword) {
    return res.status(400).json({ error: 'Yeni şifre mevcut şifre ile aynı olamaz.' });
  }

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(authedUser.id) as { password_hash: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const match = await bcrypt.compare(currentPassword, row.password_hash);
  if (!match) return res.status(401).json({ error: 'Mevcut şifre hatalı.' });

  const newHash = await bcrypt.hash(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, authedUser.id);
  return res.json({ ok: true });
});

// POST /api/auth/delete-account (oturum gerekli, şifre teyidiyle)
router.post('/delete-account', requireAuth, async (req: Request, res: Response) => {
  const { password } = req.body as { password?: string };
  const authedUser = (req as Request & { user: SafeUser }).user;

  if (!password) return res.status(400).json({ error: 'Şifre teyidi zorunludur.' });

  const row = db.prepare('SELECT password_hash FROM users WHERE id = ?')
    .get(authedUser.id) as { password_hash: string } | undefined;
  if (!row) return res.status(404).json({ error: 'Kullanıcı bulunamadı.' });

  const match = await bcrypt.compare(password, row.password_hash);
  if (!match) return res.status(401).json({ error: 'Şifre hatalı.' });

  // CASCADE ile portfolios/holdings/transactions/preferences/password_resets siler.
  db.prepare('DELETE FROM users WHERE id = ?').run(authedUser.id);
  res.clearCookie('finto_token', { httpOnly: true, sameSite: 'lax', secure: IS_PROD });
  return res.json({ ok: true });
});

// POST /api/auth/forgot-password — token üretir; gerçek email servisi yok,
// production'da bu token kullanıcıya email ile gönderilmeli. Şimdilik dev için
// token'ı response'da dönüyoruz (DEV_RETURN_RESET_TOKEN=1 ise).
router.post('/forgot-password', resetLimiter, async (req: Request, res: Response) => {
  const { email } = req.body as { email?: string };
  if (!email) return res.status(400).json({ error: 'Email zorunludur.' });

  const row = db.prepare('SELECT id FROM users WHERE email = ?')
    .get(email.toLowerCase().trim()) as { id: string } | undefined;

  // Email varlığını sızdırmamak için her zaman ok dön.
  if (!row) return res.json({ ok: true });

  const token = crypto.randomBytes(32).toString('hex');
  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const expiresAt = Math.floor(Date.now() / 1000) + 60 * 60; // 1 saat

  db.prepare('INSERT INTO password_resets (token_hash, user_id, expires_at) VALUES (?, ?, ?)')
    .run(tokenHash, row.id, expiresAt);

  const devReturn = !IS_PROD || process.env.DEV_RETURN_RESET_TOKEN === '1';
  if (devReturn) {
    return res.json({ ok: true, devToken: token });
  }
  // TODO: production'da email service entegrasyonu — şimdilik sadece log.
  console.log(`[auth] Şifre sıfırlama token üretildi (user=${row.id}). Email gönderimi henüz aktif değil.`);
  return res.json({ ok: true });
});

// POST /api/auth/reset-password — token + yeni şifre.
router.post('/reset-password', async (req: Request, res: Response) => {
  const { token, newPassword } = req.body as { token?: string; newPassword?: string };
  if (!token || !newPassword) {
    return res.status(400).json({ error: 'Token ve yeni şifre zorunludur.' });
  }
  const pwError = validatePassword(newPassword);
  if (pwError) return res.status(400).json({ error: pwError });

  const tokenHash = crypto.createHash('sha256').update(token).digest('hex');
  const reset = db.prepare(
    'SELECT user_id, expires_at, used FROM password_resets WHERE token_hash = ?',
  ).get(tokenHash) as { user_id: string; expires_at: number; used: number } | undefined;

  if (!reset || reset.used || reset.expires_at < Math.floor(Date.now() / 1000)) {
    return res.status(400).json({ error: 'Geçersiz veya süresi dolmuş token.' });
  }

  const newHash = await bcrypt.hash(newPassword, 10);
  const tx = db.transaction(() => {
    db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(newHash, reset.user_id);
    db.prepare('UPDATE password_resets SET used = 1 WHERE token_hash = ?').run(tokenHash);
  });
  tx();
  return res.json({ ok: true });
});

export default router;
