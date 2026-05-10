import { useState } from 'react';
import { X, Eye, EyeOff } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext.tsx';

type Props = { onClose: () => void };

export default function AuthModal({ onClose }: Props) {
  const { login, register } = useAuth();
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const inputCls = 'w-full rounded-xl border-2 border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-white px-3 py-2.5 font-semibold text-sm focus:outline-none focus:border-blue-500 transition-colors';
  const labelCls = 'block text-xs font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1.5';

  async function handleSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    setError('');

    if (tab === 'register') {
      if (!name.trim()) { setError('Ad alanı zorunludur.'); return; }
      if (password !== confirm) { setError('Şifreler eşleşmiyor.'); return; }
      if (password.length < 6) { setError('Şifre en az 6 karakter olmalıdır.'); return; }
    }

    setLoading(true);
    try {
      if (tab === 'login') await login(email, password);
      else await register(name, email, password);
      onClose();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Bir hata oluştu.');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm px-4">
      <div className="bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-2xl w-full max-w-sm shadow-2xl overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 dark:border-slate-700">
          <div className="flex gap-1 bg-slate-100 dark:bg-slate-700 rounded-xl p-1">
            <button
              onClick={() => { setTab('login'); setError(''); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-black transition-colors ${tab === 'login' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Giriş Yap
            </button>
            <button
              onClick={() => { setTab('register'); setError(''); }}
              className={`px-4 py-1.5 rounded-lg text-sm font-black transition-colors ${tab === 'register' ? 'bg-white dark:bg-slate-600 text-slate-900 dark:text-white shadow-sm' : 'text-slate-500 dark:text-slate-400'}`}
            >
              Kayıt Ol
            </button>
          </div>
          <button onClick={onClose} className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {tab === 'register' && (
            <div>
              <label className={labelCls}>Ad Soyad</label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Adınız"
                className={inputCls}
                autoComplete="name"
              />
            </div>
          )}

          <div>
            <label className={labelCls}>Email</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@email.com"
              className={inputCls}
              autoComplete="email"
              required
            />
          </div>

          <div>
            <label className={labelCls}>Şifre</label>
            <div className="relative">
              <input
                type={showPass ? 'text' : 'password'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder={tab === 'register' ? 'En az 6 karakter' : 'Şifreniz'}
                className={`${inputCls} pr-10`}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                required
              />
              <button
                type="button"
                onClick={() => setShowPass((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300"
              >
                {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </div>
          </div>

          {tab === 'register' && (
            <div>
              <label className={labelCls}>Şifre Tekrar</label>
              <input
                type={showPass ? 'text' : 'password'}
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                placeholder="Şifrenizi tekrar girin"
                className={inputCls}
                autoComplete="new-password"
              />
            </div>
          )}

          {error && (
            <p className="text-sm font-bold text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl px-3 py-2">
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
