/**
 * BIST sembollerinin sektör eşleştirmesi.
 * Mevcut izleme listesindeki ~70 sembolün ana sektörleri.
 * Tanımsız bir sembol gelirse 'Diğer' döner.
 */

export type Sector =
  | 'Banka'
  | 'Holding'
  | 'Sanayi'
  | 'Havayolu'
  | 'Otomotiv'
  | 'Perakende'
  | 'Enerji'
  | 'Telekom'
  | 'Teknoloji'
  | 'Demir-Çelik'
  | 'Kimya'
  | 'Cam-Çimento'
  | 'Diğer';

const MAP: Record<string, Sector> = {
  GARAN: 'Banka', AKBNK: 'Banka', ISCTR: 'Banka', YKBNK: 'Banka', HALKB: 'Banka', VAKBN: 'Banka',
  KCHOL: 'Holding', SAHOL: 'Holding', DOHOL: 'Holding', ENKAI: 'Holding',
  ASELS: 'Sanayi', OTKAR: 'Sanayi', KORDS: 'Sanayi', ARCLK: 'Sanayi',
  THYAO: 'Havayolu', PGSUS: 'Havayolu',
  FROTO: 'Otomotiv', TOASO: 'Otomotiv', DOAS: 'Otomotiv',
  BIMAS: 'Perakende', MGROS: 'Perakende', SOKM: 'Perakende',
  TUPRS: 'Enerji', PETKM: 'Enerji', AYGAZ: 'Enerji', AKSEN: 'Enerji',
  TCELL: 'Telekom', TTKOM: 'Telekom',
  LOGO: 'Teknoloji', NETAS: 'Teknoloji',
  EREGL: 'Demir-Çelik', KRDMD: 'Demir-Çelik',
  SASA: 'Kimya', ALKIM: 'Kimya',
  SISE: 'Cam-Çimento', AKCNS: 'Cam-Çimento',
};

export function sectorOf(symbol: string): Sector {
  return MAP[symbol.toUpperCase()] ?? 'Diğer';
}

/**
 * Pozisyonların sektör dağılımını ve basit bir çeşitlendirme yorumu üretir.
 * Görme engelli kullanıcı için sesli okumaya da uygun düz metindir.
 */
export type SectorBreakdown = {
  bySector: Array<{ sector: Sector; value: number; percent: number }>;
  diversificationNote: string;
};

export function buildSectorBreakdown(
  holdings: Array<{ symbol: string; quantity: number }>,
  priceOf: (symbol: string) => number,
): SectorBreakdown {
  if (holdings.length === 0) {
    return { bySector: [], diversificationNote: 'Henüz pozisyonunuz yok.' };
  }
  const totals = new Map<Sector, number>();
  let grand = 0;
  for (const h of holdings) {
    const value = priceOf(h.symbol) * h.quantity;
    if (!Number.isFinite(value) || value <= 0) continue;
    const sec = sectorOf(h.symbol);
    totals.set(sec, (totals.get(sec) ?? 0) + value);
    grand += value;
  }
  const list = Array.from(totals.entries())
    .map(([sector, value]) => ({ sector, value, percent: (value / grand) * 100 }))
    .sort((a, b) => b.value - a.value);

  let note: string;
  if (list.length === 0) {
    note = 'Pozisyon değeri hesaplanamadı.';
  } else if (list.length === 1) {
    note = `Tüm pozisyonlarınız ${list[0].sector} sektöründe — yoğunlaşma riski var.`;
  } else if (list[0].percent > 60) {
    note = `Portföyünüzün yüzde ${list[0].percent.toFixed(0)}'i ${list[0].sector} sektöründe; çeşitlendirme dar.`;
  } else if (list.length >= 4) {
    note = `${list.length} farklı sektöre yayılmışsınız — çeşitlendirme iyi.`;
  } else {
    note = `${list.length} sektöre yayılmışsınız. Daha geniş çeşitlendirme riski azaltabilir.`;
  }
  return { bySector: list, diversificationNote: note };
}
