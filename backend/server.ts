import 'dotenv/config';
import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import { BIST_SYMBOLS } from '../frontend/src/data/bistWatchlist.ts';
import { buildTechnicalPrediction, type OHLCV } from './predictionEngine.ts';
import authRouter from './auth.ts';
import portfolioRouter from './portfolio.ts';
import alertsRouter from './alerts.ts';
import db from './db.ts';
import { randomUUID } from 'crypto';
import { fetchYahooChart, mapInChunks } from './yahooClient.ts';

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

  // ─── Güvenlik middleware'leri ─────────────────────────────────────
  // helmet'in CSP'si Vite HMR'ı bozar; dev'de kapatıyoruz.
  app.use(
    helmet({
      contentSecurityPolicy: process.env.NODE_ENV === 'production' ? undefined : false,
      crossOriginEmbedderPolicy: false,
    }),
  );
  // CORS — same-origin (frontend Express ile aynı portta servis ediliyor) ama
  // farklı bir host'tan da çağrılırsa diye APP_URL allow-list olarak duruyor.
  const APP_URL = process.env.APP_URL || `http://localhost:${PORT}`;
  app.use(
    cors({
      origin: [APP_URL, `http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`],
      credentials: true,
    }),
  );

  // Genel API rate limit: dakikada IP başına 300 istek (canlı fiyat polling için bol).
  const generalLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 300,
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Çok fazla istek. Bir dakika bekleyin.' },
  });
  app.use('/api', generalLimiter);

  app.use(express.json({ limit: '100kb' }));
  app.use(cookieParser());

  // Sağlık endpoint'i — yük dengeleyici / monitoring için.
  app.get('/api/health', (_req, res) => {
    res.json({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
    });
  });

  app.use('/api/auth', authRouter);
  app.use('/api/portfolio', portfolioRouter);
  app.use('/api/alerts', alertsRouter);

  // Tahmin geçmişi: bir sembol için son N gün (varsayılan 30).
  app.get('/api/predictions/:symbol/history', (req, res) => {
    const symbol = String(req.params.symbol || '').toUpperCase();
    const limit = Math.min(100, Math.max(1, Number(req.query.limit) || 30));
    const rows = db.prepare(
      'SELECT id, symbol, trend, score, target_price, target_low, target_high, snapshot_price, created_at FROM prediction_history WHERE symbol = ? ORDER BY created_at DESC LIMIT ?',
    ).all(symbol, limit);
    res.json({ history: rows });
  });

  app.get('/api/stocks/quotes', async (_req, res) => {
    try {
      const bistSymbols = BIST_SYMBOLS;
      const quotes = await mapInChunks(bistSymbols, 5, async (symbol) => {
          const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=5d`;
          let response: Response;
          try {
            response = await fetchYahooChart(chartUrl);
          } catch {
            return null;
          }
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
      });

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

      const entries = await mapInChunks(symbols, 4, async (symbol) => {
          const chartUrl = `https://query1.finance.yahoo.com/v8/finance/chart/${symbol}.IS?interval=1d&range=2y`;
          let response: Response;
          try {
            response = await fetchYahooChart(chartUrl);
          } catch {
            return null;
          }
          if (!response.ok) {
            return null;
          }

          const payload = await response.json();
          const chart = payload?.chart?.result?.[0];
          const meta = chart?.meta as YahooChartMeta | undefined;
          const quote0 = chart?.indicators?.quote?.[0] as
            | { close?: unknown[]; high?: unknown[]; low?: unknown[]; volume?: unknown[] }
            | undefined;
          const closesRaw = quote0?.close ?? [];
          const highsRaw = quote0?.high ?? [];
          const lowsRaw = quote0?.low ?? [];
          const volumesRaw = quote0?.volume ?? [];

          const paired: OHLCV[] = [];
          const len = Math.max(closesRaw.length, highsRaw.length, lowsRaw.length, volumesRaw.length);
          let lastVol: number | null = null;
          for (let i = 0; i < len; i += 1) {
            const c = closesRaw[i];
            const hi = highsRaw[i];
            const lo = lowsRaw[i];
            const v = volumesRaw[i];
            if (typeof c !== 'number' || !Number.isFinite(c)) continue;
            const h = typeof hi === 'number' && Number.isFinite(hi) ? hi : c;
            const l = typeof lo === 'number' && Number.isFinite(lo) ? lo : c;
            if (typeof v === 'number' && Number.isFinite(v) && v >= 0) lastVol = v;
            if (lastVol === null) continue;
            paired.push({ c, h, l, v: lastVol });
          }

          const price =
            typeof meta?.regularMarketPrice === 'number'
              ? meta.regularMarketPrice
              : paired.length > 0
                ? paired[paired.length - 1].c
                : NaN;

          if (!Number.isFinite(price) || paired.length < 5) {
            return null;
          }

          const prediction = buildTechnicalPrediction(symbol, price, paired);
          return [symbol, prediction] as const;
      });

      const predictions: Record<string, ReturnType<typeof buildTechnicalPrediction>> = {};
      for (const entry of entries) {
        if (entry) {
          predictions[entry[0]] = entry[1];
        }
      }

      // Günde en fazla 1 kez geçmiş snapshot'ı yaz (sembol başına).
      try {
        const ONE_DAY = 24 * 60 * 60;
        const now = Math.floor(Date.now() / 1000);
        const insertStmt = db.prepare(
          'INSERT INTO prediction_history (id, symbol, trend, score, target_price, target_low, target_high, horizon, snapshot_price) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
        );
        const checkStmt = db.prepare(
          'SELECT created_at FROM prediction_history WHERE symbol = ? ORDER BY created_at DESC LIMIT 1',
        );
        for (const [sym, p] of Object.entries(predictions)) {
          const last = checkStmt.get(sym) as { created_at: number } | undefined;
          if (last && now - last.created_at < ONE_DAY) continue;
          const stock = entries.find((e) => e && e[0] === sym);
          const snapshotPrice = stock ? stock[1].targetPrice : p.targetPrice; // fallback
          insertStmt.run(
            randomUUID(),
            sym,
            p.trend,
            p.score,
            p.targetPrice,
            p.targetPriceLow,
            p.targetPriceHigh,
            p.horizon,
            snapshotPrice,
          );
        }
      } catch (e) {
        console.warn('[prediction-history] yazılamadı:', e);
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
