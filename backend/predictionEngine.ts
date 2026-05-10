/**
 * Kural tabanli teknik tahmin — yatirim tavsiyesi degildir.
 * Yahoo gunluk kapanislari ile SMA / RSI / momentum skoru uretir.
 */

export type TrendLabel = 'Yukselis' | 'Dusuk seyir' | 'Yatay';

export type TechnicalPrediction = {
  symbol: string;
  trend: TrendLabel;
  /** -100 ile +100 arasi teknik oy pusulasi */
  score: number;
  confidence: number;
  targetPrice: number;
  horizon: string;
  summary: string;
  drivers: string[];
  rsi14: number | null;
  /** Fiyatin 20 gunluk ortalamaya gore yuzde sapmasi */
  vsSma20Percent: number | null;
};

function sma(values: number[], period: number): number | null {
  if (values.length < period) return null;
  const slice = values.slice(-period);
  return slice.reduce((a, b) => a + b, 0) / period;
}

/** Basitlestirilmis RSI (son N gunun ortalama kazan/kayip orani) */
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

export function buildTechnicalPrediction(
  symbol: string,
  currentPrice: number,
  closes: number[],
): TechnicalPrediction {
  const horizon = '7 islem gunu (yaklasik 1 hafta)';
  const drivers: string[] = [];

  if (!Number.isFinite(currentPrice) || currentPrice <= 0 || closes.length < 5) {
    return {
      symbol,
      trend: 'Yatay',
      score: 0,
      confidence: 50,
      targetPrice: currentPrice,
      horizon,
      summary: 'Yeterli gunluk veri yok; yatay senaryo varsayildi.',
      drivers: ['En az 5 gunluk kapanis gerekli.'],
      rsi14: null,
      vsSma20Percent: null,
    };
  }

  let score = 0;

  const sma5 = sma(closes, 5);
  const sma10 = sma(closes, 10);
  const sma20 = sma(closes, 20);
  const rsi14 = closes.length >= 15 ? rsiFromCloses(closes, 14) : null;

  let vsSma20Percent: number | null = null;
  if (sma20 !== null && sma20 > 0) {
    vsSma20Percent = Number((((currentPrice - sma20) / sma20) * 100).toFixed(2));
    if (vsSma20Percent > 2.5) {
      score += 18;
      drivers.push(`Fiyat, 20 gunluk ortalamanin %${vsSma20Percent.toFixed(1)} ustunde (yukari trend egilimi).`);
    } else if (vsSma20Percent < -2.5) {
      score -= 18;
      drivers.push(`Fiyat, 20 gunluk ortalamanin %${Math.abs(vsSma20Percent).toFixed(1)} altinda (zayif momentum).`);
    } else {
      drivers.push(`Fiyat 20 gunluk ortalamaya yakin (%${vsSma20Percent.toFixed(1)} sapma) — yatay bant.`);
    }
  }

  if (sma5 !== null && sma20 !== null) {
    if (sma5 > sma20 * 1.002) {
      score += 16;
      drivers.push('5 gunluk ortalama, 20 gunluk ortalamanin uzerinde (kisa vadeli alim baskisi).');
    } else if (sma5 < sma20 * 0.998) {
      score -= 16;
      drivers.push('5 gunluk ortalama, 20 gunluk ortalamanin altinda (kisa vadeli satis baskisi).');
    }
  }

  if (sma5 !== null && sma10 !== null) {
    if (sma5 > sma10) score += 8;
    else score -= 8;
  }

  if (rsi14 !== null) {
    if (rsi14 < 32) {
      score += 12;
      drivers.push(`RSI ${rsi14.toFixed(0)}: asiri satima yakin — tepki alimi ihtimali (risk: dusus trendi devam edebilir).`);
    } else if (rsi14 > 68) {
      score -= 12;
      drivers.push(`RSI ${rsi14.toFixed(0)}: asiri alima yakin — kar realizasyonu riski.`);
    } else if (rsi14 >= 50) {
      score += 6;
      drivers.push(`RSI ${rsi14.toFixed(0)}: notr-ust bolge.`);
    } else {
      score -= 6;
      drivers.push(`RSI ${rsi14.toFixed(0)}: notr-alt bolge.`);
    }
  }

  if (closes.length >= 6) {
    const from = closes[closes.length - 6];
    const to = closes[closes.length - 1];
    if (from > 0) {
      const mom5 = ((to - from) / from) * 100;
      if (mom5 > 4) {
        score += 14;
        drivers.push(`Son 5 islem gunu birikimli getiri pozitif (%${mom5.toFixed(1)}).`);
      } else if (mom5 < -4) {
        score -= 14;
        drivers.push(`Son 5 islem gunu birikimli getiri negatif (%${mom5.toFixed(1)}).`);
      }
    }
  }

  if (closes.length >= 21) {
    const from20 = closes[closes.length - 21];
    const to = closes[closes.length - 1];
    if (from20 > 0) {
      const mom20 = ((to - from20) / from20) * 100;
      if (mom20 > 8) score += 10;
      else if (mom20 < -8) score -= 10;
    }
  }

  score = Math.max(-100, Math.min(100, score));

  let trend: TrendLabel = 'Yatay';
  if (score >= 22) trend = 'Yukselis';
  else if (score <= -22) trend = 'Dusuk seyir';

  const confidence = Math.round(Math.min(90, Math.max(45, 52 + Math.abs(score) * 0.38)));

  const expectedMovePct = (score / 100) * 3.5;
  const targetPrice = Number((currentPrice * (1 + expectedMovePct / 100)).toFixed(2));

  const summary =
    trend === 'Yukselis'
      ? `Teknik skor ${score}: orta-uzun vadeli ortalamalar ve momentum birlikte yukari yonu destekliyor. Hedef, mevcut fiyata gore yaklasik %${expectedMovePct.toFixed(2)} sapma varsayimiyla turetilmistir.`
      : trend === 'Dusuk seyir'
        ? `Teknik skor ${score}: ortalamalarin altinda fiyat ve/veya zayif momentum notr-negatif senaryoyu destekliyor.`
        : `Teknik skor ${score}: sinyaller cakisiyor veya bant icinde — kisa vadede yon belirsiz kalabilir.`;

  return {
    symbol,
    trend,
    score,
    confidence,
    targetPrice,
    horizon,
    summary,
    drivers: drivers.length ? drivers : ['Belirgin teknik tetikleyici yok; notr gorunum.'],
    rsi14,
    vsSma20Percent,
  };
}
