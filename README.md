# Finto — Yapay Zeka Destekli BIST Finans Asistanı

Finto, Borsa İstanbul (BIST) hisselerini gerçek zamanlı takip eden, teknik analiz tahminleri sunan ve sesli yapay zeka asistanı içeren bir finans simülasyon platformudur.

---

## Proje Yapısı

```
Finto/
├── backend/                    # Node.js / Express API
│   ├── server.ts               # REST endpoint'leri + Vite entegrasyonu
│   ├── auth.ts                 # Kayıt / giriş / JWT cookie session
│   ├── portfolio.ts            # Kullanıcı portföyü (DB-backed)
│   ├── predictionEngine.ts     # Teknik analiz motoru (gruplanmış skor, ATR)
│   ├── yahooClient.ts          # Yahoo Finance istek katmanı (timeout + retry)
│   ├── thresholdDefaults.ts    # Trend eşiği (env ile override)
│   └── db.ts                   # SQLite bağlantısı + şema
│
├── frontend/                   # React 19 SPA (Vite)
│   └── src/
│       ├── App.tsx             # Router + layout
│       ├── main.tsx            # AuthProvider sarmalayıcı
│       ├── pages/
│       │   ├── Home.tsx
│       │   ├── Dashboard.tsx   # Portföy ekranı
│       │   ├── StockDetail.tsx
│       │   └── Profile.tsx
│       ├── components/
│       │   ├── GlobalAssistant.tsx
│       │   └── AuthModal.tsx
│       ├── contexts/
│       │   └── AuthContext.tsx
│       ├── hooks/
│       │   ├── usePortfolio.ts     # Anonim → localStorage, giriş → API
│       │   ├── useStocksQuotes.ts  # Canlı fiyat polling
│       │   ├── usePredictions.ts   # Teknik tahmin polling
│       │   └── useVoiceAssistant.ts
│       └── data/
│           └── bistWatchlist.ts
│
├── ai/                         # Python sesli asistan (WebSocket)
│   └── voice_assistant.py
│
├── scripts/
│   └── backtest-thresholds.ts  # Walk-forward eşik kalibrasyonu
│
├── .env                        # API anahtarları (git'e eklenmez)
├── finto.db                    # SQLite (otomatik oluşur)
└── package.json
```

---

## Veriler Nereden Geliyor?

| Veri                  | Kaynak                                       | Güncelleme Sıklığı       |
|-----------------------|----------------------------------------------|--------------------------|
| Hisse fiyatları       | Yahoo Finance API                            | Her 60 saniyede bir      |
| Günlük % değişim      | Yahoo Finance API                            | Her 60 saniyede bir      |
| Teknik tahminler      | Kendi motoru (gruplanmış skor + ATR)         | Her 5 dakikada bir       |
| Kullanıcı portföyü    | SQLite (giriş yapıldıysa) / localStorage     | Anlık                    |
| Sesli yanıtlar        | Google Gemini AI (`gemini-2.0-flash`)        | Streaming                |

> Yahoo Finance gecikmeli veri sağlar (~15 dakika). Gerçek zamanlı borsa verisi değildir.

---

## Portföy Davranışı

- **Anonim ziyaretçi**: portföy `localStorage`'da tutulur. Tarayıcı geçmişi temizlenirse sıfırlanır.
- **Giriş yapmış kullanıcı**: portföy SQLite'da `portfolios` / `holdings` / `transactions` / `preferences` tablolarına yazılır. Başka cihazdan girişte aynı portföy gelir.
- **İlk girişte**: localStorage'da veri varsa ve sunucudaki portföy boşsa, lokal portföy otomatik olarak sunucuya **import** edilir ve localStorage temizlenir.

---

## Teknik Analiz Nasıl Çalışır?

`backend/predictionEngine.ts` Yahoo Finance'den çekilen 2 yıllık günlük OHLCV verisini işler:

- **Trend grubu** — SMA(5/10/20) konumu, MACD histogram, 5/20 günlük momentum
- **Osilator grubu** — RSI(14), Bollinger %B
- **Hacim teyidi** — Son 5 günün önceki 15 güne oranı
- **Dinamik pencere** — Wilder ATR(14)% rejime göre 48–130 gün arası
- **Hedef bandı** — `targetPrice ± 1 ATR` (tek nokta değil, belirsizlik bandı)

Trend etiketi `Yukselis` / `Yatay` / `Dusuk seyir`, skor `[-100, +100]` aralığında. `signalConsistencyPercent` modelin **doğruluğu değil**, oy pusulasının iç tutarlılığıdır.

Eşik (`trendThresholdUsed`) için isteğe bağlı walk-forward kalibrasyon:

```bash
npm run calibrate-thresholds
```

---

## Kurulum ve Çalıştırma

### Gereksinimler

- **Node.js** 18+ — [nodejs.org](https://nodejs.org)
- **Python** 3.11+ — [python.org](https://python.org) *(sadece sesli asistan için)*
- **Google Gemini API key** — [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
- **Tarayıcı**: Chrome veya Edge (Web Speech API için)

### 1. Bağımlılıkları kur

```bash
npm install
pip install -r requirements.txt
```

### 2. `.env` dosyası

```env
GEMINI_API_KEY="..."
# Üretim için güçlü ve >= 32 karakter bir secret zorunludur.
JWT_SECRET="local-dev-secret-which-is-at-least-32-characters-long"
APP_URL="http://localhost:3001"
```

JWT secret 32 karakterden kısaysa **üretim modunda (`NODE_ENV=production`) sunucu başlamaz**; geliştirmede uyarı verir.

### 3. Çalıştır

Tek komut hem Express/Vite hem Python sesli asistanı `concurrently` ile başlatır:

```bash
npm run dev
```

→ Web: <http://localhost:3001> · Sesli asistan: `ws://localhost:8001`

Sadece web tarafını çalıştırmak istersen:
```bash
npm run dev:web
```

Sadece sesli asistan:
```bash
npm run dev:voice
```

### Üretim modu

```bash
npm run build
npm start
```

`npm start` script'i `cross-env` ile `NODE_ENV=production` ayarlar, böylece Windows/Linux/macOS'ta tek komut çalışır. JWT cookie'leri otomatik olarak `Secure` flag'i alır.

---

## API Endpoint'leri

### Hisse verileri (auth gerekmez)
| Method | Path                    | Açıklama                          |
|--------|-------------------------|-----------------------------------|
| GET    | `/api/stocks/quotes`    | BIST listesi için canlı fiyatlar  |
| POST   | `/api/stocks/predict`   | Teknik tahminler                  |

### Auth
| Method | Path                  | Açıklama               |
|--------|-----------------------|------------------------|
| POST   | `/api/auth/register`  | Yeni hesap             |
| POST   | `/api/auth/login`     | Giriş                  |
| GET    | `/api/auth/me`        | Aktif oturum           |
| POST   | `/api/auth/logout`    | Çıkış                  |

### Portföy (auth zorunlu)
| Method | Path                                  | Açıklama                                  |
|--------|---------------------------------------|-------------------------------------------|
| GET    | `/api/portfolio`                      | Tam snapshot                              |
| POST   | `/api/portfolio/buy`                  | `{ symbol, quantity, price }`             |
| POST   | `/api/portfolio/sell`                 | `{ symbol, quantity, price }`             |
| POST   | `/api/portfolio/deposit`              | `{ amount }`                              |
| POST   | `/api/portfolio/withdraw`             | `{ amount }`                              |
| POST   | `/api/portfolio/registered/toggle`    | `{ symbol }`                              |
| POST   | `/api/portfolio/pinned/toggle`        | `{ symbol }`                              |
| POST   | `/api/portfolio/import`               | Anonim localStorage portföyünü server'a aktarır (server boşsa) |

### Sesli asistan
| Protokol  | Adres                | Açıklama                |
|-----------|----------------------|-------------------------|
| WebSocket | `ws://localhost:8001` | Streaming Gemini yanıtı |

---

## Önemli Notlar

- Yahoo Finance verisi gecikmelidir (~15 dk); yatırım tavsiyesi değildir.
- Teknik tahminler kural tabanlıdır; **doğruluk garantisi yoktur**.
- Web Speech API yalnızca Chrome ve Edge'de çalışır.
- `finto.db` ilk çalıştırmada otomatik oluşur, git'e eklenmez.
