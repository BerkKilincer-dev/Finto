/**
 * Trend siniflandirma esigi (|skor| >= esik => Yukselis / Dusuk seyir).
 * Ortam degiskeni ile runtime'da degistirilebilir.
 *
 * Gercek veriye dayali secim icin: npm run calibrate-thresholds
 * (scripts/backtest-thresholds.ts walk-forward tarama).
 */
export function trendThresholdFromEnv(): number {
  const raw = process.env.FINTO_TREND_THRESHOLD;
  if (raw !== undefined && raw !== '') {
    const n = Number(raw);
    if (Number.isFinite(n) && n >= 12 && n <= 45) return Math.round(n);
  }
  /** Varsayilan: hafif konservatif; kalibrasyon scripti ile guncellenmeli */
  return 22;
}
