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
  | { type: 'list-stocks'; count?: number }
  | { type: 'list-predictions'; count?: number }
  | { type: 'stock-price'; symbol: string }
  | { type: 'stock-prediction'; symbol: string }
  | { type: 'open-assistant' }
  | { type: 'close-assistant' }
  | { type: 'help' }
  | { type: 'set-mode'; mode: 'accessible' | 'normal' };

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
    .replace(/[’']/g, '')
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

  // Görünüm modu
  if (/(erişilebilir mod|erisilebilir mod|sade görünüm|sade gorunum|büyük yazı|buyuk yazi)/.test(text)) {
    return { type: 'set-mode', mode: 'accessible' };
  }
  if (/(normal mod|normal görünüm|normal gorunum|eski mod)/.test(text)) {
    return { type: 'set-mode', mode: 'normal' };
  }

  // Asistan kapatma
  if (/(asistanı kapat|kapatabilir misin|sus|kapan)/.test(text)) {
    return { type: 'close-assistant' };
  }

  // Sayfa okuma — geniş kalıplar (görme engelli kullanıcı için)
  // Önemli: bu blok navigate'ten ÖNCE çalışır, böylece "portföyümde hangi hisseler var"
  // yanlışlıkla portföy sayfasına navigasyon olarak yorumlanmaz.

  // Tek başına hisseleri sorma — "hangi hisselerim", "hisselerim ne", "neler aldım"
  if (
    /(hisselerim|elimdeki hisseler?|pozisyonlar(ı|i)m|hangi hisseler|neler ald(ı|i)m|yat(ı|i)r(ı|i)mlar(ı|i)m|portföyümde (hangi|ne|neler))/.test(
      text,
    )
  ) {
    return { type: 'read', what: 'holdings' };
  }

  // Nakit / param ne kadar
  if (
    /(nakit (bakiyem|param|m(ı|i)|var)|param ne kadar|ne kadar param|bakiyem ne|bakiyem(i)? söyle|param(ı|i) söyle|ne kadar nakit|kaç para(m)? var|kac para(m)? var|nakitim ne|hesab(ı|i)mda ne kadar para var)/.test(
      text,
    )
  ) {
    return { type: 'read', what: 'cash' };
  }

  // Tam portföy özeti — toplam varlık + nakit + hisse + her pozisyon
  if (
    /(portföyümü oku|portfoyumu oku|portföyü oku|portfoyu oku|portföyümü söyle|portfoyumu soyle|portföy özet|portfoy ozet|toplam varl(ı|i)k|toplam ne kadar|varl(ı|i)ğ(ı|i)m ne|varligim ne|net varl(ı|i)k|tüm portföy|tum portfoy|hesab(ı|i)m(ı|i)n özeti|hesabimin ozeti)/.test(
      text,
    )
  ) {
    return { type: 'read', what: 'portfolio' };
  }

  if (/(sayfayı oku|sayfayi oku|ne yaz(ı|i)yor|şu anki sayfa)/.test(text)) {
    return { type: 'read', what: 'page' };
  }

  // Navigasyon — burada "portföyüm" tek başına yetersiz; eylem fiili gerekir.
  if (/(ana sayfa|anasayfa|baş sayfa)/.test(text)) {
    return { type: 'navigate', to: '/' };
  }
  if (/(portföye git|portfoye git|portföy(?:ü|u)? aç|aç.*portföy|portföyümü aç|portföy sayfas(ı|i))/.test(text)) {
    return { type: 'navigate', to: '/portfolio' };
  }
  if (/(profil|hesabım|hesabim).*aç|profile git|profilime git|profil sayfas(ı|i)/.test(text)) {
    return { type: 'navigate', to: '/profile' };
  }

  // "X detayına git" — sembol bulunursa
  if (/(detay|incele|aç)/.test(text)) {
    const sym = findSymbol(text, knownSymbols);
    if (sym) return { type: 'navigate', to: 'stock', symbol: sym };
  }

  // Tek hisse fiyatı / tahmini
  const symInText = findSymbol(text, knownSymbols);
  if (symInText) {
    if (/(tahmin|öngör|ongor|hedef fiyat|nereye gidiyor|yön|yon|alır mı|alir mi|yükselir|yukselir|düşer|duser)/.test(text)) {
      return { type: 'stock-prediction', symbol: symInText };
    }
    if (/(fiyat|kaç para|kac para|kaç tl|kac tl|ne kadar oldu|şu an|su an)/.test(text)) {
      return { type: 'stock-price', symbol: symInText };
    }
  }

  // Liste komutları: borsa / hisseler / tahminler
  if (/(tahmin|öneri|oneri|fırsat|firsat|al sat sinyali|en iyi hisseler)/.test(text)) {
    const digitMatch = text.match(/(\d+)/);
    const count = digitMatch ? Math.min(10, Math.max(1, parseInt(digitMatch[1], 10))) : undefined;
    return { type: 'list-predictions', count };
  }
  if (/(borsa|bist|hisseler|piyasa|hisse listesi|kaç para|hisseleri oku)/.test(text)) {
    const digitMatch = text.match(/(\d+)/);
    const count = digitMatch ? Math.min(10, Math.max(1, parseInt(digitMatch[1], 10))) : undefined;
    return { type: 'list-stocks', count };
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
