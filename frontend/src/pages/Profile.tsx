import { useAuth } from '../contexts/AuthContext.tsx';
import { useNavigate } from 'react-router-dom';
import { LogOut } from 'lucide-react';

export default function Profile() {
  const { user, signOut } = useAuth();
  const navigate = useNavigate();

  async function handleSignOut() {
    await signOut();
    navigate('/');
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
    <div className="p-4 md:p-6 max-w-md mx-auto flex flex-col gap-5" id="main-content">
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
