import { useAuth } from '../contexts/AuthContext.tsx';
import { Link, useNavigate } from 'react-router-dom';
import { ArrowRight, Laptop, Lock, LogOut, Plus, ShieldCheck, Wallet } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useAnnouncer } from '../hooks/useAnnouncer.tsx';
import { APP_EVENTS } from '../hooks/appEvents';
import {
  formatShortcut,
  type ShortcutActionId,
  type ShortcutMap,
  type ShortcutSpec,
} from '../hooks/accessibilityConfig';

type Transaction = {
  id: string;
  type: 'buy' | 'sell' | 'deposit' | 'withdraw';
  amount: number;
  createdAt: string;
  symbol?: string;
  quantity?: number;
};

type ProfileProps = {
  cashBalance: number;
  holdingsValue: number;
  totalBalance: number;
  registeredCount: number;
  holdingsCount: number;
  transactions: Transaction[];
  onDepositCash: (amount: number) => Promise<{ ok: boolean; message: string }>;
  onWithdrawCash: (amount: number) => Promise<{ ok: boolean; message: string }>;
  conciseMode: boolean;
  onConciseModeChange: (value: boolean) => void;
  shortcuts: ShortcutMap;
  onShortcutChange: (actionId: ShortcutActionId, value: ShortcutSpec) => void;
  onShortcutReset: () => void;
  onRestartOnboarding: () => void;
};

const fmt = (n: number) =>
  n.toLocaleString('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 2 });

const txTypeText: Record<Transaction['type'], string> = {
  buy: 'Hisse Alımı',
  sell: 'Hisse Satışı',
  deposit: 'Para Ekleme',
  withdraw: 'Para Çekme',
};

export default function Profile({
  cashBalance,
  holdingsValue,
  totalBalance,
  registeredCount,
  holdingsCount,
  transactions,
  onDepositCash,
  onWithdrawCash,
  conciseMode,
  onConciseModeChange,
  shortcuts,
  onShortcutChange,
  onShortcutReset,
  onRestartOnboarding,
}: ProfileProps) {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();
  const [depositInput, setDepositInput] = useState('');
  const [withdrawInput, setWithdrawInput] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newPasswordAgain, setNewPasswordAgain] = useState('');
  const [showSecurityDetails, setShowSecurityDetails] = useState(false);
  const [showAccessibilitySettings, setShowAccessibilitySettings] = useState(false);
  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);
  const [depositError, setDepositError] = useState<string | null>(null);
  const [withdrawError, setWithdrawError] = useState<string | null>(null);
  const feedbackTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function handleSignOut() {
    await signOut();
    navigate('/');
  }

  const { announce } = useAnnouncer();

  function showFeedback(type: 'success' | 'error', text: string) {
    if (feedbackTimer.current) clearTimeout(feedbackTimer.current);
    setFeedback({ type, text });
    announce(text, type === 'error' ? 'assertive' : 'polite');
    feedbackTimer.current = setTimeout(() => setFeedback(null), 3200);
  }

  async function handleDepositSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const amount = Number(depositInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      const message = 'Geçerli bir tutar girin.';
      setDepositError(message);
      showFeedback('error', message);
      return;
    }
    setDepositError(null);
    const result = await onDepositCash(amount);
    showFeedback(result.ok ? 'success' : 'error', result.message);
    if (result.ok) setDepositInput('');
  }

  async function handleWithdrawSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    const amount = Number(withdrawInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      const message = 'Geçerli bir tutar girin.';
      setWithdrawError(message);
      showFeedback('error', message);
      return;
    }
    setWithdrawError(null);
    const result = await onWithdrawCash(amount);
    showFeedback(result.ok ? 'success' : 'error', result.message);
    if (result.ok) setWithdrawInput('');
  }

  const recentTransactions = useMemo(() => transactions.slice(0, 8), [transactions]);
  const currentSession = useMemo(() => {
    const userAgent = typeof navigator !== 'undefined' ? navigator.userAgent : '';
    if (/Windows/i.test(userAgent)) return 'Windows';
    if (/Macintosh|Mac OS/i.test(userAgent)) return 'macOS';
    if (/Android/i.test(userAgent)) return 'Android';
    if (/iPhone|iPad|iOS/i.test(userAgent)) return 'iOS';
    return 'Web';
  }, []);

  function handleChangePasswordSubmit(e: { preventDefault(): void }) {
    e.preventDefault();
    if (!currentPassword || !newPassword || !newPasswordAgain) {
      showFeedback('error', 'Tum sifre alanlarini doldurun.');
      return;
    }
    if (newPassword.length < 8) {
      showFeedback('error', 'Yeni sifre en az 8 karakter olmali.');
      return;
    }
    if (newPassword !== newPasswordAgain) {
      showFeedback('error', 'Yeni sifre tekrar alani eslesmiyor.');
      return;
    }
    showFeedback('success', 'Sifre degistirme API baglantisi bir sonraki adimda aktif edilecek.');
    setCurrentPassword('');
    setNewPassword('');
    setNewPasswordAgain('');
  }

  function parseShortcutInput(input: string): ShortcutSpec | null {
    const tokens = input
      .split('+')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean);
    if (tokens.length === 0) return null;
    const key = tokens[tokens.length - 1];
    if (!key) return null;
    return {
      key: key.length === 1 ? key : key === 'esc' ? 'Escape' : key,
      alt: tokens.includes('alt'),
      shift: tokens.includes('shift'),
      ctrl: tokens.includes('ctrl'),
      meta: tokens.includes('meta'),
    };
  }

  if (!user) {
    return (
      <div className="p-6 text-center text-slate-500 dark:text-slate-400">
        <p className="font-semibold">Giriş yapılmamış.</p>
      </div>
    );
  }

  const initials = user.name
    ? user.name.split(' ').map((w) => w[0]).join('').toUpperCase().slice(0, 2)
    : user.email.charAt(0).toUpperCase();

  return (
    <div className="p-4 md:p-6 max-w-2xl mx-auto flex flex-col gap-5" id="page-content" data-page="profile">
      <div>
        <p className="text-[11px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 mb-1">Hesap</p>
        <h1 className="text-3xl font-black text-slate-900 dark:text-white tracking-tight">Profilim</h1>
      </div>

      <div className="bg-white dark:bg-slate-800 border-2 border-slate-100 dark:border-slate-700 rounded-2xl p-6 flex items-center gap-4">
        <div className="w-16 h-16 rounded-full bg-blue-600 flex items-center justify-center font-black text-xl text-white flex-shrink-0">
          {initials}
        </div>
        <div className="min-w-0">
          <p className="font-black text-lg text-slate-900 dark:text-white truncate">{user.name ?? 'Kullanıcı'}</p>
          <p className="text-sm text-slate-500 dark:text-slate-400 truncate">{user.email}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <div className="bg-blue-900 rounded-2xl p-4 col-span-2">
          <p className="text-[10px] uppercase tracking-widest font-black text-blue-200">Toplam Varlık</p>
          <p className="text-2xl font-black text-white mt-1">{fmt(totalBalance)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Nakit</p>
          <p className="text-lg font-black text-blue-700 dark:text-blue-300 mt-1">{fmt(cashBalance)}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Hisse</p>
          <p className="text-lg font-black text-slate-900 dark:text-white mt-1">{fmt(holdingsValue)}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Kayitli Hisse</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{registeredCount}</p>
        </div>
        <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Toplam Lot</p>
          <p className="text-xl font-black text-slate-900 dark:text-white mt-1">{holdingsCount}</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-3">
        <form
          onSubmit={handleDepositSubmit}
          aria-labelledby="profile-deposit-title"
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2"
        >
          <h2 id="profile-deposit-title" className="text-[10px] uppercase tracking-widest font-black text-slate-400">Ana Bakiyeye Para Ekle</h2>
          <label htmlFor="profile-deposit-amount" className="sr-only">Eklenecek tutar (TL)</label>
          <input
            id="profile-deposit-amount"
            type="number"
            min="1"
            step="0.01"
            value={depositInput}
            onChange={(e) => setDepositInput(e.target.value)}
            placeholder="Tutar (TL)"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
            aria-invalid={!!depositError}
            aria-describedby={depositError ? 'profile-deposit-error' : undefined}
          />
          {depositError && <p id="profile-deposit-error" className="text-xs font-bold text-red-600 dark:text-red-400">{depositError}</p>}
          <button className="w-full py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black text-sm transition-colors">
            Para Ekle
          </button>
        </form>

        <form
          onSubmit={handleWithdrawSubmit}
          aria-labelledby="profile-withdraw-title"
          className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl p-4 space-y-2"
        >
          <h2 id="profile-withdraw-title" className="text-[10px] uppercase tracking-widest font-black text-slate-400">Ana Bakiyeden Para Cek</h2>
          <label htmlFor="profile-withdraw-amount" className="sr-only">Çekilecek tutar (TL)</label>
          <input
            id="profile-withdraw-amount"
            type="number"
            min="1"
            step="0.01"
            value={withdrawInput}
            onChange={(e) => setWithdrawInput(e.target.value)}
            placeholder="Tutar (TL)"
            className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
            aria-invalid={!!withdrawError}
            aria-describedby={withdrawError ? 'profile-withdraw-error' : undefined}
          />
          {withdrawError && <p id="profile-withdraw-error" className="text-xs font-bold text-red-600 dark:text-red-400">{withdrawError}</p>}
          <button className="w-full py-2.5 rounded-xl bg-slate-800 dark:bg-slate-700 hover:bg-slate-700 dark:hover:bg-slate-600 text-white font-black text-sm transition-colors">
            Para Cek
          </button>
        </form>
      </div>

      <div className="flex items-center gap-3">
        <Link
          to="/portfolio"
          className="flex items-center justify-center gap-2 flex-1 py-3 bg-blue-700 hover:bg-blue-800 text-white rounded-2xl font-black text-sm transition-colors"
        >
          <Wallet size={16} />
          Portfoyume Git
          <ArrowRight size={14} />
        </Link>
        <button
          onClick={() => setDepositInput((prev) => prev || '1000')}
          className="px-4 py-3 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm transition-colors"
          type="button"
        >
          <span className="inline-flex items-center gap-2">
            <Plus size={14} />
            Hızlı Ekle
          </span>
        </button>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Guvenlik</p>
          <span className="inline-flex items-center gap-1 text-xs font-black text-emerald-600 dark:text-emerald-400">
            <ShieldCheck size={13} />
            Hesap Korumasi
          </span>
        </div>

        <div className="p-4 space-y-3">
          <div className="grid md:grid-cols-2 gap-2.5">
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
              <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1">Son Giris</p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{new Date().toLocaleString('tr-TR')}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">Bu oturumda aktif.</p>
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
              <p className="text-[10px] uppercase tracking-widest font-black text-slate-400 mb-1 flex items-center gap-1">
                <Laptop size={12} />
                Aktif Cihaz
              </p>
              <p className="text-sm font-black text-slate-900 dark:text-white">{currentSession}</p>
              <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">IP ve cihaz listesi API ile genisletilecek.</p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowSecurityDetails((prev) => !prev)}
            className="w-full md:w-auto px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm transition-colors"
          >
            {showSecurityDetails ? 'Guvenlik Detaylarini Gizle' : 'Guvenlik Detaylarini Ac'}
          </button>

          {showSecurityDetails && (
            <form onSubmit={handleChangePasswordSubmit} className="space-y-2.5 pt-1" aria-labelledby="change-pwd-title">
              <h3 id="change-pwd-title" className="text-sm font-black text-slate-900 dark:text-white flex items-center gap-2">
                <Lock size={15} aria-hidden="true" />
                Sifre Guncelle
              </h3>
              <label htmlFor="current-pwd" className="sr-only">Mevcut şifre</label>
              <input
                id="current-pwd"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Mevcut sifre"
                autoComplete="current-password"
                className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
              />
              <div className="grid md:grid-cols-2 gap-2.5">
                <label htmlFor="new-pwd" className="sr-only">Yeni şifre</label>
                <input
                  id="new-pwd"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="Yeni sifre"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                />
                <label htmlFor="new-pwd-repeat" className="sr-only">Yeni şifre tekrar</label>
                <input
                  id="new-pwd-repeat"
                  type="password"
                  value={newPasswordAgain}
                  onChange={(e) => setNewPasswordAgain(e.target.value)}
                  placeholder="Yeni sifre (tekrar)"
                  autoComplete="new-password"
                  className="w-full rounded-xl border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-3 py-2 text-sm font-semibold"
                />
              </div>
              <button className="w-full md:w-auto px-4 py-2.5 rounded-xl bg-slate-900 dark:bg-slate-700 hover:bg-slate-800 dark:hover:bg-slate-600 text-white font-black text-sm transition-colors">
                Sifreyi Guncelle
              </button>
            </form>
          )}
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Erisilebilirlik</p>
          <button
            type="button"
            onClick={() => setShowAccessibilitySettings((prev) => !prev)}
            className="text-xs font-black text-blue-700 dark:text-blue-300 hover:underline"
          >
            {showAccessibilitySettings ? 'Gizle' : 'Ayarlar'}
          </button>
        </div>
        {showAccessibilitySettings && (
          <div className="p-4 space-y-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-black text-slate-800 dark:text-slate-200">Kısa ve net metin modu</p>
              <button
                type="button"
                role="switch"
                aria-checked={conciseMode}
                onClick={() => onConciseModeChange(!conciseMode)}
                className={`w-10 h-5 rounded-full transition-colors relative ${conciseMode ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'}`}
              >
                <span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform ${conciseMode ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-black uppercase tracking-widest text-slate-400">
                Kısayol Özelleştirme (örn: Alt+K)
              </p>
              {(Object.keys(shortcuts) as ShortcutActionId[]).map((actionId) => (
                <div key={actionId} className="grid grid-cols-2 gap-2 items-center">
                  <label htmlFor={`shortcut-${actionId}`} className="text-xs font-semibold text-slate-600 dark:text-slate-300">
                    {actionId}
                  </label>
                  <input
                    id={`shortcut-${actionId}`}
                    defaultValue={formatShortcut(shortcuts[actionId])}
                    onBlur={(e) => {
                      const parsed = parseShortcutInput(e.target.value);
                      if (!parsed) {
                        e.target.value = formatShortcut(shortcuts[actionId]);
                        return;
                      }
                      onShortcutChange(actionId, parsed);
                      e.target.value = formatShortcut(parsed);
                    }}
                    className="rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1.5 text-xs font-semibold text-slate-900 dark:text-white"
                  />
                </div>
              ))}
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={onShortcutReset}
                  className="px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 hover:bg-slate-100 dark:hover:bg-slate-800 text-xs font-black text-slate-700 dark:text-slate-200"
                >
                  Kısayolları Sıfırla
                </button>
                <button
                  type="button"
                  onClick={() => {
                    onRestartOnboarding();
                    window.dispatchEvent(new CustomEvent(APP_EVENTS.onboardingRestart));
                    showFeedback('success', 'Erişilebilirlik turu tekrar başlatıldı.');
                  }}
                  className="px-3 py-2 rounded-xl bg-blue-700 hover:bg-blue-800 text-white text-xs font-black"
                >
                  Onboarding'i Tekrar Aç
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
        <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
          <p className="text-[10px] uppercase tracking-widest font-black text-slate-400">Son Islemler</p>
        </div>
        <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
          {recentTransactions.length === 0 && (
            <p className="px-4 py-4 text-sm font-semibold text-slate-400">Henuz bir islem kaydi yok.</p>
          )}
          {recentTransactions.map((tx) => {
            const isPositive = tx.type === 'sell' || tx.type === 'deposit';
            return (
              <div key={tx.id} className="px-4 py-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-black text-slate-900 dark:text-white">{txTypeText[tx.type]}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {tx.symbol ? `${tx.symbol} ${tx.quantity ?? 0} lot · ` : ''}
                    {new Date(tx.createdAt).toLocaleString('tr-TR')}
                  </p>
                </div>
                <p className={`text-sm font-black ${isPositive ? 'text-green-600' : 'text-red-500'}`}>
                  {isPositive ? '+' : '-'}{fmt(tx.amount)}
                </p>
              </div>
            );
          })}
        </div>
      </div>

      {feedback && (
        <div className={`px-4 py-3 rounded-xl text-sm font-bold border ${
          feedback.type === 'success'
            ? 'text-green-700 bg-green-50 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
            : 'text-red-600 bg-red-50 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
        }`}>
          {feedback.text}
        </div>
      )}

      <button
        onClick={handleSignOut}
        className="flex items-center justify-center gap-2 w-full py-3 bg-red-50 dark:bg-red-900/20 hover:bg-red-100 dark:hover:bg-red-900/40 text-red-600 dark:text-red-400 border-2 border-red-200 dark:border-red-800 rounded-2xl font-black text-sm transition-colors"
      >
        <LogOut size={16} />
        Çıkış Yap
      </button>
    </div>
  );
}
