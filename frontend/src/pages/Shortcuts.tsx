import { Printer, ArrowLeft } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useAccessibilitySettings } from '../hooks/useAccessibilitySettings.tsx';
import { COMMAND_ITEMS, formatShortcut } from '../hooks/accessibilityConfig';

const VOICE_EXAMPLES = [
  { kategori: 'Bilgi', komut: '"hisseleri oku"', açıklama: 'Borsanın anlık özetini sesli oku' },
  { kategori: 'Bilgi', komut: '"tahminleri oku"', açıklama: 'En iyi tahminleri sırala' },
  { kategori: 'Bilgi', komut: '"Aselsan fiyatı"', açıklama: 'Tek hisse fiyatı' },
  { kategori: 'Bilgi', komut: '"Garanti tahmini"', açıklama: 'Tek hisse teknik tahmini' },
  { kategori: 'Bilgi', komut: '"kaç param var"', açıklama: 'Nakit bakiye' },
  { kategori: 'Bilgi', komut: '"bana özet geç"', açıklama: 'Portföy özeti + kar/zarar' },
  { kategori: 'İşlem', komut: '"Aselsan beş lot al"', açıklama: 'Hisse alımı (anlık)' },
  { kategori: 'İşlem', komut: '"Garanti üç lot sat"', açıklama: 'Hisse satışı (onay ister)' },
  { kategori: 'Kontrol', komut: '"asistanı aç"', açıklama: 'Sesli asistan panelini aç' },
  { kategori: 'Kontrol', komut: '"normal görünüm"', açıklama: 'Erişilebilir moddan çık' },
  { kategori: 'Kontrol', komut: '"ne yapabilirsin"', açıklama: 'Yardım menüsü' },
];

export default function Shortcuts() {
  const { shortcuts } = useAccessibilitySettings();
  function handlePrint() {
    window.print();
  }
  return (
    <div className="p-4 md:p-6 max-w-3xl mx-auto space-y-4 print:p-0">
      <div className="flex items-center justify-between print:hidden">
        <Link to="/" className="inline-flex items-center gap-2 text-sm font-black text-slate-600 dark:text-slate-300">
          <ArrowLeft size={14} /> Geri
        </Link>
        <button
          onClick={handlePrint}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-blue-700 text-white font-black text-sm"
        >
          <Printer size={14} /> Yazdır / PDF kaydet
        </button>
      </div>

      <header className="border-b-2 border-slate-900 dark:border-white pb-3 print:border-black">
        <h1 className="text-3xl font-black text-slate-900 dark:text-white print:text-black">Finto Hızlı Referans Kartı</h1>
        <p className="text-sm text-slate-600 dark:text-slate-300 print:text-black">
          Klavye kısayolları ve sesli komutlar — bir sayfada özet.
        </p>
      </header>

      <section className="grid md:grid-cols-2 gap-4">
        <div>
          <h2 className="text-lg font-black mb-2 text-slate-900 dark:text-white print:text-black">
            Klavye Kısayolları
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600 print:border-black">
                <th className="text-left py-1 font-black">Kısayol</th>
                <th className="text-left py-1 font-black">İşlev</th>
              </tr>
            </thead>
            <tbody>
              {COMMAND_ITEMS.map((cmd) => {
                const actionId = cmd.shortcutActionId;
                const sc = actionId ? shortcuts[actionId] : undefined;
                if (!sc) return null;
                return (
                  <tr key={cmd.id} className="border-b border-slate-100 dark:border-slate-700 print:border-gray-300">
                    <td className="py-1 pr-3 font-mono font-black">{formatShortcut(sc)}</td>
                    <td className="py-1">{cmd.title}</td>
                  </tr>
                );
              })}
              <tr className="border-b border-slate-100 dark:border-slate-700 print:border-gray-300">
                <td className="py-1 pr-3 font-mono font-black">Boşluk</td>
                <td className="py-1">Erişilebilir modda mikrofonu aç</td>
              </tr>
              <tr className="border-b border-slate-100 dark:border-slate-700 print:border-gray-300">
                <td className="py-1 pr-3 font-mono font-black">Shift+?</td>
                <td className="py-1">Kısayol listesi (sesli)</td>
              </tr>
            </tbody>
          </table>
        </div>

        <div>
          <h2 className="text-lg font-black mb-2 text-slate-900 dark:text-white print:text-black">
            Sesli Komut Örnekleri
          </h2>
          <table className="w-full text-sm border-collapse">
            <thead>
              <tr className="border-b border-slate-300 dark:border-slate-600 print:border-black">
                <th className="text-left py-1 font-black">Komut</th>
                <th className="text-left py-1 font-black">Ne yapar</th>
              </tr>
            </thead>
            <tbody>
              {VOICE_EXAMPLES.map((v, i) => (
                <tr key={i} className="border-b border-slate-100 dark:border-slate-700 print:border-gray-300">
                  <td className="py-1 pr-3 font-mono">{v.komut}</td>
                  <td className="py-1">{v.açıklama}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <footer className="text-xs text-slate-500 dark:text-slate-400 pt-4 border-t border-slate-200 dark:border-slate-700 print:text-black print:border-gray-400">
        Finto — BIST hisse takip + sesli asistan. Yatırım tavsiyesi değildir.
      </footer>
    </div>
  );
}
