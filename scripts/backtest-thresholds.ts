/**
 * Walk-forward basit backtest: hangi |skor| esigi yon tahmininde daha tutarli?
 *
 * Calistir: npx tsx scripts/backtest-thresholds.ts
 *
 * Not: Bu script Yahoo'dan tarihsel OHLC ceker; sonuc ortam degiskeni FINTO_TREND_THRESHOLD
 * icin oneri uretir — kesin optimality garantisi vermez (veri kalitesi, survivorship vb.).
 */

import { BIST_SYMBOLS } from '../frontend/src/data/bistWatchlist.ts';
import { computeRawScoreForSlice } from '../backend/predictionEngine.ts';

const RANGE = '2y';
const FORWARD_DAYS = 5;
const MIN_HISTORY = 90;
const THRESHOLDS = [16, 18, 20, 22, 24, 26, 28, 30, 32];

type YahooBar = { c: number; h: number; l: number; v: number };

async function fetchBars(symbol: string): Promise<YahooBar[] | null> {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=${RANGE}`;
  const res = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!res.ok) return null;
  const payload = await res.json();
  const quote0 = payload?.chart?.result?.[0]?.indicators?.quote?.[0] as
    | { close?: unknown[]; high?: unknown[]; low?: unknown[]; volume?: unknown[] }
    | undefined;
  if (!quote0?.close) return null;
  const closesRaw = quote0.close;
  const highsRaw = quote0.high ?? [];
  const lowsRaw = quote0.low ?? [];
  const volsRaw = quote0.volume ?? [];
  const len = closesRaw.length;
  let lastV: number | null = null;
  const out: YahooBar[] = [];
  for (let i = 0; i < len; i += 1) {
    const c = closesRaw[i];
    const h = highsRaw[i];
    const l = lowsRaw[i];
    const v = volsRaw[i];
    if (typeof c !== 'number' || !Number.isFinite(c)) continue;
    const hh = typeof h === 'number' && Number.isFinite(h) ? h : c;
    const ll = typeof l === 'number' && Number.isFinite(l) ? l : c;
    if (typeof v === 'number' && Number.isFinite(v) && v >= 0) lastV = v;
    if (lastV === null) continue;
    out.push({ c, h: hh, l: ll, v: lastV });
  }
  return out.length >= MIN_HISTORY + FORWARD_DAYS ? out : null;
}

function directionalAccuracy(
  bars: YahooBar[],
  threshold: number,
): { correct: number; total: number } {
  let correct = 0;
  let total = 0;
  const n = bars.length;
  for (let end = MIN_HISTORY; end < n - FORWARD_DAYS; end += 1) {
    const slice = bars.slice(0, end + 1);
    const score = computeRawScoreForSlice(slice);
    const p0 = slice[end].c;
    const p1 = bars[end + FORWARD_DAYS].c;
    if (!(p0 > 0) || !Number.isFinite(score)) continue;
    const realized = (p1 - p0) / p0;
    if (Math.abs(realized) < 0.003) continue;
    const actualUp = realized > 0;
    let predicted: 'up' | 'down' | 'flat' = 'flat';
    if (score >= threshold) predicted = 'up';
    else if (score <= -threshold) predicted = 'down';
    else continue;
    total += 1;
    const ok =
      (predicted === 'up' && actualUp) || (predicted === 'down' && !actualUp);
    if (ok) correct += 1;
  }
  return { correct, total };
}

async function main() {
  const symbols = BIST_SYMBOLS.slice(0, 8);
  let globalBest = THRESHOLDS[0];
  let globalBestRate = -1;

  console.log('Walk-forward yon tutarliligi (|getiri| > %0.3 threshold flat atlanir)\n');

  for (const t of THRESHOLDS) {
    let cTot = 0;
    let okTot = 0;
    for (const sym of symbols) {
      const bars = await fetchBars(sym);
      if (!bars) continue;
      const { correct, total } = directionalAccuracy(bars, t);
      okTot += correct;
      cTot += total;
    }
    const rate = cTot > 0 ? okTot / cTot : 0;
    console.log(`Esik |skor|>= ${t}: ${(rate * 100).toFixed(1)}% (${okTot}/${cTot})`);
    if (rate > globalBestRate) {
      globalBestRate = rate;
      globalBest = t;
    }
    await new Promise((r) => setTimeout(r, 150));
  }

  console.log('\n---');
  console.log(`Onerilen esik (bu calisma icin): ${globalBest}  (~${(globalBestRate * 100).toFixed(1)}% dogru yon)`);
  console.log('Uygulamak icin .env: FINTO_TREND_THRESHOLD=' + globalBest);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
