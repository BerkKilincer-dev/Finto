import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
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
};

/**
 * Global klavye kısayolları. Görme engelli kullanıcıların fare olmadan
 * tüm temel akışı çalıştırabilmesi için tasarlandı.
 *
 * - Alt+A: asistan paneli aç/kapat
 * - Alt+M: mikrofonu açıp dinlemeye başla
 * - Alt+O: aktif sayfanın içeriğini sesli okut ("oku")
 * - Alt+K: komut paletini aç
 * - Escape: en üstteki modal/panel kapat
 * - Shift+G sonra H/P/R: ana sayfa / portföy / profil
 * - Shift+? : kısayolları sesli duyur
 */
export function useKeyboardShortcuts(
  handlers: ShortcutHandlers,
  shortcuts: ShortcutMap,
  announce?: (msg: string) => void,
) {
  const navigate = useNavigate();

  useEffect(() => {
    let gPrefixActive = false;
    let gPrefixTimer: ReturnType<typeof setTimeout> | null = null;

    function clearGPrefix() {
      gPrefixActive = false;
      if (gPrefixTimer) {
        clearTimeout(gPrefixTimer);
        gPrefixTimer = null;
      }
    }

    function isTypingInField(target: EventTarget | null): boolean {
      if (!(target instanceof HTMLElement)) return false;
      const tag = target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
      if (target.isContentEditable) return true;
      return false;
    }

    function handler(e: KeyboardEvent) {
      // Form alanında yazarken kısayolları devre dışı bırak (Alt'lı olanlar hariç).
      const typing = isTypingInField(e.target);

      if (matchesShortcut(e, shortcuts.toggleAssistant)) {
        e.preventDefault();
        handlers.onToggleAssistant?.();
        announce?.('Asistan paneli');
        return;
      }
      if (matchesShortcut(e, shortcuts.startListening)) {
        e.preventDefault();
        handlers.onStartListening?.();
        announce?.('Mikrofon');
        return;
      }
      if (matchesShortcut(e, shortcuts.readPage)) {
        e.preventDefault();
        handlers.onReadPage?.();
        return;
      }
      if (matchesShortcut(e, shortcuts.openCommandPalette)) {
        e.preventDefault();
        handlers.onOpenCommandPalette?.();
        announce?.('Komut paleti');
        return;
      }
      if (matchesShortcut(e, shortcuts.toggleAccessibleMode)) {
        e.preventDefault();
        handlers.onToggleAccessibleMode?.();
        return;
      }

      // Form alanındaysak diğerlerini yutma.
      if (typing) return;

      // Escape: en üstteki layer
      if (matchesShortcut(e, shortcuts.closeTopLayer)) {
        handlers.onCloseTopLayer?.();
        return;
      }

      // Shift+? : kısayol listesi
      if (e.key === '?' && e.shiftKey) {
        e.preventDefault();
        announce?.(getGlobalHint(shortcuts));
        return;
      }

      // g prefix navigasyon: Shift+G, sonra h/p/r
      if (e.key === 'G' && e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
        e.preventDefault();
        gPrefixActive = true;
        if (gPrefixTimer) clearTimeout(gPrefixTimer);
        gPrefixTimer = setTimeout(clearGPrefix, 1500);
        announce?.('Navigasyon: H ana sayfa, P portföy, R profil');
        return;
      }
      if (gPrefixActive) {
        const k = e.key.toLowerCase();
        if (k === 'h') {
          e.preventDefault();
          clearGPrefix();
          navigate('/');
          return;
        }
        if (k === 'p') {
          e.preventDefault();
          clearGPrefix();
          navigate('/portfolio');
          return;
        }
        if (k === 'r') {
          e.preventDefault();
          clearGPrefix();
          navigate('/profile');
          return;
        }
        // Geçersiz tuş: prefix'i sıfırla
        clearGPrefix();
      }
    }

    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
      clearGPrefix();
    };
  }, [handlers, shortcuts, announce, navigate]);
}
