/**
 * Kural tabanli teknik tahmin — yatirim tavsiyesi degildir.
 *
 * Mimari:
 * - Trend grubu (SMA konumu, MACD, momentum) ve Osilator grubu (RSI, %B) ayri normalize edilir,
 *   carpik korelasyon azaltmak icin grup ici ortalama / grup agirliklari kullanilir.
 * - ATR (Wilder) ile dinamik geriye donuk pencere ve hedef fiyat bandi.
 * - Esik: thresholdDefaults + istege bagli walk-forward kalibrasyon scripti.
 */

import { trendThresholdFromEnv } from './thresholdDefaults.ts';

export type TrendLabel = 'Yukselis' | 'Dusuk seyir' | 'Yatay';

/** Gunluk bar (Yahoo chart ile uyumlu) */
export type OHLCV = {
  c: number;
  h: number;
  l: number;
  v: number;
};

export type TechnicalPrediction = {
  symbol: string;
  trend: TrendLabel;
  /** -100 … +100 birlesik skor */
  score: number;
  /**
   * Gostergelerin skor isaretiyle tutarliligi (0–100).
   * Bu, "gelecekte dogru tahmin" degil; oy pusulasinin ic tutarliligidir.
   */
  signalConsistencyPercent: number;
  /**
   * Model ic tutarlilik ozeti (35–88); arayuzde "dogruluk" sanilmasin diye ayri alan.
   */
  modelConsistencyScore: number;
  targetPrice: number;
  /** ±1 ATR bandi (tekil hedef etrafinda belirsizlik) */
  targetPriceLow: number;
  targetPriceHigh: number;
  horizon: string;
  summary: string;
  drivers: string[];
  rsi14: number | null;
  vsSma20Percent: number | null;
  macdHistogram: number | null;
  bollingerPercentB: number | null;
  volumeVsAvgRatio: number | null;
  /** Son bar icin Wilder ATR(14), TL */
  atr14: number | null;
  /** ATR / fiyat — rejim ve dinamik pencere icin */
  atr14PercentOfPrice: number | null;
  /** Tahminde kullanilan gun sayisi (dinamik pencere) */
  lookbackTradingDays: number;
  /** Siniflandirmada kullanilan esik (mutlak skor) */
  trendThresholdUsed: number;
};

const W_TREND_GROUP = 0.54;
const W_OSC_GROUP = 0.38;
/** Hacim teyidi kalan pay */
const W_VOL_WEIGHT = 0.08;

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

function stdevLast(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  const m = sma(slice, period);
  if (m === null) return null;
  const v = slice.reduce((acc, x) => acc + (x - m) ** 2, 0) / period;
  return Math.sqrt(v);
}

function clamp(n: number, lo: number, hi: number): number {
  return Math.max(lo, Math.min(hi, n));
}

function rsiFromCloses(closes: number[], period = 14): number | null {
  if (closes.length < period + 1) return null;
  const changes: number[] = [];
  for (let i = 1; i < closes.length; i += 1) {
    changes.push(closes[i] - closes[i - 1]);
  }
  const recent = changes.slice(-period);
  let gain = 0;
  let loss = 0;
  for (const c of recent) {
    if (c >= 0) gain += c;
    else loss -= c;
  }
  const avgGain = gain / period;
  const avgLoss = loss / period;
  if (avgLoss === 0) return 100;
  const rs = avgGain / avgLoss;
  return 100 - 100 / (1 + rs);
}

function emaSeries(closes: number[], period: number): (number | null)[] {
  const out: (number | null)[] = closes.map(() => null);
  if (closes.length < period) return out;
  let emaVal = sma(closes.slice(0, period), period);
  if (emaVal === null) return out;
  out[period - 1] = emaVal;
  const k = 2 / (period + 1);
  for (let i = period; i < closes.length; i += 1) {
    emaVal = closes[i] * k + emaVal * (1 - k);
    out[i] = emaVal;
  }
  return out;
}

function macdLast(closes: number[]): { histogram: number } | null {
  if (closes.length < 35) return null;
  const e12 = emaSeries(closes, 12);
  const e26 = emaSeries(closes, 26);
  const macdSeries: number[] = [];
  for (let i = 0; i < closes.length; i += 1) {
    const a = e12[i];
    const b = e26[i];
    if (a !== null && b !== null) macdSeries.push(a - b);
  }
  if (macdSeries.length < 9) return null;
  const line = macdSeries[macdSeries.length - 1];
  let sig = sma(macdSeries.slice(0, 9), 9);
  if (sig === null) return null;
  const k = 2 / 10;
  for (let i = 9; i < macdSeries.length; i += 1) {
    sig = macdSeries[i] * k + sig * (1 - k);
  }
  return { histogram: line - sig };
}

function computeBollingerPercentB(price: number, closes: number[]): number | null {
  if (closes.length < 20) return null;
  const mid = sma(closes.slice(-20), 20);
  const sd = stdevLast(closes, 20);
  if (mid === null || sd === null || sd === 0) return null;
  const upper = mid + 2 * sd;
  const lower = mid - 2 * sd;
  const span = upper - lower;
  if (span <= 0) return null;
  return Number((((price - lower) / span) * 100).toFixed(2));
}

/** Wilder ATR serisi; son eleman guncel ATR */
export function wilderAtrSeries(highs: number[], lows: number[], closes: number[], period = 14): number[] {
  const n = closes.length;
  const tr: number[] = new Array(n).fill(0);
  for (let i = 0; i < n; i += 1) {
    const hl = highs[i] - lows[i];
    if (i === 0) {
      tr[i] = Math.max(hl, 1e-12);
      continue;
    }
    const hc = Math.abs(highs[i] - closes[i - 1]);
    const lc = Math.abs(lows[i] - closes[i - 1]);
    tr[i] = Math.max(hl, hc, lc);
  }
  const atr: number[] = new Array(n).fill(NaN);
  if (n < period) return atr;
  let s = 0;
  for (let i = 0; i < period; i += 1) s += tr[i];
  atr[period - 1] = s / period;
  for (let i = period; i < n; i += 1) {
    atr[i] = (atr[i - 1] * (period - 1) + tr[i]) / period;
  }
  return atr;
}

/**
 * Son donem ATR% (fiyat / rejim): yuksek => kisa pencere (guncel rejime agirlik).
 */
function atrPercentLast(bars: OHLCV[]): number | null {
  if (bars.length < 15) return null;
  const h = bars.map((b) => b.h);
  const l = bars.map((b) => b.l);
  const c = bars.map((b) => b.c);
  const atr = wilderAtrSeries(h, l, c, 14);
  const last = atr[atr.length - 1];
  const px = c[c.length - 1];
  if (!Number.isFinite(last) || !(px > 0)) return null;
  return last / px;
}

/**
 * Volatiliteye gore son N gunu al: yuksek ATR% -> kisa, dusuk -> uzun pencere.
 */
export function selectDynamicWindowBars(bars: OHLCV[]): { sliced: OHLCV[]; note: string } {
  const n = bars.length;
  const MIN_W = 48;
  const MAX_W = 130;
  const atrp = atrPercentLast(bars);
  let take = 88;
  let note = 'Normal volatilite: ~88 gunluk pencere.';
  if (atrp !== null) {
    if (atrp > 0.042) {
      take = 48;
      note = 'Yuksek ATR%: kisa pencere (~48 gun) — son rejime agirlik.';
    } else if (atrp > 0.03) {
      take = 64;
      note = 'Artmis volatilite: orta-kisa pencere (~64 gun).';
    } else if (atrp < 0.016) {
      take = Math.min(MAX_W, 118);
      note = 'Dusuk ATR%: uzun pencere (~118 gun) — daha yumusak ortalamalar.';
    }
  }
  take = clamp(take, MIN_W, Math.min(MAX_W, n));
  if (n <= MIN_W) return { sliced: bars, note: 'Yetersiz tarih; tum barlar kullanildi.' };
  return { sliced: bars.slice(-take), note };
}

function volumeParticipationRatio(volumes: number[]): number | null {
  if (volumes.length < 21) return null;
  const recent = volumes.slice(-5);
  const prior = volumes.slice(-20, -5);
  const avgR = recent.reduce((a, b) => a + b, 0) / 5;
  const avgP = prior.reduce((a, b) => a + b, 0) / 15;
  if (avgP <= 0) return null;
  return Number((avgR / avgP).toFixed(3));
}

function alignmentVotes(votes: (-1 | 0 | 1)[], score: number): number {
  if (votes.length === 0) return 55;
  const sign = score > 6 ? 1 : score < -6 ? -1 : 0;
  let hit = 0;
  let counted = 0;
  for (const v of votes) {
    if (v === 0) continue;
    counted += 1;
    if (sign === 0) hit += 1;
    else if (v === sign) hit += 1;
  }
  if (counted === 0) return 52;
  return Math.round((hit / counted) * 100);
}

function modelConsistencyFrom(absScore: number, alignment: number): number {
  const base = 34 + Math.min(26, absScore * 0.2);
  const alignPart = alignment * 0.36;
  return Math.round(Math.min(88, Math.max(36, base + alignPart - 16)));
}

type GroupedResult = {
  score: number;
  drivers: string[];
  votes: (-1 | 0 | 1)[];
  rsi14: number | null;
  vsSma20Percent: number | null;
  macdHistogram: number | null;
  bollingerPercentB: number | null;
  volumeVsAvgRatio: number | null;
  trendGroupAvg: number;
  oscGroupAvg: number;
  volumeAdj: number;
};

/**
 * Grup icinde -1..1 bilesenler, sonra agirlikli birlesim + hacim ayari.
 */
function computeGroupedScore(
  closes: number[],
  highs: number[],
  lows: number[],
  volumes: number[],
  currentPrice: number,
): GroupedResult {
  const drivers: string[] = [];
  const votes: (-1 | 0 | 1)[] = [];

  const trendParts: number[] = [];

  const sma5 = sma(closes, 5);
  const sma10 = sma(closes, 10);
  const sma20 = sma(closes, 20);
  let vsSma20Percent: number | null = null;

  if (sma20 !== null && sma20 > 0) {
    vsSma20Percent = Number((((currentPrice - sma20) / sma20) * 100).toFixed(2));
    const z = clamp(vsSma20Percent / 4.5, -1, 1);
    trendParts.push(z);
    if (vsSma20Percent > 2.5) {
      votes.push(1);
      drivers.push(`Fiyat SMA20 uzerinde (%${vsSma20Percent.toFixed(1)} sapma) — trend grubu yukari.`);
    } else if (vsSma20Percent < -2.5) {
      votes.push(-1);
      drivers.push(`Fiyat SMA20 altinda (%${vsSma20Percent.toFixed(1)}) — trend grubu asagi.`);
    } else {
      votes.push(0);
      drivers.push(`Fiyat SMA20 civarinda (%${vsSma20Percent.toFixed(1)}) — notr bant.`);
    }
  }

  if (sma5 !== null && sma20 !== null && sma20 > 0) {
    const spread = ((sma5 - sma20) / sma20) * 100;
    trendParts.push(clamp(spread / 0.55, -1, 1));
    if (sma5 > sma20 * 1.002) votes.push(1);
    else if (sma5 < sma20 * 0.998) votes.push(-1);
    else votes.push(0);
  }

  if (sma5 !== null && sma10 !== null) {
    trendParts.push(sma5 > sma10 ? 0.55 : -0.55);
    votes.push(sma5 > sma10 ? 1 : -1);
  }

  let macdHistogram: number | null = null;
  const macd = macdLast(closes);
  if (macd !== null && currentPrice > 0) {
    macdHistogram = Number(macd.histogram.toFixed(6));
    const scale = currentPrice * 0.0015;
    const hz = clamp(macd.histogram / Math.max(scale, 1e-9), -1, 1);
    trendParts.push(hz);
    if (macd.histogram > 0) {
      votes.push(1);
      drivers.push('MACD histogram pozitif (trend grubu).');
    } else if (macd.histogram < 0) {
      votes.push(-1);
      drivers.push('MACD histogram negatif (trend grubu).');
    } else votes.push(0);
  }

  if (closes.length >= 6) {
    const from = closes[closes.length - 6];
    const to = closes[closes.length - 1];
    if (from > 0) {
      const mom5 = ((to - from) / from) * 100;
      trendParts.push(clamp(mom5 / 7, -1, 1));
      if (mom5 > 4) votes.push(1);
      else if (mom5 < -4) votes.push(-1);
      else votes.push(0);
    }
  }

  if (closes.length >= 21) {
    const from20 = closes[closes.length - 21];
    const to = closes[closes.length - 1];
    if (from20 > 0) {
      const mom20 = ((to - from20) / from20) * 100;
      trendParts.push(clamp(mom20 / 14, -1, 1));
      if (mom20 > 8) votes.push(1);
      else if (mom20 < -8) votes.push(-1);
      else votes.push(0);
    }
  }

  const trendGroupAvg =
    trendParts.length > 0 ? trendParts.reduce((a, b) => a + b, 0) / trendParts.length : 0;

  const oscParts: number[] = [];
  const rsi14 = closes.length >= 15 ? rsiFromCloses(closes, 14) : null;
  if (rsi14 !== null) {
    oscParts.push(clamp((rsi14 - 50) / 38, -1, 1));
    if (rsi14 < 34) {
      votes.push(1);
      drivers.push(`RSI ${rsi14.toFixed(0)} — osilator asiri satim bolgesi.`);
    } else if (rsi14 > 66) {
      votes.push(-1);
      drivers.push(`RSI ${rsi14.toFixed(0)} — osilator asiri alim bolgesi.`);
    } else if (rsi14 >= 52) {
      votes.push(1);
      drivers.push(`RSI ${rsi14.toFixed(0)} — osilator ust yarisi.`);
    } else {
      votes.push(-1);
      drivers.push(`RSI ${rsi14.toFixed(0)} — osilator alt yarisi.`);
    }
  }

  let bollingerPercentB: number | null = null;
  const pctB = computeBollingerPercentB(currentPrice, closes);
  if (pctB !== null) {
    bollingerPercentB = pctB;
    oscParts.push(clamp((pctB - 50) / 42, -1, 1));
    if (pctB < 18) votes.push(1);
    else if (pctB > 82) votes.push(-1);
    else votes.push(0);
    drivers.push(`Bollinger %B ${pctB.toFixed(0)} (osilator grubu).`);
  }

  const oscGroupAvg =
    oscParts.length > 0 ? oscParts.reduce((a, b) => a + b, 0) / oscParts.length : 0;

  let volumeVsAvgRatio: number | null = null;
  let volumeAdj = 0;
  if (volumes.length === closes.length && volumes.length >= 21) {
    volumeVsAvgRatio = volumeParticipationRatio(volumes);
    if (volumeVsAvgRatio !== null) {
      const lastC = closes[closes.length - 1];
      const c6 = closes[closes.length - 6];
      const momPos = closes.length >= 6 && c6 > 0 && (lastC - c6) / c6 > 0.02;
      const momNeg = closes.length >= 6 && c6 > 0 && (lastC - c6) / c6 < -0.02;
      if (volumeVsAvgRatio >= 1.15 && momPos) {
        volumeAdj = 12;
        votes.push(1);
        drivers.push(`Hacim guclu (x${volumeVsAvgRatio.toFixed(2)}) ve fiyat yukari — teyit.`);
      } else if (volumeVsAvgRatio >= 1.15 && momNeg) {
        volumeAdj = -12;
        votes.push(-1);
        drivers.push(`Hacim guclu (x${volumeVsAvgRatio.toFixed(2)}) ve fiyat asagi — baski.`);
      } else if (volumeVsAvgRatio < 0.85) {
        volumeAdj = -4;
        votes.push(0);
        drivers.push(`Hacim dusuk (x${volumeVsAvgRatio.toFixed(2)}) — teyit zayif.`);
      } else {
        votes.push(0);
        drivers.push(`Hacim orta (x${volumeVsAvgRatio.toFixed(2)}).`);
      }
    }
  }

  // Grup agirliklari normalize: trend + osilator = cekirdek skor (-100..100)
  const wSum = W_TREND_GROUP + W_OSC_GROUP;
  const blended = (W_TREND_GROUP * trendGroupAvg + W_OSC_GROUP * oscGroupAvg) / wSum;
  let score = 100 * blended;
  // Hacim ayari (±), tam bagimsiz degil ama korelasyonu dusuk — hafif ek
  score += clamp(volumeAdj * (W_VOL_WEIGHT * (100 / 12)), -12, 12);
  score = clamp(score, -100, 100);

  return {
    score,
    drivers,
    votes,
    rsi14,
    vsSma20Percent,
    macdHistogram,
    bollingerPercentB,
    volumeVsAvgRatio,
    trendGroupAvg,
    oscGroupAvg,
    volumeAdj,
  };
}

/**
 * Walk-forward kalibrasyon icin: verilen tarihsel dizinin son barina kadar
 * guncel motor ile tek skor uretir (dinamik pencere dahil).
 */
export function computeRawScoreForSlice(fullBars: OHLCV[]): number {
  if (fullBars.length < 8) return 0;
  const { sliced } = selectDynamicWindowBars(fullBars);
  const closes = sliced.map((b) => b.c);
  const highs = sliced.map((b) => b.h);
  const lows = sliced.map((b) => b.l);
  const vols = sliced.map((b) => b.v);
  const px = sliced[sliced.length - 1].c;
  const g = computeGroupedScore(closes, highs, lows, vols, px);
  return g.score;
}

export function buildTechnicalPrediction(symbol: string, currentPrice: number, bars: OHLCV[]): TechnicalPrediction {
  const horizon = '7 islem gunu (yaklasik 1 hafta)';
  const threshold = trendThresholdFromEnv();

  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || bars.length < 5) {
    return {
      symbol,
      trend: 'Yatay',
      score: 0,
      signalConsistencyPercent: 50,
      modelConsistencyScore: 50,
      targetPrice: currentPrice,
      targetPriceLow: currentPrice,
      targetPriceHigh: currentPrice,
      horizon,
      summary: 'Yeterli OHLC verisi yok; yatay senaryo.',
      drivers: ['En az 5 gunluk kapanis gerekli.'],
      rsi14: null,
      vsSma20Percent: null,
      macdHistogram: null,
      bollingerPercentB: null,
      volumeVsAvgRatio: null,
      atr14: null,
      atr14PercentOfPrice: null,
      lookbackTradingDays: 0,
      trendThresholdUsed: threshold,
    };
  }

  const { sliced, note } = selectDynamicWindowBars(bars);
  const closes = sliced.map((b) => b.c);
  const highs = sliced.map((b) => b.h);
  const lows = sliced.map((b) => b.l);
  const vols = sliced.map((b) => b.v);

  const driversPre = [`${note}`];

  const atrSeries = wilderAtrSeries(highs, lows, closes, 14);
  const atr14 = atrSeries[atrSeries.length - 1];
  const atrOk = Number.isFinite(atr14) ? atr14 : null;
  const atrPct = atrOk !== null && currentPrice > 0 ? atrOk / currentPrice : null;

  const g = computeGroupedScore(closes, highs, lows, vols, currentPrice);
  const score = g.score;

  let trend: TrendLabel = 'Yatay';
  if (score >= threshold) trend = 'Yukselis';
  else if (score <= -threshold) trend = 'Dusuk seyir';

  const signalConsistencyPercent = alignmentVotes(g.votes, score);
  const modelConsistencyScore = modelConsistencyFrom(Math.abs(score), signalConsistencyPercent);

  const sd20 = stdevLast(closes, 20);
  const mid20 = sma(closes.slice(-20), 20);
  let volStretch = 1;
  if (sd20 !== null && mid20 !== null && mid20 > 0) {
    const bw = (4 * sd20) / mid20;
    volStretch = Math.min(1.35, Math.max(0.85, 1 + bw * 2.2));
  }

  const expectedMovePct = (score / 100) * 3.5 * volStretch;
  const targetMid = Number((currentPrice * (1 + expectedMovePct / 100)).toFixed(2));

  /** Hedef etrafinda ±1 ATR (Wilder) belirsizlik bandi — tek nokta degil */
  const band = atrOk !== null ? atrOk : currentPrice * (atrPct ?? 0.02);
  const targetPriceLow = Number(Math.max(0.01, targetMid - band).toFixed(2));
  const targetPriceHigh = Number((targetMid + band).toFixed(2));

  const drivers = [...driversPre, ...g.drivers];
  const summary =
    trend === 'Yukselis'
      ? `Teknik skor ${score.toFixed(0)} (grup agirlikli: trend ${(g.trendGroupAvg * 100).toFixed(0)}%, osilator ${(g.oscGroupAvg * 100).toFixed(0)}%). Gosterge tutarliligi %${signalConsistencyPercent}. Hedef orta nokta; ±1 ATR bandi volatiliteye gore genisler/daralir.`
      : trend === 'Dusuk seyir'
        ? `Teknik skor ${score.toFixed(0)}: dusus egilimi. Gosterge tutarliligi %${signalConsistencyPercent}.`
        : `Teknik skor ${score.toFixed(0)}: yatay / karisik sinyal. Gosterge tutarliligi %${signalConsistencyPercent}.`;

  return {
    symbol,
    trend,
    score: Number(score.toFixed(2)),
    signalConsistencyPercent,
    modelConsistencyScore,
    targetPrice: targetMid,
    targetPriceLow,
    targetPriceHigh,
    horizon,
    summary,
    drivers: drivers.length ? drivers : ['Belirgin teknik tetikleyici yok; notr gorunum.'],
    rsi14: g.rsi14,
    vsSma20Percent: g.vsSma20Percent,
    macdHistogram: g.macdHistogram,
    bollingerPercentB: g.bollingerPercentB,
    volumeVsAvgRatio: g.volumeVsAvgRatio,
    atr14: atrOk !== null ? Number(atrOk.toFixed(4)) : null,
    atr14PercentOfPrice: atrPct !== null ? Number((atrPct * 100).toFixed(3)) : null,
    lookbackTradingDays: sliced.length,
    trendThresholdUsed: threshold,
  };
}
