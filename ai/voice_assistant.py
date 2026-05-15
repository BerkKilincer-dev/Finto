import asyncio
import json
import os
from collections import deque

from websockets.asyncio.server import serve, ServerConnection
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

# Per-connection konuşma geçmişinde tutulacak en fazla mesaj sayısı
# (user+assistant çiftleri sayılır, yani 6 = son 3 tur).
HISTORY_MAX_TURNS = 6

GREETING = (
    "Merhaba! Ben Finto, yapay zeka finans asistanınım. "
    "Size BIST hisselerini analiz etme, portföyünüzü takip etme, "
    "genel finans sorularını yanıtlama ve siteyi nasıl kullanacağınız konusunda yardımcı olabilirim. "
    "Nasıl yardımcı olabilirim?"
)

SYSTEM_PROMPT = """Sen "Finto" adında bir yapay zeka finans asistanısın. Finto, Borsa İstanbul (BIST) hisselerini gerçek zamanlı takip eden, sanal portföy yönetimi sunan ve sesli komutla kullanılabilen bir finans simülasyon platformudur. Verilerin Yahoo Finance kaynaklıdır ve yaklaşık 15 dakika gecikmeli olabilir.

═══════════════ KİMLİĞİN ═══════════════
- Adın Finto'dur. Sıcakkanlı ama profesyonel; aceleci değil, net konuşan bir finans danışmanısın.
- Hem görme engelli kullanıcılara (sesle dinleyen) hem de standart kullanıcılara hizmet verirsin.
- Her zaman Türkçe konuşursun. Yabancı kelime kullanmak zorunda kalırsan parantez içinde kısa Türkçe karşılığını ekle.
- Yatırım tavsiyesi vermezsin. Bilgi verir, mevcut veriyi yorumlarsın, kararı kullanıcıya bırakırsın.

═══════════════ FİNTO'NUN YAPABİLDİKLERİ ═══════════════
Kullanıcı sana sorduğunda doğru yönlendirme yapabilmen için platformun fonksiyonlarını bil:

PORTFÖY:
- Sanal nakit ile hisse alıp satabilir (gerçek para değildir, simülasyondur).
- "Aselsan beş lot al" gibi sesli komutla alım yapılır; satışta sistem onay ister.
- Nakit yatırma/çekme, hisseleri favorilere ekleme, kayıtlı semboller listesi tutma.
- Anonim ziyaretçide tarayıcıda (localStorage), giriş yapınca SQLite veritabanında saklanır.

TEKNİK ANALİZ ÇIKTILARI (predictionEngine):
- Trend etiketleri: "Yukseliş", "Yatay", "Düşük seyir" — bunlar etiket adıdır, yorumlamaz aynen söylersin.
- Trend skoru: -100 ile +100 arası; pozitif yükseliş eğilimi, negatif düşüş.
- Hedef bandı: tek nokta değil, "hedef fiyat ± 1 ATR" şeklinde belirsizlik aralığı. Mutlaka "yaklaşık", "civarı", "bandı" gibi ifadelerle aktar.
- signalConsistencyPercent: modelin DOĞRULUĞU DEĞİL, iç sinyallerin tutarlılığı. "Yüzde X tutarlılık" diye söyle, "Yüzde X doğru" deme.
- Bileşenler: SMA(5/10/20), MACD histogram, RSI(14), Bollinger %B, hacim teyidi, Wilder ATR(14)%.

SESLİ KOMUT VE KISAYOLLAR:
- Alt+A asistanı açar, Alt+M mikrofon, Alt+K komut paleti, Alt+E erişilebilir mod, Alt+O sayfayı oku.
- Sesli komutlarla alım/satım, fiyat sorgu, portföy okuma, navigasyon yapılabilir.
- Kullanıcı "nasıl alırım" derse: "Mikrofon açıkken 'Aselsan beş lot al' diyebilirsiniz" gibi somut örnek ver.

ERİŞİLEBİLİRLİK:
- Alt+E ile sade siyah-beyaz büyük yazılı kabuk açılır; ekran okuyucu ve klavye odaklı.
- Boşluk tuşu mikrofonu açar.

═══════════════ SAYFA BAĞLAMI KULLANIMI ═══════════════
Sana her sorguda kullanıcının BULUNDUĞU SAYFA ve SAYFADAKİ AKTİF VERİ iletilir.
- Bağlam varsa: önce onu kullan, sonra genelle. "Garanti tahmini" sorulduğunda eğer sayfa /stock/GARAN ise oradaki tahmin verisini al.
- "Bu hisse", "şu sayfa", "burada" gibi ifadeleri sayfa bağlamından çöz.
- Bağlam boşsa veya alakasızsa: nazikçe söyle ("Bu sayfada o hisse görünmüyor, ama genel olarak...") ve genel bilgi ver.

═══════════════ KISA HAFIZA ═══════════════
Son birkaç tur konuşma sana iletiliyor. "Peki onunla ilgili", "o zaman ne yapmalıyım", "neden öyle dedin" gibi takip sorularını önceki bağlamla yorumla. Konuyu birden değiştirirse de takip et — geçmişe takılma.

═══════════════ YATIRIM TAVSİYESİ SINIRI ═══════════════
- "Al/Sat" diye direkt tavsiye VERME. Onun yerine veriyi sun: "Trend skoru +30, yükseliş etiketinde, ama RSI yüksek; nihai karar size ait."
- "Kesin yükselir/düşer" deme. "Mevcut göstergeler X yönünde" gibi koşullu konuş.
- Kullanıcı ısrar ederse hatırlat: "Finto bir simülasyon ve eğitim platformudur, gerçek yatırım tavsiyesi vermem."

═══════════════ SESLİ ASİSTAN FORMAT KURALLARI (MUTLAK) ═══════════════
1. ASLA markdown kullanma: yıldız, kalın, başlık, tire, numara işareti yok.
2. ASLA tablo, madde listesi, kod bloğu oluşturma. Her şey akıcı paragraf.
3. Sayıları ve yüzdeleri OKUNUŞUYLA yaz:
   - "%5.2" → "yüzde beş virgül iki"
   - "1.234,56 TL" → "bin iki yüz otuz dört lira elli altı kuruş"
   - "100.000" → "yüz bin"
   - "₺" → "Türk lirası" veya "lira"
   - Sembol kodları (GARAN, ASELS) harf harf değil, yazıldığı gibi telaffuz edilir: "Garan", "Asels".
4. Tek paragraf, akıcı, doğal — radyo spikerinin konuşması gibi.
5. KISA OL: Genel sorularda 2-4 cümle, veri yorumunda en fazla 5 cümle yeterli. Kullanıcı "detaylı anlat" demedikçe uzatma.
6. Eğer sayfada veri varsa ÖNCE onu kullan, yoksa genel bilgi ver.
7. Emin değilsen "elimdeki veriye göre" diyerek belirsizliği belirt — uydurma.
8. Selamlama veya kapanış cümlesi (Buyurun, Umarım yardımcı olmuştur vs.) EKLEME — direkt cevaba geç."""

CONCISE_RULE = (
    "\n\nKISA YANIT MODU AKTİF: Yanıtın EN FAZLA 2 cümle olsun. "
    "Sadece kullanıcının sorduğu kritik bilgiyi ver, ekstra açıklama, "
    "uyarı veya genel kültür ekleme. Görme engelli kullanıcı dinliyor; her saniye değerli."
)


async def handle(ws: ServerConnection):
    # Bağlantı açılır açılmaz karşılama gönder
    await ws.send(json.dumps({"type": "greeting", "text": GREETING}, ensure_ascii=False))

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key == "MY_GEMINI_API_KEY":
        await ws.send(json.dumps({"type": "error", "message": "GEMINI_API_KEY tanımlı değil."}, ensure_ascii=False))
        return

    os.environ.pop("GOOGLE_API_KEY", None)
    client = genai.Client(api_key=api_key)

    # Per-connection konuşma geçmişi: [(role, text), ...]
    # role ∈ {"user", "model"}; Gemini'nin contents formatına çevriliyor.
    history: deque = deque(maxlen=HISTORY_MAX_TURNS * 2)

    # Aktif Gemini sorgusunun task'i — yeni sorgu gelince eskisini cancel ederiz.
    current_task: asyncio.Task | None = None

    async def run_query(query: str, current_path: str, page_context: str, concise: bool):
        """Tek bir sorguyu Gemini'ye gönderip stream'i ws'a aktarır."""
        system_with_context = (
            f"{SYSTEM_PROMPT}\n\n"
            f"ŞU ANKİ BAĞLAM:\n"
            f"- Kullanıcının Bulunduğu Sayfa: {current_path or 'Bilinmiyor'}\n"
            f"- Sayfadaki Aktif Veri: {page_context or 'Veri Yok'}"
        )
        if concise:
            system_with_context += CONCISE_RULE

        # Gemini contents: önce geçmiş, sonra şu anki user mesajı.
        contents = [
            types.Content(role=role, parts=[types.Part.from_text(text=text)])
            for role, text in history
        ]
        contents.append(types.Content(role="user", parts=[types.Part.from_text(text=query)]))

        sent_any_chunk = False
        full_response = ""
        try:
            loop = asyncio.get_running_loop()

            def open_stream():
                return client.models.generate_content_stream(
                    model=GEMINI_MODEL,
                    contents=contents,
                    config=types.GenerateContentConfig(
                        system_instruction=system_with_context,
                        temperature=0.7,
                    ),
                )

            stream = await loop.run_in_executor(None, open_stream)
            stream_iter = iter(stream)
            SENTINEL = object()

            def next_chunk():
                try:
                    return next(stream_iter)
                except StopIteration:
                    return SENTINEL

            while True:
                chunk = await loop.run_in_executor(None, next_chunk)
                if chunk is SENTINEL:
                    break
                text = getattr(chunk, "text", None)
                if text:
                    sent_any_chunk = True
                    full_response += text
                    await ws.send(json.dumps({"type": "chunk", "text": text}, ensure_ascii=False))

            await ws.send(json.dumps({"type": "done"}, ensure_ascii=False))

            # Başarılı tamamlandıysa geçmişe ekle
            if full_response.strip():
                history.append(("user", query))
                history.append(("model", full_response))

        except asyncio.CancelledError:
            # Yeni sorgu geldi, eski stream iptal edildi. Frontend'e "cancelled" bildir
            # ki "düşünüyor" stuck kalmasın. Geçmişe yarım yanıtı eklemiyoruz.
            try:
                if sent_any_chunk:
                    await ws.send(json.dumps({"type": "done"}, ensure_ascii=False))
                await ws.send(json.dumps({"type": "cancelled"}, ensure_ascii=False))
            except Exception:
                pass
            raise

        except Exception as e:
            err = str(e)
            if "429" in err or "RESOURCE_EXHAUSTED" in err:
                user_msg = (
                    "Gemini API kota limitine ulasildi. Biraz bekleyip tekrar deneyin "
                    "veya AI Studio'dan kota/faturalandirma ayarlarini kontrol edin."
                )
            elif "403" in err or "PERMISSION_DENIED" in err:
                user_msg = "Gemini API erisim izni reddedildi. API anahtarini ve proje izinlerini kontrol edin."
            else:
                user_msg = err[:200] or "Beklenmeyen bir hata olustu."
            if sent_any_chunk:
                try:
                    await ws.send(json.dumps({"type": "done"}, ensure_ascii=False))
                except Exception:
                    pass
            await ws.send(json.dumps({"type": "error", "message": user_msg}, ensure_ascii=False))

    try:
        async for raw in ws:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(json.dumps({"type": "error", "message": "Geçersiz JSON."}, ensure_ascii=False))
                continue

            # Kontrol mesajları
            msg_type = data.get("type")
            if msg_type == "abort":
                # Frontend açıkça "şu anki yanıtı durdur" dedi.
                if current_task and not current_task.done():
                    current_task.cancel()
                continue
            if msg_type == "reset":
                # Konuşma geçmişini sıfırla.
                history.clear()
                await ws.send(json.dumps({"type": "reset_ack"}, ensure_ascii=False))
                continue

            query = data.get("query", "").strip()
            current_path = data.get("path", "")
            page_context = data.get("context", "")
            concise = bool(data.get("concise", False))

            if not query:
                await ws.send(json.dumps({"type": "error", "message": "Sorgu boş olamaz."}, ensure_ascii=False))
                continue

            # Yeni sorgu geldi: önceki hala devam ediyorsa iptal et.
            if current_task and not current_task.done():
                current_task.cancel()
                try:
                    await current_task
                except (asyncio.CancelledError, Exception):
                    pass

            current_task = asyncio.create_task(
                run_query(query, current_path, page_context, concise)
            )
            # Burada await ETME — task arka planda çalışsın, biz yeni mesajları
            # dinlemeye devam edelim ki abort/yeni-sorgu anında işlensin.

    except Exception as e:
        if "1000" not in str(e) and "1001" not in str(e):
            print(f"Bağlantı hatası: {e}")
    finally:
        # Bağlantı kapanırken çalışan task'i temizle
        if current_task and not current_task.done():
            current_task.cancel()


async def main():
    port = int(os.getenv("VOICE_PORT", "8001"))
    # Origin allow-list: APP_URL .env'den. Geliştirmede localhost varyantlarını da kabul et.
    app_url = os.getenv("APP_URL", "http://localhost:3001")
    allowed_origins = {
        app_url,
        "http://localhost:3001",
        "http://127.0.0.1:3001",
        "http://localhost:5173",  # Vite dev fallback
    }
    print(f"Finto Voice Assistant (Gemini, model={GEMINI_MODEL}) — ws://0.0.0.0:{port}")
    print(f"Allowed origins: {sorted(allowed_origins)}")
    async with serve(
        handle,
        "0.0.0.0",
        port,
        origins=list(allowed_origins),
        ping_interval=30,
        ping_timeout=60,
    ):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
