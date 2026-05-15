import { Newspaper } from 'lucide-react';
import { APP_EVENTS } from '../hooks/appEvents';

type Props = {
  symbol: string;
  name?: string;
};

/**
 * "Bu hisse için son haber özetini sesli oku" butonu.
 * Gemini'ye yönlendirir; gerçek bir RSS scraper koymadık çünkü kaynaklar
 * günde günde değişiyor. Gemini fresh-data flag'i ile yakın geçmişe odaklanır.
 */
export default function NewsSummaryButton({ symbol, name }: Props) {
  function handleClick() {
    const query = name
      ? `${symbol} (${name}) hissesi için son haberlerin özetini iki üç cümleyle ver. Sadece son bir ayda Türkiye'de yayımlanmış kaynaklara dayan.`
      : `${symbol} hissesi için son haberlerin özetini iki üç cümleyle ver.`;
    window.dispatchEvent(new CustomEvent(APP_EVENTS.assistantQuery, { detail: { text: query } }));
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      className="inline-flex items-center gap-2 px-4 py-2 rounded-xl border-2 border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 text-slate-700 dark:text-slate-200 font-black text-sm transition-colors"
      aria-label={`${symbol} için sesli haber özeti`}
    >
      <Newspaper size={14} aria-hidden="true" />
      Sesli haber özeti
    </button>
  );
}
