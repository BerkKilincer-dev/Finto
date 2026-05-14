import { useEffect, useRef, useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';
import { useAnnouncer } from '../hooks/useAnnouncer.tsx';
import { APP_EVENTS } from '../hooks/appEvents';

type Props = { onClose: () => void };

export default function AuthModal({ onClose }: Props) {
  const { login, register } = useAuth();
  const { announce } = useAnnouncer();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const dialogRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  const initialFocusRef = useRef<HTMLElement | null>(null);

  const inputCls = 'w-full rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2.5 font-semibold text-sm focus:outline-none focus:border-blue-500 transition-colors';
  const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5';

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');

    if (tab === 'register') {
      if (!name.trim()) { setError('Ad alanı zorunludur.'); announce('Ad alanı zorunludur.', 'assertive'); return; }
      if (password !== confirm) { setError('Şifreler eşleşmiyor.'); announce('Şifreler eşleşmiyor.', 'assertive'); return; }
      if (password.length < 6) { setError('Şifre en az 6 karakter olmalıdır.'); announce('Şifre en az 6 karakter olmalıdır.', 'assertive'); return; }
    }

    setLoading(true);
    try {
      if (tab === 'login') await login(email, password);
      else await register(name, email, password);
      onClose();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Bir hata oluştu.';
      setError(message);
      announce(message, 'assertive');
    } finally {
      setLoading(false);
    }
  }

  const titleId = 'auth-modal-title';
  const errorId = 'auth-modal-error';

  useEffect(() => {
    initialFocusRef.current = document.activeElement as HTMLElement | null;
    closeButtonRef.current?.focus();
    announce('Kimlik doğrulama penceresi açıldı.', 'polite');
    return () => {
      initialFocusRef.current?.focus?.();
    };
  }, [announce]);

  useEffect(() => {
    announce(tab === 'login' ? 'Giriş sekmesi aktif.' : 'Kayıt sekmesi aktif.', 'polite');
  }, [tab, announce]);

  useEffect(() => {
    function onLayerCloseTop() {
      onClose();
    }
    window.addEventListener(APP_EVENTS.layerCloseTop, onLayerCloseTop);
    return () => window.removeEventListener(APP_EVENTS.layerCloseTop, onLayerCloseTop);
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    const focusables = dialog.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    function onKeyDown(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
        return;
      }
      if (e.key !== 'Tab' || focusables.length === 0) return;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    dialog.addEventListener('keydown', onKeyDown);
    return () => dialog.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={error ? errorId : undefined}
        className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden"
      >
        <h2 id={titleId} className="sr-only">
          {tab === 'login' ? 'Giriş yap' : 'Yeni hesap oluştur'}
        </h2>

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <div role="tablist" aria-label="Hesap eylemi" className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
            <button
              role="tab"
              aria-selected={tab === 'login'}
              onClick={() => { setTab('login'); setError(''); announce('Giriş sekmesi seçildi.', 'polite'); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-black transition-colors ${tab === 'login' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Giriş Yap
            </button>
            <button
              role="tab"
              aria-selected={tab === 'register'}
              onClick={() => { setTab('register'); setError(''); announce('Kayıt sekmesi seçildi.', 'polite'); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-black transition-colors ${tab === 'register' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Kayıt Ol
            </button>
          </div>
          <button ref={closeButtonRef} onClick={onClose} aria-label="Kapat" className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            <X size={18} aria-hidden="true" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {tab === 'register' && (
            <div>
              <label htmlFor="auth-name" className={labelCls}>Ad Soyad</label>
              <input
                id="auth-name"
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Adınız"
                className={inputCls}
                autoComplete="name"
                aria-invalid={tab === 'register' && !name.trim() && !!error}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
          )}

          <div>
            <label htmlFor="auth-email" className={labelCls}>Email</label>
            <input
              id="auth-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@email.com"
              className={inputCls}
              autoComplete="email"
              required
              aria-invalid={!!error}
              aria-describedby={error ? errorId : undefined}
            />
          </div>

          <div>
            <label htmlFor="auth-password" className={labelCls}>Şifre</label>
            <div className="relative">
              <input
                id="auth-password"
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'register' ? 'En az 6 karakter' : 'Şifreniz'}
                className={`${inputCls} pr-10`}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                required
                aria-invalid={!!error}
                aria-describedby={error ? errorId : undefined}
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                aria-label={showPass ? 'Şifreyi gizle' : 'Şifreyi göster'}
                aria-pressed={showPass}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showPass ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}
              </button>
            </div>
          </div>

          {tab === 'register' && (
            <div>
              <label htmlFor="auth-password-confirm" className={labelCls}>Şifre Tekrar</label>
              <input
                id="auth-password-confirm"
                type={showPass ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Şifrenizi tekrar girin"
                className={inputCls}
                autoComplete="new-password"
                aria-invalid={tab === 'register' && !!error}
                aria-describedby={error ? errorId : undefined}
              />
            </div>
          )}

          {error && (
            <p id={errorId} role="alert" className="text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white rounded-xl font-black text-sm transition-colors"
          >
            {loading ? 'Lütfen bekleyin...' : tab === 'login' ? 'Giriş Yap' : 'Hesap Oluştur'}
          </button>
        </form>
      </div>
    </div>
  );
}
