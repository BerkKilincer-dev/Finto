import { useCallback, useEffect, useState } from 'react';
import { BIST_SYMBOLS } from '../data/bistWatchlist';
import type { TechnicalPrediction } from '../../../backend/predictionEngine.ts';

const REFRESH_MS = 5 * 60_000;

export function usePredictions() {
  const [predictions, setPredictions] = useState<Record<string, TechnicalPrediction>>({});
  const [predictLoading, setPredictLoading] = useState(true);
  const [predictUpdatedAt, setPredictUpdatedAt] = useState<Date | null>(null);

  const loadPredictions = useCallback(
    async (symbols?: string[], options?: { quiet?: boolean }) => {
      if (!options?.quiet) setPredictLoading(true);
      try {
        const response = await fetch('/api/stocks/predict', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ symbols: symbols ?? BIST_SYMBOLS }),
        });
        if (!response.ok) return;
        const payload = await response.json();
        const map = payload?.predictions as Record<string, TechnicalPrediction> | undefined;
        if (map && typeof map === 'object') setPredictions((prev) => ({ ...prev, ...map }));
        const pu = payload?.updatedAt;
        if (typeof pu === 'string') setPredictUpdatedAt(new Date(pu));
      } catch {
        // Tahmin servisi kapalıysa önceki cache kalır
      } finally {
        if (!options?.quiet) setPredictLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    loadPredictions();
  }, [loadPredictions]);

  useEffect(() => {
    const interval = setInterval(() => loadPredictions(undefined, { quiet: true }), REFRESH_MS);
    return () => clearInterval(interval);
  }, [loadPredictions]);

  return { predictions, predictLoading, predictUpdatedAt, loadPredictions };
}
