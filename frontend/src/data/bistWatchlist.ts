/** BİST izleme listesi — hem sunucu `/api/stocks/quotes` hem istemci bu sembolleri kullanır. */

export type WatchlistStock = {
  symbol: string;
  name: string;
  price: number;
  dailyChangePercent: number;
  marketTag: string;
};

export const BIST_WATCHLIST: WatchlistStock[] = [
  { symbol: 'KCHOL',  name: 'Koç Holding',               price: 232.4,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'THYAO',  name: 'Türk Hava Yolları',          price: 304.25, dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'ASELS',  name: 'Aselsan',                    price: 86.9,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'BIMAS',  name: 'BİM Birleşik Mağazalar',     price: 535.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'AKBNK',  name: 'Akbank',                     price: 66.1,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'GARAN',  name: 'Garanti BBVA',               price: 120.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'ISCTR',  name: 'İş Bankası (C)',             price: 18.5,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'EREGL',  name: 'Ereğli Demir ve Çelik',      price: 48.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'TUPRS',  name: 'Tüpraş',                     price: 185.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'SAHOL',  name: 'Sabancı Holding',            price: 52.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'FROTO',  name: 'Ford Otosan',                price: 780.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'SISE',   name: 'Şişecam',                    price: 55.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'PGSUS',  name: 'Pegasus Hava Taşımacılığı',  price: 820.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'TOASO',  name: 'Tofaş Otomobil Fabrikası',   price: 210.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'EKGYO',  name: 'Emlak Konut GYO',            price: 22.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'HALKB',  name: 'Halkbank',                   price: 24.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'VAKBN',  name: 'VakıfBank',                  price: 28.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'YKBNK',  name: 'Yapı ve Kredi Bankası',      price: 35.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'OYAKC',  name: 'Oyak Çimento',               price: 58.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'KOZAL',  name: 'Koza Altın İşletmeleri',     price: 310.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'KOZAA',  name: 'Koza Anadolu Metal',         price: 48.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'ARCLK',  name: 'Arçelik',                    price: 145.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'TCELL',  name: 'Turkcell',                   price: 90.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'SASA',   name: 'SASA Polyester',             price: 65.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'TAVHL',  name: 'TAV Havalimanları',          price: 220.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'PETKM',  name: 'Petkim',                     price: 32.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'ENKAI',  name: 'Enka İnşaat',               price: 42.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'MGROS',  name: 'Migros Ticaret',             price: 480.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'ULKER',  name: 'Ülker Bisküvi',              price: 155.0,  dailyChangePercent: 0, marketTag: 'BIST 30' },
  { symbol: 'DOHOL',  name: 'Doğan Holding',              price: 18.0,   dailyChangePercent: 0, marketTag: 'BIST 30' },
];

export const BIST_SYMBOLS = BIST_WATCHLIST.map((s) => s.symbol);