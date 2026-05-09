import 'dotenv/config';
import express from 'express';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI } from '@google/genai';
import path from 'path';
import { BIST_SYMBOLS } from './src/data/bistWatchlist.ts';
import { buildTechnicalPrediction } from './predictionEngine.ts';

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
  const PORT = 3000;

  app.use(express.json());

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

  // LLM / Chat Endpoint'i
  app.post('/api/chat', async (req, res) => {
    try {
      const { user_query, current_path, page_context } = req.body;

      if (!user_query) {
        return res.status(400).json({ error: 'user_query (kullanıcı sorusu) gerekli.' });
      }

      const apiKey = process.env.GEMINI_API_KEY;
      console.log("SERVER: API Key starts with:", apiKey ? apiKey.substring(0, 5) : 'undefined');
      if (!apiKey || apiKey === 'MY_GEMINI_API_KEY' || apiKey.trim() === '') {
         return res.status(401).json({ error: 'API Anahtarı bulunamadı. Lütfen AI Studio ayarlarından GEMINI_API_KEY tanımlayın.' });
      }

      const aiClient = new GoogleGenAI({ apiKey });


      // Finto Sesli Asistan Sistem Promptu
      const systemPrompt = `
Sen "Finto" adında, görme engelli kullanıcılara ve standart kullanıcılara hizmet veren bir yapay zeka finans asistanısın.

ŞU ANKİ BAĞLAM:
- Kullanıcının Bulunduğu Sayfa Yolu (Path): ${current_path || 'Bilinmiyor'}
- Sayfadaki Aktif Veri (Context): ${page_context ? JSON.stringify(page_context) : 'Veri Yok'}

GÖREVIN: Kullanıcının sorusuna yukarıdaki bağlamı (context) merkeze alarak yanıt ver. Eğer kullanıcı sayfa hakkında bir şey soruyorsa, verilen sayfadaki aktif verileri analiz et.

KATI KURALLAR (Sesli Asistan Formatı):
1. ASLA markdown formatı kullanma (*, **, # vb.).
2. ASLA tablo, liste formülü veya kod bloğu oluşturma.
3. Sayıları veya yüzdeleri okunuşlarıyla veya seslendirmeye en yatkın haliyle yaz (örn: "%5" yerine "yüzde beş", "100.000" yerine "yüz bin").
4. Tüm metin sanki bir radyo spikeri okuyormuş gibi dümdüz, akıcı ve tek parça bir paragraf olmalıdır.
5. Yanıtı çok net ve doğrudan ver, uzatma.
`;

      const response = await aiClient.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: user_query,
        config: {
          systemInstruction: systemPrompt,
          temperature: 0.7,
        }
      });

      res.json({ response: response.text });
    } catch (error: any) {
      console.error('LLM Hatası:', error);
      
      if (error.message?.includes('API key not valid')) {
        return res.status(401).json({ error: 'Geçersiz API Anahtarı. Lütfen AI Studio ayarlarından geçerli bir GEMINI_API_KEY tanımlayın.' });
      }

      res.status(500).json({ error: 'LLM yanıt verirken bir hata oluştu.' });
    }
  });

  // Vite entegrasyonu (Dev mode için middleware, prod mode için statik dosya sunumu)
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    // Üretim ortamı için (Dağıtım)
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Backend ve Frontend entegre olarak http://localhost:${PORT} portunda çalışıyor.`);
  });
}

startServer();
