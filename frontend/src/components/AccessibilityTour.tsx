import { useAccessibilitySettings } from '../hooks/useAccessibilitySettings.tsx';
import { useAnnouncer } from '../hooks/useAnnouncer.tsx';
import { formatShortcut, getGlobalHint, type ShortcutMap } from '../hooks/accessibilityConfig';
import { APP_EVENTS } from '../hooks/appEvents';

function buildTourSpeech(shortcuts: ShortcutMap): string {
  return (
    "Finto'ya hoş geldiniz. Bu uygulama klavye ve sesli komutla tamamen kullanılabilir. " +
    `${getGlobalHint(shortcuts)} ` +
    `Asistanı açtıktan sonra örneğin "portföyümü oku" veya "Garanti'den on lot al" gibi komutlar verebilirsiniz. ` +
    'Bu turu istediğiniz zaman ayarlar sayfasından tekrar başlatabilirsiniz.'
  );
}

/**
 * Normal görünümde sadece klavye/SR kullanıcılarına yönelik bir
 * skip-link gösterir; mouse kullanıcılarına görünmez.
 * Tab → "Görme engelliler için sade görünüm" → Enter → sade arayüze geçer + sesli tur başlar.
 */
export default function AccessibilityTour() {
  const { setOnboardingSeen, setAccessibleMode, shortcuts } = useAccessibilitySettings();
  const { announce } = useAnnouncer();

  function startTourAndMode() {
    setAccessibleMode(true);
    const text =
      'Erişilebilir görünüm açıldı. ' +
      buildTourSpeech(shortcuts) +
      ` Normal görünüme dönmek için ${formatShortcut(shortcuts.toggleAccessibleMode)}.`;
    window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantSpeak, { detail: { text } }));
    announce('Erişilebilir görünüme geçildi. Sesli tur başladı.', 'polite');
    setOnboardingSeen(true);
  }

  return (
    <button type="button" onClick={startTourAndMode} className="skip-to-content">
      Görme engelliler için sade görünüm + sesli tur ({formatShortcut(shortcuts.toggleAccessibleMode)})
    </button>
  );
}
