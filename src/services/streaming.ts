/** Server-sent-event reading and per-provider delta parsing. Pure and unit-tested. */

export interface SseEvent {
  event?: string;
  data: string;
}

export interface StreamDelta {
  text?: string;
  tokensIn?: number;
  tokensOut?: number;
}

export const STREAM_IDLE_MS = 60_000;

/** Parses one SSE block (lines between blank lines). */
export function parseSseBlock(block: string): SseEvent | null {
  let event: string | undefined;
  const data: string[] = [];
  for (const line of block.split(/\r?\n/)) {
    if (line.startsWith('event:')) event = line.slice(6).trim();
    else if (line.startsWith('data:')) data.push(line.slice(5).replace(/^ /, ''));
  }
  return data.length ? { event, data: data.join('\n') } : null;
}

export async function* readSse(
  body: ReadableStream<Uint8Array>,
  idleMs = STREAM_IDLE_MS
): AsyncGenerator<SseEvent> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  try {
    for (;;) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const stalled = new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('The response stream stalled.')), idleMs);
      });
      let chunk: ReadableStreamReadResult<Uint8Array>;
      try {
        chunk = await Promise.race([reader.read(), stalled]);
      } finally {
        clearTimeout(timer);
      }
      if (chunk.done) break;
      buffer += decoder.decode(chunk.value, { stream: true });
      const parts = buffer.split(/\r?\n\r?\n/);
      buffer = parts.pop() ?? '';
      for (const part of parts) {
        const ev = parseSseBlock(part);
        if (ev) yield ev;
      }
    }
    buffer += decoder.decode();
    const tail = parseSseBlock(buffer);
    if (tail) yield tail;
  } finally {
    reader.cancel().catch(() => undefined);
  }
}

const safeJson = (s: string): any => {
  try {
    return JSON.parse(s);
  } catch {
    return null;
  }
};

export function parseOpenAiEvent(ev: SseEvent): StreamDelta | null {
  if (ev.data.trim() === '[DONE]') return null;
  const j = safeJson(ev.data);
  if (!j) return null;
  const delta: StreamDelta = {};
  const text = j.choices?.[0]?.delta?.content;
  if (typeof text === 'string') delta.text = text;
  if (j.usage) {
    delta.tokensIn = j.usage.prompt_tokens;
    delta.tokensOut = j.usage.completion_tokens;
  }
  return delta;
}

export function parseAnthropicEvent(ev: SseEvent): StreamDelta | null {
  const j = safeJson(ev.data);
  if (!j) return null;
  if (j.type === 'error') throw new Error(j.error?.message || 'Anthropic stream error');
  if (j.type === 'content_block_delta' && typeof j.delta?.text === 'string') return { text: j.delta.text };
  if (j.type === 'message_start' && j.message?.usage)
    return { tokensIn: j.message.usage.input_tokens, tokensOut: j.message.usage.output_tokens };
  if (j.type === 'message_delta' && j.usage) return { tokensOut: j.usage.output_tokens };
  return null;
}

export function parseGeminiEvent(ev: SseEvent): StreamDelta | null {
  const j = safeJson(ev.data);
  if (!j) return null;
  const parts = j.candidates?.[0]?.content?.parts;
  const text = Array.isArray(parts) ? parts.map((p: any) => p.text ?? '').join('') : undefined;
  const delta: StreamDelta = {};
  if (text) delta.text = text;
  if (j.usageMetadata) {
    delta.tokensIn = j.usageMetadata.promptTokenCount;
    delta.tokensOut = j.usageMetadata.candidatesTokenCount;
  }
  return delta;
}

/** Accumulates a stream. `onToken` receives the full text so far. */
export async function consumeStream(
  body: ReadableStream<Uint8Array>,
  parse: (ev: SseEvent) => StreamDelta | null,
  onToken?: (textSoFar: string) => void,
  idleMs?: number
): Promise<{ text: string; tokensIn?: number; tokensOut?: number }> {
  let text = '';
  let tokensIn: number | undefined;
  let tokensOut: number | undefined;
  for await (const ev of readSse(body, idleMs)) {
    const d = parse(ev);
    if (!d) continue;
    if (d.tokensIn !== undefined) tokensIn = d.tokensIn;
    if (d.tokensOut !== undefined) tokensOut = d.tokensOut;
    if (d.text) {
      text += d.text;
      onToken?.(text);
    }
  }
  return { text, tokensIn, tokensOut };
}
