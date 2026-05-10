import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { BIST_SYMBOLS } from '../frontend/src/data/bistWatchlist.ts';
import { buildTechnicalPrediction } from './predictionEngine.ts';
import authRouter from './auth.ts';

type YahooChartMeta = {
  symbol?: string;
  longName?: string;
  shortName?: string;
  regularMarketPrice?: number;
  chartPreviousClose?: number;
  /** Bazı sembollerde günlük yüzde doğrudan gelir (chart özetinde). */
  regularMarketChangePercent?: number;
  exchangeName?: string;
};

function computeDailyChangePercent(chart: Record<string, unknown> | undefined, meta: YahooChartMeta): number {
  const direct = meta.regularMarketChangePercent;
  if (typeof direct === 'number' && Number.isFinite(direct)) {
    return Number(direct.toFixed(2));
  }

  const price = meta.regularMarketPrice;
  const prevFromMeta = meta.chartPreviousClose;
  if (typeof price === 'number' && typeof prevFromMeta === 'number' && prevFromMeta > 0 && prevFromMeta !== price) {
    return Number((((price - prevFromMeta) / prevFromMeta) * 100).toFixed(2));
  }

  const indicators = chart?.indicators as { quote?: Array<{ close?: Array<number | null> }> } | undefined;
  const closes = indicators?.quote?.[0]?.close?.filter(
    (c): c is number => typeof c === 'number' && Number.isFinite(c),
  );
  if (closes && closes.length >= 2) {
    const last = closes[closes.length - 1];
    const prev = closes[closes.length - 2];
    if (prev > 0) {
      return Number((((last - prev) / prev) * 100).toFixed(2));
    }
  }

  if (typeof price === 'number' && typeof prevFromMeta === 'number' && prevFromMeta > 0) {
    return Number((((price - prevFromMeta) / prevFromMeta) * 100).toFixed(2));
  }

  return 0;
}

async function startServer() {
  const app = express();
  const PORT = Number(process.env.PORT) || 3001;

  app.use(express.json());
  app.use(cookieParser());
  app.use('/api/auth', authRouter);

  app.get('/api/stocks/quotes', async (_req, res) => {
    try {
      const bistSymbols = BIST_SYMBOLS;
      const quotes = await Promise.all(
        bistSymbols.map(async (symbol) => {
          const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=5d`;
          const response = await fetch(chartUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (!response.ok) {
            return null;
          }

          const payload = await response.json();
          const chart = payload?.chart?.result?.[0];
          const meta: YahooChartMeta | undefined = chart?.meta;

          if (!meta?.symbol || typeof meta.regularMarketPrice !== 'number') {
            return null;
          }

          const changePercent = computeDailyChangePercent(
            chart as Record<string, unknown> | undefined,
            meta,
          );

          return {
            symbol: meta.symbol.replace('.IS', ''),
            name: meta.longName || meta.shortName || meta.symbol.replace('.IS', ''),
            price: Number(meta.regularMarketPrice),
            dailyChangePercent: changePercent,
            source: `Yahoo Finance ${meta.exchangeName ? `(${meta.exchangeName})` : '(BIST)'} gecikmeli veri`,
          };
        }),
      );

      const validQuotes = quotes.filter(Boolean);
      if (validQuotes.length === 0) {
        return res.status(502).json({ error: 'Canli veri servisine ulasilamadi.' });
      }

      res.json({ quotes: validQuotes, updatedAt: new Date().toISOString() });
    } catch (error) {
      console.error('Canli fiyat hatasi:', error);
      res.status(500).json({ error: 'Canli fiyatlar alinamadi.' });
    }
  });

  app.post('/api/stocks/predict', async (req, res) => {
    try {
      const body = req.body as { symbols?: string[] };
      const symbols =
        Array.isArray(body.symbols) && body.symbols.length > 0 ? body.symbols : [...BIST_SYMBOLS];

      const entries = await Promise.all(
        symbols.map(async (symbol) => {
          const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=3mo`;
          const response = await fetch(chartUrl, {
            headers: { 'User-Agent': 'Mozilla/5.0' },
          });
          if (!response.ok) {
            return null;
          }

          const payload = await response.json();
          const chart = payload?.chart?.result?.[0];
          const meta = chart?.meta as YahooChartMeta | undefined;
          const closesRaw = chart?.indicators?.quote?.[0]?.close ?? [];
          const closes = closesRaw.filter(
            (c: unknown): c is number => typeof c === 'number' && Number.isFinite(c),
          );

          const price =
            typeof meta?.regularMarketPrice === 'number'
              ? meta.regularMarketPrice
              : closes.length > 0
                ? closes[closes.length - 1]
                : NaN;

          if (!Number.isFinite(price) || closes.length < 5) {
            return null;
          }

          const prediction = buildTechnicalPrediction(symbol, price, closes);
          return [symbol, prediction] as const;
        }),
      );

      const predictions: Record<string, ReturnType<typeof buildTechnicalPrediction>> = {};
      for (const entry of entries) {
        if (entry) {
          predictions[entry[0]] = entry[1];
        }
      }

      res.json({
        predictions,
        updatedAt: new Date().toISOString(),
        disclaimer:
          'Bu cikti otomatik teknik kurallara dayanir; yatirim tavsiyesi degildir. Veri gecikmeli olabilir.',
      });
    } catch (error) {
      console.error('Tahmin API hatasi:', error);
      res.status(500).json({ error: 'Tahminler alinamadi.' });
    }
  });

  // Vite entegrasyonu (Dev mode için middleware, prod mode için statik dosya sunumu)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      configFile: path.resolve(process.cwd(), 'frontend/vite.config.ts'),
      root: path.resolve(process.cwd(), 'frontend'),
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Üretim ortamı için (Dağıtım)
    const distPath = path.join(process.cwd(), 'frontend', 'dist');
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend ve Frontend entegre olarak http://localhost:${PORT} portunda çalışıyor.`);
  });
}

startServer();
