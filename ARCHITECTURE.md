# Finto — Proje Mimarisi ve Teknoloji Rehberi

Bu belge, projeyi ilk kez gören bir ekip arkadaşının hızlıca anlaması için hazırlanmıştır.

---

## Projenin Amacı

Finto, Borsa İstanbul (BIST) hisselerini takip eden, teknik analiz tahminleri sunan ve sesli yapay zeka asistanı içeren bir finans simülasyon platformudur. Kullanıcılar sanal portföy oluşturabilir, hisse alıp satabilir ve sesli asistanla soru sorabilir.

---

## Klasör Yapısı

```
Finto/
├── backend/                  → Node.js API sunucusu
│   ├── server.ts             → Express ana sunucu, tüm API endpoint'leri
│   ├── predictionEngine.ts   → Teknik analiz algoritması (gruplanmış skor, ATR)
│   ├── auth.ts               → Kullanıcı kayıt/giriş + JWT cookie + requireAuth middleware
│   ├── portfolio.ts          → Kullanıcı portföyü (cash, holdings, transactions)
│   ├── yahooClient.ts        → Yahoo Finance HTTP istemcisi (timeout + retry)
│   ├── thresholdDefaults.ts  → Trend eşiği (env override destekli)
│   └── db.ts                 → SQLite bağlantısı, WAL + tüm tablolar
│
├── frontend/                 → React web uygulaması
│   ├── src/
│   │   ├── App.tsx           → Layout + routing + voice/shortcut orkestrasyonu
│   │   ├── main.tsx          → Provider sarmalayıcıları (Auth + Announcer + Accessibility)
│   │   ├── index.css         → Tailwind CSS import
│   │   ├── pages/
│   │   │   ├── Home.tsx      → Ana sayfa: günün hissesi, genel liste
│   │   │   ├── Dashboard.tsx → Portföy ekranı: alım/satım, nakit yönetimi
│   │   │   ├── StockDetail.tsx → Hisse detay sayfası, teknik analiz
│   │   │   └── Profile.tsx   → Kullanıcı profil sayfası
│   │   ├── components/
│   │   │   ├── GlobalAssistant.tsx → Sesli asistan paneli + event dinleyiciler
│   │   │   ├── AccessibleShell.tsx → Görme engelli odaklı sade sesli arayüz
│   │   │   ├── CommandPalette.tsx → Klavye odaklı komut paleti
│   │   │   ├── AccessibilityTour.tsx → İlk kullanım sesli onboarding
│   │   │   └── AuthModal.tsx → Kayıt/giriş modal formu (focus trap)
│   │   ├── contexts/
│   │   │   └── AuthContext.tsx → Kullanıcı oturumu global state
│   │   ├── hooks/
│   │   │   ├── usePortfolio.ts     → Portföy state + mutations (anonim: localStorage, giriş: API)
│   │   │   ├── useStocksQuotes.ts  → Canlı fiyat polling (60s)
│   │   │   ├── usePredictions.ts   → Teknik tahmin polling (5dk)
│   │   │   ├── useVoiceAssistant.ts → Web Speech API (mikrofon + TTS)
│   │   │   ├── useKeyboardShortcuts.ts → Özelleştirilebilir global kısayollar
│   │   │   ├── useAccessibilitySettings.tsx → Erişilebilirlik ayarları + localStorage
│   │   │   ├── useAnnouncer.tsx → Uygulama geneli aria-live anons katmanı
│   │   │   ├── voiceCommands.ts → Türkçe sesli komut niyet ayrıştırma
│   │   │   ├── accessibilityConfig.ts → Komut/kısayol tek kaynak modeli
│   │   │   └── appEvents.ts → Uygulama içi CustomEvent isimleri
│   │   └── data/
│   │       └── bistWatchlist.ts → BIST hisse listesi
│   ├── index.html
│   ├── vite.config.ts        → Vite build ayarları
│   └── tsconfig.json         → TypeScript ayarları
│
├── ai/                       → Python sesli asistan backend
│   ├── voice_assistant.py    → WebSocket sunucusu, Gemini AI streaming
│   └── requirements.txt      → Python bağımlılıkları
│
├── .env                      → Ortam değişkenleri (git'e eklenmez!)
├── .env.example              → .env şablonu
├── requirements.txt          → Python bağımlılıkları (pip install -r requirements.txt)
├── package.json              → Node.js bağımlılıkları
├── finto.db                  → SQLite veritabanı (otomatik oluşur)
└── README.md                 → Kurulum rehberi
```

---

## Teknoloji Yığını

### Backend (Node.js)

| Teknoloji | Versiyon | Kullanım Amacı |
|-----------|----------|----------------|
| **Node.js** | v18+ | JavaScript runtime |
| **Express** | v4 | HTTP API sunucusu |
| **TypeScript** | ~5.8 | Tip güvenli JavaScript |
| **tsx** | v4 | TypeScript'i doğrudan çalıştırma |
| **better-sqlite3** | v12 | SQLite veritabanı (kullanıcı kayıtları) |
| **bcryptjs** | v3 | Şifre hashleme |
| **jsonwebtoken** | v9 | JWT session token'ları |
| **cookie-parser** | v1.4 | HTTP cookie okuma |
| **uuid** | v14 | Benzersiz kullanıcı ID üretme |
| **dotenv** | v17 | `.env` dosyasından ortam değişkeni yükleme |

### Frontend (React)

| Teknoloji | Versiyon | Kullanım Amacı |
|-----------|----------|----------------|
| **React** | v19 | UI kütüphanesi |
| **TypeScript** | ~5.8 | Tip güvenli geliştirme |
| **Vite** | v6 | Hızlı build tool ve dev server |
| **Tailwind CSS** | v4 | Utility-first CSS framework |
| **React Router** | v7 | Sayfa yönlendirme (/, /stock/:symbol, /profile) |
| **lucide-react** | v0.546 | İkon kütüphanesi |
| **Web Speech API** | Tarayıcı | Mikrofon (konuşma tanıma) + TTS (sesli okuma) |

### AI / Sesli Asistan (Python)

| Teknoloji | Versiyon | Kullanım Amacı |
|-----------|----------|----------------|
| **Python** | 3.11+ | Runtime |
| **websockets** | v13+ | WebSocket sunucusu (async) |
| **google-genai** | v1.29+ | Google Gemini AI API |
| **httpx** | v0.28+ | HTTP istemcisi |
| **python-dotenv** | v1.0+ | `.env` dosyası okuma |

### Dış Servisler

| Servis | Kullanım |
|--------|---------|
| **Yahoo Finance API** | Canlı BIST hisse fiyatları (ücretsiz, gecikmeli) |
| **Google Gemini AI** | Sesli asistan yanıtları (`gemini-2.5-flash`, env ile override) |

---

## Veri Akışı

```
┌─────────────────────────────────────────────────┐
│              KULLANICI (Tarayıcı)                │
│                                                   │
│  React App (port 3001)                           │
│  ├── Dashboard / Home / StockDetail              │
│  │   → /api/stocks/* + /api/portfolio/*          │
│  ├── AuthModal → /api/auth/*                     │
│  ├── GlobalAssistant → ws://localhost:8001       │
│  ├── AccessibleShell → APP_EVENTS üstünden        │
│  │   assistantListen / assistantQuery            │
│  └── CommandPalette / Kısayollar                 │
│      → APP_EVENTS + Router navigasyon            │
└────────────────┬────────────────────┬────────────┘
                 │                    │
    ┌────────────▼──────────┐   ┌────▼──────────────┐
    │  Express Backend      │   │  Python AI Server  │
    │  (backend/server.ts)  │   │  (ai/voice_        │
    │                       │   │   assistant.py)    │
    │  • /api/stocks/*      │   │                    │
    │    → Yahoo Finance    │   │  • WebSocket       │
    │  • /api/auth/*        │   │  • Gemini streaming│
    │  • /api/portfolio/*   │   │                    │
    │    → SQLite DB        │   └────────────────────┘
    └───────────────────────┘
```

---

## API Endpoint'leri

### Hisse Verileri
| Method | Endpoint | Açıklama |
|--------|----------|---------|
| GET | `/api/stocks/quotes` | BIST listesi için canlı fiyatlar |
| POST | `/api/stocks/predict` | Teknik analiz tahminleri (gruplanmış skor + ATR) |

### Kullanıcı Auth
| Method | Endpoint | Açıklama |
|--------|----------|---------|
| POST | `/api/auth/register` | Yeni hesap oluştur (name, email, password) |
| POST | `/api/auth/login` | Giriş yap (email, password) |
| GET | `/api/auth/me` | Aktif oturumu kontrol et |
| POST | `/api/auth/logout` | Çıkış yap |

### Portföy (auth zorunlu, `requireAuth` middleware)
| Method | Endpoint | Açıklama |
|--------|----------|---------|
| GET  | `/api/portfolio` | Tam snapshot (cash, holdings, transactions, registered, pinned) |
| POST | `/api/portfolio/buy` | `{ symbol, quantity, price }` — atomic transaction |
| POST | `/api/portfolio/sell` | `{ symbol, quantity, price }` |
| POST | `/api/portfolio/deposit` | `{ amount }` |
| POST | `/api/portfolio/withdraw` | `{ amount }` |
| POST | `/api/portfolio/registered/toggle` | `{ symbol }` |
| POST | `/api/portfolio/pinned/toggle` | `{ symbol }` |
| POST | `/api/portfolio/import` | Anonim localStorage portföyünü server'a aktarır (sunucu boşsa) |

### AI Asistan
| Protokol | Adres | Açıklama |
|----------|-------|---------|
| WebSocket | `ws://localhost:8001` | Sesli asistan sorgu/yanıt akışı |

---

## Teknik Analiz Algoritması

`backend/predictionEngine.ts` dosyasında uygulanmıştır.

**Giriş:** Yahoo Finance'den çekilen yaklaşık 2 yıllık günlük OHLCV verisi.

**Hesaplama blokları:**
- **Trend grubu:** SMA(5/10/20) konumu, MACD histogram, 5/20 günlük momentum
- **Osilatör grubu:** RSI(14), Bollinger %B
- **Hacim teyidi:** Son 5 gün hacminin önceki 15 güne oranı
- **Dinamik pencere:** Wilder ATR(14)% rejimine göre 48–130 gün
- **Hedef bandı:** `targetPrice ± 1 ATR`

**Çıktılar:**
- Trend etiketi: `Yukselis` / `Yatay` / `Dusuk seyir`
- Skor: `[-100, +100]`
- `signalConsistencyPercent`: model doğruluğu değil, sinyal tutarlılığı göstergesi

Eşik (`trendThresholdUsed`) değeri gerektiğinde walk-forward kalibrasyonla optimize edilir.

---

## Kimlik Doğrulama (Auth)

Email + şifre tabanlı, JWT cookie session:

1. Kullanıcı kayıt olur → şifre bcrypt ile hashlenir → SQLite'a kaydedilir
2. Giriş yapılır → şifre doğrulanır → 30 günlük JWT cookie atanır
3. Her sayfa yüklemesinde `/api/auth/me` ile session kontrol edilir
4. Çıkış yapılınca cookie temizlenir

**Veritabanı:** `finto.db` (SQLite, WAL mode, otomatik oluşur)

**JWT_SECRET kuralı:**
- `NODE_ENV=production` ise `JWT_SECRET` zorunludur ve **en az 32 karakter** olmalı; aksi halde sunucu başlamaz.
- Geliştirmede yoksa konsola uyarı verilir, geçici bir secret kullanılır.
- Cookie `Secure` flag'i sadece production'da set edilir.

---

## Portföy Yönetimi

İki kipte çalışır:

**1. Anonim ziyaretçi (giriş yapılmamış)**
Portföy `localStorage`'da tutulur:

| Anahtar | İçerik |
|---------|--------|
| `finto_cash` | Nakit bakiye (TL) |
| `finto_holdings` | Hisse pozisyonları (JSON) |
| `finto_transactions` | Son 50 işlem |
| `finto_registered_symbols` | Portföye kayıtlı semboller |
| `finto_pinned_symbols` | Favoriler |
| `finto_dark` | Dark mode tercihi |
| `finto_voice_config` | Ses hızı, tonu vb. |
| `finto_accessibility_settings` | Kısayollar, erişilebilir mod, kısa metin modu |

**2. Giriş yapmış kullanıcı**
SQLite tablolarına yazılır: `portfolios`, `holdings`, `transactions`, `preferences`. Alım/satım/transfer işlemleri **atomik SQLite transaction** içinde yürütülür (yetersiz bakiye, overflow vs. kontrolleri).

**Geçiş davranışı:** Bir kullanıcı ilk kez giriş yaptığında, eğer localStorage'da portföyü varsa **ve** sunucudaki portföyü tamamen boşsa, lokal portföy `POST /api/portfolio/import` ile aktarılır ve localStorage temizlenir. Sonraki girişlerde server otoritedir.

---

## Sesli Asistan Akışı

```
Kullanıcı mikrofona basar (veya assistantQuery event'i gönderir)
        ↓
Web Speech API (tarayıcı) → ses → metin dönüşümü
        ↓
GlobalAssistant.tsx
  ├─ önce yerel intent parse (voiceCommands + App handleVoiceCommand)
  └─ handled değilse WebSocket (ws://localhost:8001)
        ↓
voice_assistant.py → Gemini API'ye gönderir
        ↓
Gemini yanıtı token token gelir (streaming)
        ↓
Her token → WebSocket chunk → React'ta sohbet baloncuğuna eklenir
        ↓
Yanıt biter → TTS (SpeechSynthesis API) ile seslendirilir
        ↓
assistantResponse event'i ile AccessibleShell "Son söylenen" alanı güncellenir
```

---

## Erişilebilirlik Katmanı

Yeni erişilebilirlik mimarisi üç seviyede çalışır:

1. **Ayar ve Konfigürasyon**
   - `useAccessibilitySettings.tsx` + `accessibilityConfig.ts`
   - Özelleştirilebilir kısayollar, kısa metin modu, erişilebilir mod bayrağı
   - localStorage anahtarı: `finto_accessibility_settings`

2. **Girdi Katmanı**
   - `useKeyboardShortcuts.ts` global kısayolları yönetir (`Alt+A/M/O/K/E`, `Esc`, `Shift+?`, `Shift+G` prefiksi)
   - `voiceCommands.ts` Türkçe sesli komutları intent'lere çevirir (nakit, portföy özeti, hisseler, al/sat, mod geçişi)

3. **Event Omurgası**
   - `appEvents.ts` ile UI bileşenleri gevşek bağlı haberleşir
   - Önemli eventler: `assistantListen`, `assistantSpeak`, `assistantQuery`, `assistantResponse`, `layerCloseTop`
   - `AccessibleShell`, `GlobalAssistant`, `App` ve modal katmanları aynı event protokolünü paylaşır

---

## Ortam Değişkenleri (`.env`)

```env
# Google Gemini AI (sesli asistan için)
GEMINI_API_KEY="..."
GEMINI_MODEL="gemini-2.5-flash"   # opsiyonel, varsayılan bu model

# JWT şifreleme anahtarı (güçlü random bir string)
JWT_SECRET="..."

# Uygulama URL'si
APP_URL="http://localhost:3001"
```

---

## Kurulum ve Çalıştırma

### Gereksinimler
- **Node.js** v18+ → [nodejs.org](https://nodejs.org)
- **Python** 3.11+ → [python.org](https://python.org)
- **Google Gemini API key** → [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey) (ücretsiz)
- **Tarayıcı:** Chrome veya Edge (Web Speech API desteği için)

### 1. Repoyu klonla
```bash
git clone <repo-url>
cd Finto
```

### 2. Bağımlılıkları kur
```bash
# Node.js bağımlılıkları
npm install

# Python bağımlılıkları
pip install -r requirements.txt
```

### 3. `.env` dosyasını oluştur

PowerShell:
```powershell
Copy-Item .env.example .env
```

Bash / WSL:
```bash
cp .env.example .env
```

`.env` içeriği (üretim için `JWT_SECRET` en az 32 karakter olmalı):
```env
GEMINI_API_KEY="buraya_gemini_api_keyini_yaz"
JWT_SECRET="local-dev-secret-which-is-at-least-32-characters-long"
APP_URL="http://localhost:3001"
```

### 4. Çalıştır

`npm run dev` tek komutla `concurrently` üzerinden Express + Vite + Python sesli asistanı paralel başlatır:

```bash
npm run dev
```

→ Web: [http://localhost:3001](http://localhost:3001) · Sesli asistan: `ws://localhost:8001`

Sadece web (`dev:web`) ya da sadece ses (`dev:voice`) script'leri de mevcut.

### Üretim modunda çalıştırma

```bash
npm run build
npm start
```

`npm start` `cross-env` ile `NODE_ENV=production` ayarlar (Windows + Linux uyumlu).

---

## Geliştirme Notları

- **Yahoo Finance verisi gecikmeli** (~15 dk) — gerçek zamanlı borsa verisi değil
- **Teknik tahminler yatırım tavsiyesi değildir** — matematiksel kural tabanlı
- **Web Speech API** sadece Chrome ve Edge'de çalışır
- **Sesli asistan** için Python sunucusu (`python ai/voice_assistant.py`) ayrı terminalde çalışmalı
- **SQLite** dosyası (`finto.db`) git'e eklenmez, ilk çalıştırmada otomatik oluşur
- **Portföy verisi**: anonim ziyaretçi `localStorage`, giriş yapmış kullanıcı SQLite; ilk girişte otomatik import vardır
- **Erişilebilir mod** (`Alt+E`) ayrı bir sade kabuk (`AccessibleShell`) render eder; sesli işlemler event omurgasıyla GlobalAssistant'a yönlenir
- **Komut paleti** (`Alt+K`) ve sesli komutlar aynı komut modelini (`accessibilityConfig.ts`) kullanır
