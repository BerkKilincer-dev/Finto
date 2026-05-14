/**
 * Kullanıcının sesli komutunu yerel (sayfa içi) niyetlerle eşleştirir.
 * Eşleşme yoksa null döner — bu durumda komut AI asistana iletilir.
 *
 * Görme engelli kullanıcılar için "Aselsan 5 lot al" gibi söylemleri
 * doğrudan portfolio aksiyonuna çevirir, ek bir görsel adım gerektirmez.
 */

export type VoiceIntent =
  | { type: 'navigate'; to: '/' | '/portfolio' | '/profile' | 'stock'; symbol?: string }
  | { type: 'buy'; symbol: string; quantity: number }
  | { type: 'sell'; symbol: string; quantity: number }
  | { type: 'read'; what: 'portfolio' | 'page' | 'cash' | 'holdings' | 'stock'; symbol?: string }
  | { type: 'open-assistant' }
  | { type: 'close-assistant' }
  | { type: 'help' };

const TR_NUMBERS: Record<string, number> = {
  bir: 1, iki: 2, üç: 3, uc: 3, dört: 4, dort: 4, beş: 5, bes: 5,
  altı: 6, alti: 6, yedi: 7, sekiz: 8, dokuz: 9, on: 10,
  yirmi: 20, otuz: 30, kırk: 40, kirk: 40, elli: 50,
  altmış: 60, altmis: 60, yetmiş: 70, yetmis: 70, seksen: 80, doksan: 90, yüz: 100, yuz: 100,
};

function parseTurkishNumber(token: string): number | null {
  const lower = token.toLowerCase().trim();
  if (/^\d+$/.test(lower)) return parseInt(lower, 10);
  return TR_NUMBERS[lower] ?? null;
}

function normalize(text: string): string {
  return text
    .toLowerCase()
    .replace(/[.,!?]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Verilen söylemde bilinen sembollerden birini ara.
 * Önceliği uzun eşleşmelere ver ki "asela" "aselsan"a girer gibi şeyler olmasın.
 */
function findSymbol(text: string, knownSymbols: string[]): string | null {
  const lower = text.toLowerCase();
  // Önce tam BIST sembolü (büyük harfli) varsa
  for (const s of knownSymbols) {
    if (new RegExp(`\\b${s.toLowerCase()}\\b`).test(lower)) return s;
  }
  // Halk dilinde "aselsan" → "ASELS", "garanti" → "GARAN" gibi yaygın isimler.
  const aliases: Record<string, string> = {
    aselsan: 'ASELS',
    asela: 'ASELS',
    garanti: 'GARAN',
    akbank: 'AKBNK',
    yapı: 'YKBNK', yapikredi: 'YKBNK', 'yapı kredi': 'YKBNK',
    isbank: 'ISCTR', 'iş bankası': 'ISCTR', 'is bankasi': 'ISCTR',
    'türk telekom': 'TTKOM', 'turk telekom': 'TTKOM',
    sasa: 'SASA', 'sa sa': 'SASA',
    eregli: 'EREGL', 'ereğli': 'EREGL', 'erdemir': 'EREGL',
    sabancı: 'SAHOL', sabanci: 'SAHOL',
    koç: 'KCHOL', koc: 'KCHOL', 'koç holding': 'KCHOL',
    bim: 'BIMAS',
    'türk hava yolları': 'THYAO', 'turk hava yollari': 'THYAO', thy: 'THYAO',
    pegasus: 'PGSUS',
    arçelik: 'ARCLK', arcelik: 'ARCLK',
    ford: 'FROTO', tofaş: 'TOASO', tofas: 'TOASO',
    'enka': 'ENKAI',
    tüpraş: 'TUPRS', tupras: 'TUPRS',
    petkim: 'PETKM',
    'türkcell': 'TCELL', turkcell: 'TCELL',
    'türkiye iş bankası': 'ISCTR',
  };
  for (const alias of Object.keys(aliases).sort((a, b) => b.length - a.length)) {
    if (lower.includes(alias)) return aliases[alias];
  }
  return null;
}

export function parseVoiceCommand(
  rawText: string,
  knownSymbols: string[],
): VoiceIntent | null {
  const text = normalize(rawText);
  if (!text) return null;

  // Yardım
  if (/(yardım|yardim|kısayol|kisayol|komut listesi)/.test(text)) {
    return { type: 'help' };
  }

  // Asistan kapatma
  if (/(asistanı kapat|kapatabilir misin|sus|kapan)/.test(text)) {
    return { type: 'close-assistant' };
  }

  // Sayfa okuma
  if (/(portföyümü oku|portfoyumu oku|portföyü oku|portfoyu oku)/.test(text)) {
    return { type: 'read', what: 'portfolio' };
  }
  if (/(nakit (bakiyem|param)|param ne kadar|bakiyem ne)/.test(text)) {
    return { type: 'read', what: 'cash' };
  }
  if (/(hisselerim|elimdeki|pozisyonlarım|pozisyonlarim)/.test(text)) {
    return { type: 'read', what: 'holdings' };
  }
  if (/(sayfayı oku|sayfayi oku|ne yaz(ı|i)yor|şu anki sayfa)/.test(text)) {
    return { type: 'read', what: 'page' };
  }

  // Navigasyon
  if (/(ana sayfa|anasayfa|baş sayfa)/.test(text)) {
    return { type: 'navigate', to: '/' };
  }
  if (/(portföy|portfoy|portfolio).*aç|aç.*portföy|portföye git|portfoye git|portföyüm/.test(text)) {
    return { type: 'navigate', to: '/portfolio' };
  }
  if (/(profil|hesabım|hesabim).*aç|profile git|profilime git/.test(text)) {
    return { type: 'navigate', to: '/profile' };
  }

  // "X detayına git" — sembol bulunursa
  if (/(detay|incele|aç)/.test(text)) {
    const sym = findSymbol(text, knownSymbols);
    if (sym) return { type: 'navigate', to: 'stock', symbol: sym };
  }

  // Alım/satım — "ASELS 5 lot al", "5 lot ASELS al", "aselsan al 5 lot"
  const isSell = /\b(sat|satıver|satmak istiyorum)\b/.test(text);
  const isBuy = /\b(al|alıver|almak istiyorum|satın al|satin al)\b/.test(text);
  if (isBuy || isSell) {
    const sym = findSymbol(text, knownSymbols);
    if (sym) {
      // Sayı yakala: önce digits, sonra tek-kelime TR sayı
      const digitMatch = text.match(/(\d+)\s*(lot|adet|tane)?/);
      let qty: number | null = digitMatch ? parseInt(digitMatch[1], 10) : null;
      if (qty === null) {
        const tokens = text.split(' ');
        for (const t of tokens) {
          const n = parseTurkishNumber(t);
          if (n !== null) {
            qty = n;
            break;
          }
        }
      }
      if (qty !== null && qty > 0) {
        return isSell
          ? { type: 'sell', symbol: sym, quantity: qty }
          : { type: 'buy', symbol: sym, quantity: qty };
      }
    }
  }

  return null;
}
