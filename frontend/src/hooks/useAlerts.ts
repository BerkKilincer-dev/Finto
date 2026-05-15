import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useAnnouncer } from './useAnnouncer';
import { APP_EVENTS } from './appEvents';
import type { MarketStock } from './useStocksQuotes';

export type AlertItem = {
  id: string;
  symbol: string;
  direction: 'above' | 'below';
  targetPrice: number;
  active: boolean;
  triggeredAt: number | null;
  createdAt: number;
};

const LS_KEY = 'finto_alerts_local';

function loadLocal(): AlertItem[] {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return [];
    return JSON.parse(raw) as AlertItem[];
  } catch {
    return [];
  }
}

function saveLocal(alerts: AlertItem[]) {
  localStorage.setItem(LS_KEY, JSON.stringify(alerts));
}

/**
 * Alarm yönetimi: giriş yapmışsa server, değilse localStorage.
 * Tetikleme: stocks değiştikçe aktif alarmları kontrol et — koşulu sağlayanlara
 * Notification API + sesli anons + iç event dispatch.
 */
export function useAlerts(stocks: MarketStock[]) {
  const { user } = useAuth();
  const { announce } = useAnnouncer();
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(false);
  // İki kez tetiklememek için bu oturumda zaten tetiklenen id'leri tut.
  const firedRef = useRef<Set<string>>(new Set());

  // İlk yüklemede notification izni iste (kullanıcı isterse engelleyebilir).
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!('Notification' in window)) return;
    if (Notification.permission === 'default') {
      // İlk etkileşim sonrası izin isteyelim; sayfa açar açmaz pop-up rahatsız edici.
      const onceClick = () => {
        Notification.requestPermission().catch(() => {});
        window.removeEventListener('click', onceClick);
      };
      window.addEventListener('click', onceClick, { once: true });
      return () => window.removeEventListener('click', onceClick);
    }
  }, []);

  const refresh = useCallback(async () => {
    if (!user) {
      setAlerts(loadLocal());
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/alerts', { credentials: 'include' });
      if (res.ok) {
        const data = (await res.json()) as { alerts: AlertItem[] };
        setAlerts(data.alerts ?? []);
      }
    } catch {
      // sessizce geç
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createAlert = useCallback(
    async (symbol: string, direction: 'above' | 'below', targetPrice: number): Promise<AlertItem | null> => {
      if (!user) {
        const item: AlertItem = {
          id: `local-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
          symbol: symbol.toUpperCase(),
          direction,
          targetPrice,
          active: true,
          triggeredAt: null,
          createdAt: Math.floor(Date.now() / 1000),
        };
        const next = [item, ...loadLocal()];
        saveLocal(next);
        setAlerts(next);
        return item;
      }
      try {
        const res = await fetch('/api/alerts', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbol, direction, targetPrice }),
        });
        if (!res.ok) return null;
        const data = (await res.json()) as { alert: AlertItem };
        setAlerts((prev) => [data.alert, ...prev]);
        return data.alert;
      } catch {
        return null;
      }
    },
    [user],
  );

  const deleteAlert = useCallback(
    async (id: string) => {
      if (!user) {
        const next = loadLocal().filter((a) => a.id !== id);
        saveLocal(next);
        setAlerts(next);
        return;
      }
      try {
        await fetch(`/api/alerts/${id}`, { method: 'DELETE', credentials: 'include' });
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      } catch {
        // sessiz
      }
    },
    [user],
  );

  // Tetikleme: her stocks güncellemesinde aktif alarmları tara.
  useEffect(() => {
    if (alerts.length === 0 || stocks.length === 0) return;
    const triggered: AlertItem[] = [];
    for (const a of alerts) {
      if (!a.active) continue;
      if (firedRef.current.has(a.id)) continue;
      const stock = stocks.find((s) => s.symbol === a.symbol);
      if (!stock) continue;
      const hit =
        (a.direction === 'above' && stock.price >= a.targetPrice) ||
        (a.direction === 'below' && stock.price <= a.targetPrice);
      if (hit) triggered.push(a);
    }

    if (triggered.length === 0) return;

    triggered.forEach((a) => {
      firedRef.current.add(a.id);
      const dirText = a.direction === 'above' ? "üstüne çıktı" : "altına indi";
      const message = `${a.symbol} hedef fiyatı ${a.targetPrice} ${dirText}.`;
      announce(`Alarm: ${message}`, 'assertive');
      window.dispatchEvent(
        new CustomEvent(APP_EVENTS.assistantSpeak, { detail: { text: `Alarm: ${message}` } }),
      );
      if (typeof window !== 'undefined' && 'Notification' in window && Notification.permission === 'granted') {
        try {
          new Notification('Finto Alarm', { body: message });
        } catch {
          // bazı tarayıcılar service worker olmadan reddeder
        }
      }
      if (user) {
        fetch(`/api/alerts/${a.id}/trigger`, { method: 'POST', credentials: 'include' }).catch(() => {});
      } else {
        const next = loadLocal().map((x) =>
          x.id === a.id ? { ...x, active: false, triggeredAt: Math.floor(Date.now() / 1000) } : x,
        );
        saveLocal(next);
      }
    });

    // State'i taze tut (deaktive et)
    setAlerts((prev) =>
      prev.map((x) =>
        triggered.some((t) => t.id === x.id)
          ? { ...x, active: false, triggeredAt: Math.floor(Date.now() / 1000) }
          : x,
      ),
    );
  }, [alerts, stocks, announce, user]);

  return { alerts, loading, refresh, createAlert, deleteAlert };
}
