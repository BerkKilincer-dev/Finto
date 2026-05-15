import { describe, it, expect } from 'vitest';
import { buildTechnicalPrediction, type OHLCV } from '../backend/predictionEngine';

function syntheticBars(n: number, start = 100, drift = 0.5): OHLCV[] {
  const out: OHLCV[] = [];
  let p = start;
  for (let i = 0; i < n; i++) {
    p += drift + (Math.sin(i / 3) * 1.2);
    const o = p - 0.4;
    const c = p;
    const h = Math.max(o, c) + 0.6;
    const l = Math.min(o, c) - 0.6;
    out.push({ o, h, l, c, v: 1_000_000 + (i % 7) * 50_000, t: Date.now() + i * 86400000 });
  }
  return out;
}

describe('buildTechnicalPrediction', () => {
  it('5 bardan az veri → güvenli yatay default döndürmeli, crash etmemeli', () => {
    const r = buildTechnicalPrediction('TEST', 100, syntheticBars(3));
    expect(r.trend).toBe('Yatay');
    expect(r.lookbackTradingDays).toBe(0);
    expect(Array.isArray(r.recentCloses)).toBe(true);
  });

  it('boş bars → crash etmemeli', () => {
    const r = buildTechnicalPrediction('TEST', 100, []);
    expect(r.symbol).toBe('TEST');
    expect(r.recentCloses).toEqual([]);
  });

  it('yeterli veri ile recentCloses dolu döner ve hedef bandı tutarlı', () => {
    const bars = syntheticBars(120);
    const r = buildTechnicalPrediction('TEST', bars[bars.length - 1].c, bars);
    expect(r.recentCloses.length).toBeGreaterThanOrEqual(2);
    expect(r.targetPriceLow).toBeLessThanOrEqual(r.targetPrice);
    expect(r.targetPrice).toBeLessThanOrEqual(r.targetPriceHigh);
    expect(r.signalConsistencyPercent).toBeGreaterThanOrEqual(0);
    expect(r.signalConsistencyPercent).toBeLessThanOrEqual(100);
  });
});
