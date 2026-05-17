import { useEffect, useRef } from 'react';
import { getGlobalHint, matchesShortcut, type ShortcutMap } from './accessibilityConfig';

export type ShortcutHandlers = {
  onToggleAssistant?: () => void;
  onStartListening?: () => void;
  onCloseTopLayer?: () => void;
  onOpenCommandPalette?: () => void;
  /** Sesli "sayfayı oku" eşdeğeri */
  onReadPage?: () => void;
  /** Erişilebilir mod aç/kapat */
  onToggleAccessibleMode?: () => void;
  /** Tüm erişilebilirlik özelliklerini sesli tanıt */
  onAnnounceFeatures?: () => void;
};

/**
 * Global klavye kısayolları. Görme engelli kullanıcıların fare olmadan
 * tüm temel akışı çalıştırabilmesi için tasarlandı.
 *
 * - Alt+A: asistan paneli aç/kapat
 * - Alt+M: mikrofonu açıp dinlemeye başla
 * - Alt+O: aktif sayfanın içeriğini sesli okut ("oku")
 * - Alt+K: komut paletini aç
 * - Alt+T: tüm özellikleri sesli tanıt
 * - Escape: en üstteki modal/panel kapat
 * - Shift+? : kısayolları sesli duyur
 */
export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  shortcuts: ShortcutMap,
  announce?: (msg: string) => void,
) {
  const handlersRef = useRef(handlers);
  const shortcutsRef = useRef(shortcuts);
  const announceRef = useRef(announce);

  useEffect(() => {
    handlersRef.current = handlers;
  }, [handlers]);

  useEffect(() => {
    shortcutsRef.current = shortcuts;
  }, [shortcuts]);

  useEffect(() => {
    announceRef.current = announce;
  }, [announce]);

  useEffect(() => {
    function isTypingInField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    }

    function handler(e: KeyboardEvent) {
      const currentHandlers = handlersRef.current;
      const currentShortcuts = shortcutsRef.current;
      const currentAnnounce = announceRef.current;

      // Form alanında yazarken kısayolları devre dışı bırak (Alt'lı olanlar hariç).
      const typing = isTypingInField(e.target);

      if (matchesShortcut(e, currentShortcuts.toggleAssistant)) {
        e.preventDefault();
        currentHandlers.onToggleAssistant?.();
        currentAnnounce?.('Asistan paneli');
        return;
      }
      if (matchesShortcut(e, currentShortcuts.startListening)) {
        e.preventDefault();
        currentHandlers.onStartListening?.();
        currentAnnounce?.('Mikrofon');
        return;
      }
      if (matchesShortcut(e, currentShortcuts.readPage)) {
        e.preventDefault();
        currentHandlers.onReadPage?.();
        return;
      }
      if (matchesShortcut(e, currentShortcuts.openCommandPalette)) {
        e.preventDefault();
        currentHandlers.onOpenCommandPalette?.();
        currentAnnounce?.('Komut paleti');
        return;
      }
      if (matchesShortcut(e, currentShortcuts.toggleAccessibleMode)) {
        e.preventDefault();
        currentHandlers.onToggleAccessibleMode?.();
        return;
      }
      if (matchesShortcut(e, currentShortcuts.announceFeatures)) {
        e.preventDefault();
        currentHandlers.onAnnounceFeatures?.();
        return;
      }

      // Form alanındaysak diğerlerini yutma.
      if (typing) return;

      // Escape: en üstteki layer
      if (matchesShortcut(e, currentShortcuts.closeTopLayer)) {
        currentHandlers.onCloseTopLayer?.();
        return;
      }

      // Shift+? : kısayol listesi
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        currentAnnounce?.(getGlobalHint(currentShortcuts));
        return;
      }
    }

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, []);
}
