/**
 * Yahoo Finance chart istekleri icin: zaman asimi + exponential backoff ile yeniden deneme.
 * Agresif paralel isteklerde baglanti zaman asimini azaltmaya yardim eder.
 */

const DEFAULT_TIMEOUT_MS = 25_000;
const DEFAULT_RETRIES = 2;

export async function fetchYahooChart(
  url: string,
  options?: { timeoutMs?: number; retries?: number },
): Promise<Response> {
  const timeoutMs = options?.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const maxAttempts = (options?.retries ?? DEFAULT_RETRIES) + 1;

  let lastError: unknown;
  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, {
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
        signal: controller.signal,
      });
      clearTimeout(timer);
      if (res.ok) return res;
      lastError = new Error(`Yahoo HTTP ${res.status}`);
    } catch (e) {
      clearTimeout(timer);
      lastError = e;
    }

    if (attempt < maxAttempts - 1) {
      const backoff = 350 * 2 ** attempt;
      await new Promise((r) => setTimeout(r, backoff));
    }
  }

  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

/** Dizi islerini N'lik gruplar halinde sirali calistir (Yahoo'yu bogmayi azaltir) */
export async function mapInChunks<T, R>(
  items: T[],
  chunkSize: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < items.length; i += chunkSize) {
    const chunk = items.slice(i, i + chunkSize);
    const part = await Promise.all(chunk.map((item) => fn(item)));
    out.push(...part);
    if (i + chunkSize < items.length) {
      await new Promise((r) => setTimeout(r, 120));
    }
  }
  return out;
}
