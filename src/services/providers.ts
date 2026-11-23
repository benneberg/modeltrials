import type { ModelDefinition } from '../types/trial';
import type { StreamDelta, SseEvent } from './streaming';
import { parseAnthropicEvent, parseGeminiEvent, parseOpenAiEvent } from './streaming';

export interface HistoryMessage {
  role: 'user' | 'assistant';
  content: string;
}

export interface ProviderRequest {
  url: string;
  headers: Record<string, string>;
  body: string;
  label: string;
  parseStreamEvent: (ev: SseEvent) => StreamDelta | null;
  extractJson: (data: any) => { text: string; tokensIn?: number; tokensOut?: number };
}

/** Builds the HTTP request for each provider. Pure so it can be tested without a network. */
export function buildProviderRequest(
  model: ModelDefinition,
  apiKey: string,
  systemPrompt: string,
  history: HistoryMessage[],
  userPrompt: string,
  stream: boolean
): ProviderRequest {
  const temperature = model.temperature ?? 0.3;

  if (model.provider === 'openai' || model.provider === 'openrouter' || model.provider === 'custom') {
    return {
      url: model.endpoint,
      label: 'Provider',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: model.modelId,
        temperature,
        messages: [{ role: 'system', content: systemPrompt }, ...history, { role: 'user', content: userPrompt }],
        ...(stream ? { stream: true } : {}),
        // Only OpenAI itself is guaranteed to accept this; other compatible hosts may reject unknown fields.
        ...(stream && model.provider === 'openai' ? { stream_options: { include_usage: true } } : {}),
      }),
      parseStreamEvent: parseOpenAiEvent,
      extractJson: (d) => ({
        text: d.choices?.[0]?.message?.content ?? '',
        tokensIn: d.usage?.prompt_tokens,
        tokensOut: d.usage?.completion_tokens,
      }),
    };
  }

  if (model.provider === 'anthropic') {
    return {
      url: model.endpoint,
      label: 'Anthropic',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'anthropic-dangerous-direct-browser-access': 'true',
      },
      body: JSON.stringify({
        model: model.modelId,
        max_tokens: 1024,
        temperature,
        system: systemPrompt,
        messages: [...history, { role: 'user', content: userPrompt }],
        ...(stream ? { stream: true } : {}),
      }),
      parseStreamEvent: parseAnthropicEvent,
      extractJson: (d) => ({
        text: Array.isArray(d.content) ? d.content.map((b: any) => b.text ?? '').join('') : '',
        tokensIn: d.usage?.input_tokens,
        tokensOut: d.usage?.output_tokens,
      }),
    };
  }

  if (model.provider === 'gemini') {
    const base = model.endpoint.replace(/:(stream)?[gG]enerateContent.*$/, '');
    return {
      url: stream ? `${base}:streamGenerateContent?alt=sse` : `${base}:generateContent`,
      label: 'Gemini',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [
          ...history.map((m) => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: m.content }] })),
          { role: 'user', parts: [{ text: userPrompt }] },
        ],
        generationConfig: { temperature },
      }),
      parseStreamEvent: parseGeminiEvent,
      extractJson: (d) => ({
        text: (d.candidates?.[0]?.content?.parts ?? []).map((p: any) => p.text ?? '').join(''),
        tokensIn: d.usageMetadata?.promptTokenCount,
        tokensOut: d.usageMetadata?.candidatesTokenCount,
      }),
    };
  }

  throw new Error(`Unsupported provider "${model.provider}".`);
}
