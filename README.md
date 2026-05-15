# Finto — Yapay Zeka Destekli BIST Finans Asistanı

Finto, Borsa İstanbul (BIST) hisselerini gerçek zamanlı takip eden, teknik analiz tahminleri sunan ve sesli yapay zeka asistanı içeren bir finans simülasyon platformudur.

---

## Proje Yapısı

```
Finto/
├── backend/                    # Node.js / Express API
│   ├── server.ts               # REST endpoint'leri + güvenlik middleware + Vite entegrasyonu
│   ├── auth.ts                 # Kayıt / giriş / şifre sıfırlama / demo hesap / JWT cookie
│   ├── portfolio.ts            # Kullanıcı portföyü + CSV export (DB-backed)
│   ├── alerts.ts               # Fiyat alarmları CRUD
│   ├── predictionEngine.ts     # Teknik analiz motoru (gruplanmış skor, ATR)
│   ├── yahooClient.ts          # Yahoo Finance istek katmanı (timeout + retry)
│   ├── thresholdDefaults.ts    # Trend eşiği (env ile override)
│   └── db.ts                   # SQLite bağlantısı + şema
│
├── frontend/                   # React 19 SPA (Vite)
│   ├── public/                 # manifest.json, service worker (sw.js), PWA ikonları
│   └── src/
│       ├── App.tsx             # Router + voice/shortcut orkestrasyonu
│       ├── main.tsx            # ErrorBoundary + i18n + Auth + Announcer + Accessibility
│       ├── pages/
│       │   ├── Home.tsx
│       │   ├── Dashboard.tsx   # Portföy ekranı + sektör dağılımı
│       │   ├── StockDetail.tsx # Hisse detay + grafik + alarm + tahmin geçmişi
│       │   ├── Compare.tsx     # İki hisse karşılaştırma (/compare)
│       │   ├── Shortcuts.tsx   # Yazdırılabilir kısayol kartı (/shortcuts)
│       │   └── Profile.tsx     # Profil + performans grafiği + hesap yönetimi
│       ├── components/
│       │   ├── GlobalAssistant.tsx
│       │   ├── AccessibleShell.tsx
│       │   ├── CommandPalette.tsx
│       │   ├── AccessibilityTour.tsx
│       │   ├── AuthModal.tsx
│       │   ├── ErrorBoundary.tsx
│       │   ├── SymbolSearch.tsx        # Header autocomplete
│       │   ├── AlertPanel.tsx          # Fiyat alarmı UI
│       │   ├── PredictionHistory.tsx
│       │   ├── PerformanceChart.tsx
│       │   ├── SectorBreakdown.tsx
│       │   ├── NewsSummaryButton.tsx
│       │   └── Skeleton.tsx
│       ├── contexts/
│       │   └── AuthContext.tsx
│       ├── hooks/
│       │   ├── usePortfolio.ts     # Anonim → localStorage, giriş → API (optimistic update)
│       │   ├── useStocksQuotes.ts  # Canlı fiyat polling (retry + sekme-duyarlı)
│       │   ├── usePredictions.ts   # Teknik tahmin polling
│       │   ├── useAlerts.ts        # Fiyat alarmı yönetimi + tetikleme
│       │   ├── useI18n.tsx         # TR/EN dil desteği
│       │   ├── useVoiceAssistant.ts
│       │   ├── useKeyboardShortcuts.ts
│       │   ├── useAccessibilitySettings.tsx
│       │   ├── useAnnouncer.tsx
│       │   ├── voiceCommands.ts
│       │   ├── accessibilityConfig.ts
│       │   └── appEvents.ts
│       └── data/
│           ├── bistWatchlist.ts
│           └── sectors.ts          # Sembol → sektör eşleştirme
│
├── ai/                         # Python sesli asistan (WebSocket)
│   └── voice_assistant.py      # Gemini streaming + konuşma hafızası + abort
│
├── scripts/
│   └── backtest-thresholds.ts  # Walk-forward eşik kalibrasyonu
│
├── tests/                      # Vitest birim testleri
│   ├── voiceCommands.test.ts
│   └── predictionEngine.test.ts
│
├── .env                        # API anahtarları (git'e eklenmez)
├── finto.db                    # SQLite (otomatik oluşur)
├── vitest.config.ts
└── package.json
```

---

## Veriler Nereden Geliyor?

| Veri                  | Kaynak                                       | Güncelleme Sıklığı       |
|-----------------------|----------------------------------------------|--------------------------|
| Hisse fiyatları       | Yahoo Finance API                            | Her 60 sn (sekme gizliyse durur) |
| Günlük % değişim      | Yahoo Finance API                            | Her 60 saniyede bir      |
| Teknik tahminler      | Kendi motoru (gruplanmış skor + ATR)         | Her 5 dakikada bir       |
| Tahmin geçmişi        | SQLite `prediction_history`                  | Günde 1 snapshot         |
| Kullanıcı portföyü    | SQLite (giriş yapıldıysa) / localStorage     | Anlık                    |
| Fiyat alarmları       | SQLite `alerts` (giriş) / localStorage       | Fiyat polling'inde kontrol |
| Sesli yanıtlar        | Google Gemini AI (`gemini-2.5-flash`, env override) | Streaming          |

> Yahoo Finance gecikmeli veri sağlar (~15 dakika). Gerçek zamanlı borsa verisi değildir.

---

## Öne Çıkan Özellikler

- **Sesli komut + erişilebilir mod** — `Alt+E` ile sade ekran; "Aselsan beş lot al", "bana özet geç" gibi Türkçe komutlar. Satışta sesli onay ister.
- **Sembol arama (autocomplete)** — Üst menüden "Aselsan" yazınca anlık öneri, klavyeyle gezilebilir.
- **Fiyat alarmları** — Hisse hedef fiyata ulaşınca sesli + tarayıcı bildirimi.
- **Hisse karşılaştırma** — `/compare` ile iki hisse yan yana grafik + teknik skor.
- **Tahmin geçmişi** — Sistemin geçmiş günlerdeki tahminleri hisse detayında listelenir.
- **Performans grafiği & sektör dağılımı** — Portföyün kar/zarar trendi + sektörel çeşitlendirme yorumu.
- **Demo hesap** — Tek tıkla geçici hesap oluşturup denemek mümkün.
- **CSV export** — İşlem geçmişini Excel uyumlu CSV olarak indir.
- **PWA** — "Uygulamaya ekle" desteği, çevrimdışı önbellek.
- **TR/EN dil desteği** — Üst menüden değiştirilebilir.
- **Güvenlik** — helmet, CORS, rate limiting, login brute-force koruması, şifre sıfırlama akışı.

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
- **Mikrofon izni**: Tarayıcıda site için aktif olmalı (sesli komutlar için)

### Erişilebilir Mod için ek notlar

- Erişilebilir mod (`Alt+E`) ve klavye kısayolları ek Python bağımlılığı istemez.
- Komut paleti (`Alt+K`) ve sesli komut akışı frontend+backend birlikte çalışırken aktiftir.
- En stabil ses tanıma deneyimi için Chrome önerilir.

### 1. Bağımlılıkları kur

```bash
npm install
pip install -r requirements.txt
```

### Testler

```bash
npm test          # Vitest birim testleri (voiceCommands, predictionEngine)
npm run typecheck # TypeScript tip kontrolü
```

### 2. `.env` dosyası

```env
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-2.5-flash"
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
| Method | Path                              | Açıklama                          |
|--------|-----------------------------------|-----------------------------------|
| GET    | `/api/health`                     | Sağlık kontrolü (status, uptime)  |
| GET    | `/api/stocks/quotes`              | BIST listesi için canlı fiyatlar  |
| POST   | `/api/stocks/predict`             | Teknik tahminler                  |
| GET    | `/api/predictions/:symbol/history`| Bir sembolün tahmin geçmişi       |

### Auth
| Method | Path                        | Açıklama                          |
|--------|-----------------------------|-----------------------------------|
| POST   | `/api/auth/register`        | Yeni hesap (şifre ≥ 10 karakter + rakam) |
| POST   | `/api/auth/login`           | Giriş (brute-force korumalı)      |
| POST   | `/api/auth/demo`            | Anlık demo hesap oluştur          |
| GET    | `/api/auth/me`              | Aktif oturum                      |
| POST   | `/api/auth/logout`          | Çıkış                             |
| POST   | `/api/auth/change-password` | Şifre değiştir (auth)             |
| POST   | `/api/auth/forgot-password` | Şifre sıfırlama token üret        |
| POST   | `/api/auth/reset-password`  | Token ile yeni şifre belirle      |
| POST   | `/api/auth/delete-account`  | Hesabı kalıcı sil (auth)          |

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
| GET    | `/api/portfolio/transactions.csv`     | İşlem geçmişini CSV olarak indir          |

### Fiyat alarmları (auth zorunlu)
| Method | Path                       | Açıklama                              |
|--------|----------------------------|---------------------------------------|
| GET    | `/api/alerts`              | Kullanıcının tüm alarmları            |
| POST   | `/api/alerts`              | `{ symbol, direction, targetPrice }`  |
| POST   | `/api/alerts/:id/trigger`  | Alarmı tetiklendi olarak işaretle     |
| DELETE | `/api/alerts/:id`          | Alarmı sil                            |

### Sesli asistan
| Protokol  | Adres                | Açıklama                |
|-----------|----------------------|-------------------------|
| WebSocket | `ws://localhost:8001` | Streaming Gemini yanıtı (konuşma hafızası + abort) |

---

## Önemli Notlar

- Yahoo Finance verisi gecikmelidir (~15 dk); yatırım tavsiyesi değildir.
- Teknik tahminler kural tabanlıdır; **doğruluk garantisi yoktur**.
- Web Speech API yalnızca Chrome ve Edge'de çalışır.
- Erişilebilir mod `Alt+E`, komut paleti `Alt+K` ile açılır.
- `finto.db` ilk çalıştırmada otomatik oluşur, git'e eklenmez.
