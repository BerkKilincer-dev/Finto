/** BİST izleme listesi — hem sunucu `/api/stocks/quotes` hem istemci bu sembolleri kullanır. */

export type WatchlistStock = {
  symbol: string;
  name: string;
  price: number;
  dailyChangePercent: number;
  marketTag: string;
};

export const BIST_WATCHLIST: WatchlistStock[] = [
  { symbol: 'KCHOL', name: 'Koç Holding', price: 232.4, dailyChangePercent: 1.2, marketTag: 'BIST 30' },
  { symbol: 'THYAO', name: 'Türk Hava Yolları', price: 304.25, dailyChangePercent: -0.4, marketTag: 'BIST 30' },
  { symbol: 'ASELS', name: 'Aselsan', price: 86.9, dailyChangePercent: 0.9, marketTag: 'BIST 30' },
  { symbol: 'BIMAS', name: 'BİM Birleşik Mağazalar', price: 535.0, dailyChangePercent: 0.3, marketTag: 'BIST 30' },
  { symbol: 'AKBNK', name: 'Akbank', price: 66.1, dailyChangePercent: -0.2, marketTag: 'BIST 30' },
  { symbol: 'GARAN', name: 'Garanti BBVA', price: 120.0, dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'ISCTR', name: 'İş Bankası (C)', price: 18.5, dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'EREGL', name: 'Ereğli Demir ve Çelik', price: 48.0, dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'TUPRS', name: 'Tüpraş', price: 185.0, dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'SAHOL', name: 'Sabancı Holding', price: 52.0, dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'FROTO', name: 'Ford Otosan', price: 780.0, dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'SISE', name: 'Şişecam', price: 55.0, dailyChangePercent: 0, marketTag: 'BIST 30' },
];

export const BIST_SYMBOLS = BIST_WATCHLIST.map((s) => s.symbol);
