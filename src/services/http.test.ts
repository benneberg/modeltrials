import { describe, expect, it } from 'vitest';
import { fetchWithRetry, retryDelayMs } from './http';

const res = (status: number, headers: Record<string, string> = {}) =>
  new Response('x', { status, headers });

describe('fetchWithRetry', () => {
  it('retries 429 then succeeds', async () => {
    const seq = [res(429), res(503), res(200)];
    const slept: number[] = [];
    const out = await fetchWithRetry('u', {}, {
      fetchImpl: (async () => seq.shift()!) as typeof fetch,
      sleep: async (ms) => void slept.push(ms),
    });
    expect(out.status).toBe(200);
    expect(slept).toHaveLength(2);
  });

  it('gives up after MAX_RETRIES and returns the last response', async () => {
    let calls = 0;
    const out = await fetchWithRetry('u', {}, {
      fetchImpl: (async () => (calls++, res(500))) as typeof fetch,
      sleep: async () => undefined,
    });
    expect(out.status).toBe(500);
    expect(calls).toBe(3);
  });

  it('does not retry client errors', async () => {
    let calls = 0;
    const out = await fetchWithRetry('u', {}, {
      fetchImpl: (async () => (calls++, res(401))) as typeof fetch,
      sleep: async () => undefined,
    });
    expect(out.status).toBe(401);
    expect(calls).toBe(1);
  });

  it('honours Retry-After and caps it', () => {
    expect(retryDelayMs(0, '3')).toBe(3000);
    expect(retryDelayMs(0, '9999')).toBe(20000);
    expect(retryDelayMs(1, null, () => 0)).toBe(2000);
  });
});
