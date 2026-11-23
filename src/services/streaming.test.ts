import { describe, expect, it } from 'vitest';
import { buildProviderRequest } from './providers';
import {
  consumeStream,
  parseAnthropicEvent,
  parseGeminiEvent,
  parseOpenAiEvent,
  parseSseBlock,
} from './streaming';
import type { ModelDefinition } from '../types/trial';

const streamOf = (chunks: string[]) =>
  new ReadableStream<Uint8Array>({
    start(c) {
      const enc = new TextEncoder();
      chunks.forEach((x) => c.enqueue(enc.encode(x)));
      c.close();
    },
  });

const model = (provider: ModelDefinition['provider'], endpoint = 'https://x/y'): ModelDefinition =>
  ({ id: 'm', provider, endpoint, modelId: 'mid', costPer1kInput: 0, costPer1kOutput: 0 }) as ModelDefinition;

describe('SSE reading', () => {
  it('reassembles events split across chunk boundaries and CRLF', async () => {
    const body = streamOf([
      'data: {"choices":[{"delta":{"content":"Hel',
      'lo"}}]}\r\n\r\ndata: {"choices":[{"delta":{"content":" world"}}]}\n\n',
      'data: {"usage":{"prompt_tokens":5,"completion_tokens":2},"choices":[]}\n\ndata: [DONE]\n\n',
    ]);
    const seen: string[] = [];
    const out = await consumeStream(body, parseOpenAiEvent, (t) => seen.push(t));
    expect(out.text).toBe('Hello world');
    expect(seen).toEqual(['Hello', 'Hello world']);
    expect(out).toMatchObject({ tokensIn: 5, tokensOut: 2 });
  });

  it('times out a stalled stream', async () => {
    const body = new ReadableStream<Uint8Array>({ start() {} });
    await expect(consumeStream(body, parseOpenAiEvent, undefined, 30)).rejects.toThrow(/stalled/);
  });

  it('parseSseBlock ignores comments and joins multi-line data', () => {
    expect(parseSseBlock(': ping')).toBeNull();
    expect(parseSseBlock('event: x\ndata: a\ndata: b')).toEqual({ event: 'x', data: 'a\nb' });
  });
});

describe('provider parsers', () => {
  it('anthropic: text, usage and errors', () => {
    expect(parseAnthropicEvent({ data: '{"type":"content_block_delta","delta":{"text":"hi"}}' })).toEqual({ text: 'hi' });
    expect(parseAnthropicEvent({ data: '{"type":"message_start","message":{"usage":{"input_tokens":9,"output_tokens":1}}}' })).toEqual({ tokensIn: 9, tokensOut: 1 });
    expect(parseAnthropicEvent({ data: '{"type":"message_delta","usage":{"output_tokens":40}}' })).toEqual({ tokensOut: 40 });
    expect(() => parseAnthropicEvent({ data: '{"type":"error","error":{"message":"overloaded"}}' })).toThrow(/overloaded/);
  });

  it('gemini: joins parts and reads usage', () => {
    const d = parseGeminiEvent({
      data: JSON.stringify({
        candidates: [{ content: { parts: [{ text: 'a' }, { text: 'b' }] } }],
        usageMetadata: { promptTokenCount: 3, candidatesTokenCount: 4 },
      }),
    });
    expect(d).toEqual({ text: 'ab', tokensIn: 3, tokensOut: 4 });
  });

  it('ignores malformed JSON instead of throwing', () => {
    expect(parseOpenAiEvent({ data: '{not json' })).toBeNull();
  });
});

describe('buildProviderRequest', () => {
  const hist = [{ role: 'user' as const, content: 'q' }, { role: 'assistant' as const, content: 'a' }];

  it('gemini: uses header auth, rewrites the endpoint and maps roles', () => {
    const m = model('gemini', 'https://g/v1beta/models/gemini-2.5-pro:generateContent');
    const s = buildProviderRequest(m, 'KEY', 'sys', hist, 'now', true);
    expect(s.url).toBe('https://g/v1beta/models/gemini-2.5-pro:streamGenerateContent?alt=sse');
    expect(s.url).not.toContain('KEY');
    expect(s.headers['x-goog-api-key']).toBe('KEY');
    const body = JSON.parse(s.body);
    expect(body.contents.map((c: any) => c.role)).toEqual(['user', 'model', 'user']);
    expect(buildProviderRequest(m, 'KEY', 's', [], 'p', false).url).toMatch(/:generateContent$/);
  });

  it('openai adds stream_options, other compatible hosts do not', () => {
    const o = JSON.parse(buildProviderRequest(model('openai'), 'k', 's', [], 'p', true).body);
    expect(o.stream).toBe(true);
    expect(o.stream_options).toEqual({ include_usage: true });
    const r = JSON.parse(buildProviderRequest(model('openrouter'), 'k', 's', [], 'p', true).body);
    expect(r.stream_options).toBeUndefined();
    expect(JSON.parse(buildProviderRequest(model('openai'), 'k', 's', [], 'p', false).body).stream).toBeUndefined();
  });

  it('anthropic keeps the system prompt out of messages', () => {
    const b = JSON.parse(buildProviderRequest(model('anthropic'), 'k', 'SYS', hist, 'p', true).body);
    expect(b.system).toBe('SYS');
    expect(b.messages.every((m: any) => m.role !== 'system')).toBe(true);
  });

  it('refuses unknown providers instead of silently simulating', () => {
    expect(() => buildProviderRequest(model('manual'), 'k', 's', [], 'p', false)).toThrow(/Unsupported/);
  });

  it('extractJson reads each provider shape', () => {
    expect(buildProviderRequest(model('openai'), 'k', 's', [], 'p', false).extractJson({ choices: [{ message: { content: 'x' } }] }).text).toBe('x');
    expect(buildProviderRequest(model('anthropic'), 'k', 's', [], 'p', false).extractJson({ content: [{ text: 'y' }] }).text).toBe('y');
    expect(buildProviderRequest(model('gemini', 'u:generateContent'), 'k', 's', [], 'p', false).extractJson({ candidates: [{ content: { parts: [{ text: 'z' }] } }] }).text).toBe('z');
  });
});
