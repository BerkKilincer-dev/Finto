# Finto — Yapay Zeka Destekli BIST Finans Asistanı

Finto, Borsa İstanbul (BIST) hisselerini gerçek zamanlı takip eden, teknik analiz tahminleri sunan ve sesli yapay zeka asistanı içeren bir finans platformudur.

---

## Proje Yapısı

```
Finto/
├── backend/                  # Express API sunucusu
│   ├── server.ts             # REST API endpoint'leri
│   └── predictionEngine.ts   # Teknik analiz algoritması (SMA, RSI, Momentum)
├── frontend/                 # React uygulaması
│   ├── src/
│   │   ├── App.tsx           # Global state ve veri yönetimi
│   │   ├── pages/
│   │   │   ├── Dashboard.tsx     # Portföy ve piyasa özeti
│   │   │   └── StockDetail.tsx   # Hisse detay sayfası
│   │   ├── components/
│   │   │   └── GlobalAssistant.tsx  # Sesli asistan UI
│   │   ├── hooks/
│   │   │   └── useVoiceAssistant.ts # Web Speech API hook
│   │   └── data/
│   │       └── bistWatchlist.ts  # Takip edilen BIST hisseleri
│   ├── index.html
│   └── vite.config.ts
├── ai/                       # Python sesli asistan sunucusu
│   ├── voice_assistant.py    # WebSocket + Gemini AI
│   └── requirements.txt
├── .env                      # API anahtarları (git'e eklenmez)
└── package.json
```

---

## Veriler Nereden Geliyor?

| Veri | Kaynak | Güncelleme Sıklığı |
|------|--------|-------------------|
| Hisse fiyatları | Yahoo Finance API | Her 60 saniyede bir |
| Günlük % değişim | Yahoo Finance API | Her 60 saniyede bir |
| Teknik tahminler | Kendi algoritması (SMA + RSI + Momentum) | Her 5 dakikada bir |
| Portföy / Nakit | Tarayıcı localStorage | Anlık (alım/satımda) |
| Sesli yanıtlar | Google Gemini AI | Her soruda |

> Yahoo Finance gecikmeli veri sağlar (~15 dakika). Gerçek zamanlı borsa verisi değildir.

---

## Teknik Analiz Nasıl Çalışır?

`backend/predictionEngine.ts` dosyası Yahoo Finance'den çekilen 3 aylık geçmiş kapanış fiyatlarını işler:

- **SMA** (5, 10, 20 günlük basit hareketli ortalama)
- **RSI** (14 günlük göreceli güç endeksi)
- **Momentum** (5 ve 20 günlük fiyat değişimi)

Bu göstergeler -100 ile +100 arasında bir skor üretir:

| Skor | Trend |
|------|-------|
| ≥ 22 | Yükseliş |
| ≤ -22 | Düşüş |
| -22 ile 22 arası | Yatay |

Hedef fiyat: `Mevcut Fiyat × (1 + Skor/100 × %3.5)`

---

## Kurulum ve Çalıştırma

### Gereksinimler
- Node.js 18+
- Python 3.11+
- Google Gemini API anahtarı

### 1. Bağımlılıkları Kur

```bash
# Node.js bağımlılıkları
npm install

# Python bağımlılıkları
pip install -r requirements.txt
```

### 2. Ortam Değişkenlerini Ayarla

`.env` dosyasını oluştur:

```env
GEMINI_API_KEY="senin_gemini_api_keyin"
```

Gemini API key almak için: [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)

### 3. Çalıştır

**Terminal 1 — Web Sunucusu (Express + React):**
```bash
npm run dev
```
→ [http://localhost:3001](http://localhost:3001) adresinde açılır

**Terminal 2 — Sesli Asistan (Python):**
```bash
python ai/voice_assistant.py
```
→ WebSocket sunucusu `ws://localhost:8001` adresinde başlar

---

## Özellikler

- **Canlı BIST Takibi** — 12 BIST 30 hissesinin anlık fiyat ve değişimlerini görüntüle
- **Teknik Analiz** — SMA, RSI ve momentum bazlı otomatik tahmin motoru
- **Portföy Yönetimi** — Hisse al, nakit çek, portföy değerini takip et
- **Sesli AI Asistan** — Mikrofona konuş, Finto sayfa bağlamını okuyarak yanıt verir
- **Erişilebilirlik** — Görme engelli kullanıcılar için sesli arayüz desteği

---

## Kullanılan Teknolojiler

| Katman | Teknoloji |
|--------|-----------|
| Frontend | React 19, TypeScript, Tailwind CSS, Vite |
| Backend | Node.js, Express, TypeScript |
| AI Asistan | Python, FastAPI (WebSocket), Google Gemini |
| Veri | Yahoo Finance API (gecikmeli) |
| Ses | Web Speech API (tarayıcı yerleşik) |

---

## Önemli Notlar

- Portföy verileri tarayıcının `localStorage`'ında saklanır — sunucuda veritabanı yoktur
- Tarayıcı geçmişini temizlersen portföy sıfırlanır
- Teknik tahminler yatırım tavsiyesi değildir
- Web Speech API yalnızca Chrome ve Edge tarayıcılarında çalışır
