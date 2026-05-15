import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

export type Locale = 'tr' | 'en';

type Dict = Record<string, string>;

const TR: Dict = {
  'nav.home': 'Ana Sayfa',
  'nav.portfolio': 'Portföyüm',
  'nav.profile': 'Profilim',
  'nav.compare': 'Karşılaştır',
  'auth.login': 'Giriş Yap',
  'auth.register': 'Kayıt Ol',
  'auth.demo': 'Hızlı Dene (Demo Hesap)',
  'auth.forgot': 'Şifremi unuttum',
  'common.search': 'Hisse ara (Aselsan, GARAN...)',
  'common.darkMode': 'Karanlık temaya geç',
  'common.lightMode': 'Aydınlık temaya geç',
  'common.lang': 'Dil',
};

const EN: Dict = {
  'nav.home': 'Home',
  'nav.portfolio': 'Portfolio',
  'nav.profile': 'Profile',
  'nav.compare': 'Compare',
  'auth.login': 'Sign In',
  'auth.register': 'Sign Up',
  'auth.demo': 'Try Demo Account',
  'auth.forgot': 'Forgot password',
  'common.search': 'Search ticker (Aselsan, GARAN...)',
  'common.darkMode': 'Switch to dark theme',
  'common.lightMode': 'Switch to light theme',
  'common.lang': 'Language',
};

const DICTS: Record<Locale, Dict> = { tr: TR, en: EN };

type I18nCtx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: string) => string;
};

const I18nContext = createContext<I18nCtx | null>(null);

const STORAGE_KEY = 'finto_locale';

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    if (typeof localStorage === 'undefined') return 'tr';
    const saved = localStorage.getItem(STORAGE_KEY) as Locale | null;
    return saved === 'en' || saved === 'tr' ? saved : 'tr';
  });

  useEffect(() => {
    document.documentElement.lang = locale === 'en' ? 'en' : 'tr';
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    localStorage.setItem(STORAGE_KEY, l);
  }, []);

  const t = useCallback(
    (key: string) => {
      const dict = DICTS[locale];
      return dict[key] ?? DICTS.tr[key] ?? key;
    },
    [locale],
  );

  const value = useMemo(() => ({ locale, setLocale, t }), [locale, setLocale, t]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nCtx {
  const ctx = useContext(I18nContext);
  if (!ctx) {
    // Provider yoksa Türkçe default — uygulamayı bozmaz.
    return {
      locale: 'tr',
      setLocale: () => {},
      t: (key) => TR[key] ?? key,
    };
  }
  return ctx;
}
