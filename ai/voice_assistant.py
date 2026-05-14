import asyncio
import json
import os

from websockets.asyncio.server import serve, ServerConnection
from dotenv import load_dotenv
from google import genai
from google.genai import types

load_dotenv(os.path.join(os.path.dirname(__file__), '..', '.env'))

# Model env ile override edilebilir; varsayılan 2.5-flash (kaliteli + free tier'ı geniş).
GEMINI_MODEL = os.getenv("GEMINI_MODEL", "gemini-2.5-flash")

GREETING = (
    "Merhaba! Ben Finto, yapay zeka finans asistanınım. "
    "Size BIST hisselerini analiz etme, portföyünüzü takip etme, "
    "genel finans sorularını yanıtlama ve siteyi nasıl kullanacağınız konusunda yardımcı olabilirim. "
    "Nasıl yardımcı olabilirim?"
)

SYSTEM_PROMPT = """Sen "Finto" adında bir yapay zeka finans asistanısın. Finto uygulaması, Borsa İstanbul hisselerini takip eden, portföy yönetimi sunan ve yapay zeka destekli sesli asistanı olan bir finans platformudur.

KİMLİĞİN:
- Adın Finto'dur, kibarca ve güvenilir bir finans danışmanısın.
- Hem görme engelli kullanıcılara hem de standart kullanıcılara hizmet verirsin.
- Türkçe konuşursun, sade ve anlaşılır bir dil kullanırsın.

YAPABİLECEKLERİN:
1. BIST Hisse Analizi: Hisse fiyatları, günlük değişimler, teknik tahminler (SMA, RSI, momentum), trend analizi, hedef fiyat yorumları.
2. Portföy Takibi: Kullanıcının toplam bakiyesi, nakit durumu, elindeki hisseler, ortalama maliyet, kar/zarar durumu.
3. Genel Finans Soruları: Borsa nasıl çalışır, SMA nedir, RSI ne anlama gelir, lot nedir, temettü nedir gibi eğitici sorular.
4. Site Kullanımı: Hisse nasıl alınır, nakit nasıl çekilir, hangi sayfada ne vardır, teknik tahmin nasıl okunur.

SAYFA BAĞLAMI:
Kullanıcının bulunduğu sayfa ve sayfadaki veriler sana iletilir. Bu verileri kullanarak kişiselleştirilmiş yanıtlar ver.

KATI KURALLAR (Sesli Asistan Formatı):
1. ASLA markdown formatı kullanma (*, **, #, - vb.).
2. ASLA tablo, liste veya kod bloğu oluşturma.
3. Sayıları ve yüzdeleri okunuşuyla yaz: "%5.2" yerine "yüzde beş virgül iki", "100.000" yerine "yüz bin", "₺" yerine "Türk lirası".
4. Tüm yanıt dümdüz, akıcı, tek bir paragraf olmalı — sanki radyoda konuşuyormuşsun gibi.
5. Kısa ve net yanıt ver, gereksiz uzatma.
6. Eğer sayfada veri varsa önce onu kullan, yoksa genel bilgi ver."""


async def handle(ws: ServerConnection):
    # Bağlantı açılır açılmaz karşılama gönder
    await ws.send(json.dumps({"type": "greeting", "text": GREETING}, ensure_ascii=False))

    api_key = os.getenv("GEMINI_API_KEY", "")
    if not api_key or api_key == "MY_GEMINI_API_KEY":
        await ws.send(json.dumps({"type": "error", "message": "GEMINI_API_KEY tanımlı değil."}, ensure_ascii=False))
        return

    os.environ.pop("GOOGLE_API_KEY", None)
    client = genai.Client(api_key=api_key)

    try:
        async for raw in ws:
            try:
                data = json.loads(raw)
            except json.JSONDecodeError:
                await ws.send(json.dumps({"type": "error", "message": "Geçersiz JSON."}, ensure_ascii=False))
                continue

            query = data.get("query", "").strip()
            current_path = data.get("path", "")
            page_context = data.get("context", "")

            if not query:
                await ws.send(json.dumps({"type": "error", "message": "Sorgu boş olamaz."}, ensure_ascii=False))
                continue

            system_with_context = (
                f"{SYSTEM_PROMPT}\n\n"
                f"ŞU ANKİ BAĞLAM:\n"
                f"- Kullanıcının Bulunduğu Sayfa: {current_path or 'Bilinmiyor'}\n"
                f"- Sayfadaki Aktif Veri: {page_context or 'Veri Yok'}"
            )

            sent_any_chunk = False
            try:
                loop = asyncio.get_running_loop()

                def open_stream():
                    return client.models.generate_content_stream(
                        model=GEMINI_MODEL,
                        contents=query,
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
                        await ws.send(json.dumps({"type": "chunk", "text": text}, ensure_ascii=False))

                await ws.send(json.dumps({"type": "done"}, ensure_ascii=False))

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
                # Eğer akış başlamışsa önce done gönder ki frontend "düşünüyor" stuck kalmasın,
                # sonra error gönder; frontend hata mesajını ek bir baloncuk olarak gösterir.
                if sent_any_chunk:
                    try:
                        await ws.send(json.dumps({"type": "done"}, ensure_ascii=False))
                    except Exception:
                        pass
                await ws.send(json.dumps({"type": "error", "message": user_msg}, ensure_ascii=False))

    except Exception as e:
        if "1000" not in str(e) and "1001" not in str(e):
            print(f"Bağlantı hatası: {e}")


async def main():
    port = int(os.getenv("VOICE_PORT", "8001"))
    print(f"Finto Voice Assistant (Gemini, model={GEMINI_MODEL}) — ws://0.0.0.0:{port}")
    async with serve(
        handle,
        "0.0.0.0",
        port,
        origins=None,
        # 30 saniyede bir ping; 60 saniyede pong gelmezse bağlantı düşür.
        ping_interval=30,
        ping_timeout=60,
    ):
        await asyncio.Future()


if __name__ == "__main__":
    asyncio.run(main())
