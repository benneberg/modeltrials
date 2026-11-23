export const REQUEST_TIMEOUT_MS = 60_000;
const RETRYABLE = new Set([429, 500, 502, 503, 504]);
export const MAX_RETRIES = 2;

/** Seconds or HTTP-date, capped at 20s so a hostile header cannot hang the UI. */
export function retryDelayMs(attempt: number, retryAfter: string | null, rand = Math.random): number {
  if (retryAfter) {
    const secs = Number(retryAfter);
    const ms = Number.isFinite(secs) ? secs * 1000 : Date.parse(retryAfter) - Date.now();
    if (Number.isFinite(ms) && ms > 0) return Math.min(ms, 20_000);
  }
  // 1s, 2s, 4s ... plus up to 250ms jitter
  return 1000 * 2 ** attempt + Math.floor(rand() * 250);
}

interface Deps {
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
}

/** fetch with a per-attempt timeout and bounded retries on 429/5xx. Network errors are not retried. */
export async function fetchWithRetry(
  url: string,
  init: RequestInit,
  { fetchImpl = fetch, sleep = (ms) => new Promise((r) => setTimeout(r, ms)) }: Deps = {}
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetchImpl(url, { ...init, signal: controller.signal });
    } finally {
      clearTimeout(timer);
    }
    if (!RETRYABLE.has(res.status) || attempt >= MAX_RETRIES) return res;
    await sleep(retryDelayMs(attempt, res.headers.get('retry-after')));
  }
}
