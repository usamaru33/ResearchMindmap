import Anthropic from '@anthropic-ai/sdk';
import { betaZodOutputFormat } from '@anthropic-ai/sdk/helpers/beta/zod';
import type { z } from 'zod';
import type { AppConfig } from '../config';

export type Effort = 'low' | 'medium' | 'high' | 'xhigh' | 'max';

export interface LlmRequest {
  system: string;
  user: string;
  effort: Effort;
  maxTokens?: number;
  /** Mark the system prompt cacheable (useful when the same paper list is reused). */
  cacheSystem?: boolean;
  signal?: AbortSignal;
}

export interface StructuredRequest<T> extends LlmRequest {
  schema: z.ZodType<T>;
}

export class LlmError extends Error {
  readonly code: 'refusal' | 'rate_limited' | 'auth' | 'max_tokens' | 'api';

  constructor(code: LlmError['code'], message: string) {
    super(message);
    this.name = 'LlmError';
    this.code = code;
  }
}

/** The small surface the app needs from an LLM; tests substitute a fake. */
export interface LlmBackend {
  model: string;
  /** Returns null when the model's output did not match the schema. */
  structured<T>(req: StructuredRequest<T>): Promise<T | null>;
  /** Streams text deltas to `onDelta` and resolves with the full text. */
  streamText(req: LlmRequest, onDelta: (text: string) => void): Promise<string>;
}

// Server-side fallback reroutes a policy decline to the default fallback model.
const FALLBACK_BETA = 'server-side-fallback-2026-07-01';

function systemParam(req: LlmRequest) {
  return req.cacheSystem
    ? [{ type: 'text' as const, text: req.system, cache_control: { type: 'ephemeral' as const } }]
    : req.system;
}

function mapError(err: unknown): never {
  if (err instanceof LlmError) throw err;
  if (err instanceof Anthropic.RateLimitError) throw new LlmError('rate_limited', 'Claude API の回数制限に達しました。しばらく待ってください');
  if (err instanceof Anthropic.AuthenticationError) throw new LlmError('auth', 'ANTHROPIC_API_KEY が正しくありません');
  if (err instanceof Anthropic.APIError) throw new LlmError('api', `Claude API エラー（${err.status ?? '接続'}）: ${err.message}`);
  throw err;
}

function checkStop(stopReason: string | null | undefined): void {
  if (stopReason === 'refusal') throw new LlmError('refusal', 'Claude がこの依頼への回答を控えました');
  if (stopReason === 'max_tokens') throw new LlmError('max_tokens', '出力が長すぎて途中で切れました');
}

export class AnthropicBackend implements LlmBackend {
  readonly model: string;
  private readonly client: Anthropic;

  constructor(apiKey: string, model: string) {
    this.client = new Anthropic({ apiKey });
    this.model = model;
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T | null> {
    try {
      const res = await this.client.beta.messages.parse(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 16000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort: req.effort, format: betaZodOutputFormat(req.schema) },
          system: systemParam(req),
          messages: [{ role: 'user', content: req.user }],
        },
        { signal: req.signal },
      );
      checkStop(res.stop_reason);
      return (res.parsed_output as T | null) ?? null;
    } catch (err) {
      return mapError(err);
    }
  }

  async streamText(req: LlmRequest, onDelta: (text: string) => void): Promise<string> {
    try {
      const stream = this.client.beta.messages.stream(
        {
          model: this.model,
          max_tokens: req.maxTokens ?? 64000,
          betas: [FALLBACK_BETA],
          fallbacks: 'default',
          output_config: { effort: req.effort },
          system: systemParam(req),
          messages: [{ role: 'user', content: req.user }],
        },
        { signal: req.signal },
      );
      let text = '';
      for await (const event of stream) {
        if (event.type === 'content_block_delta' && event.delta.type === 'text_delta') {
          text += event.delta.text;
          onDelta(event.delta.text);
        }
      }
      const final = await stream.finalMessage();
      checkStop(final.stop_reason);
      return text;
    } catch (err) {
      return mapError(err);
    }
  }
}

let override: LlmBackend | null | undefined;
let cached: { key: string; model: string; backend: LlmBackend } | null = null;

/** The configured LLM, or null when no API key is set (callers must fall back). */
export function getLlm(config: AppConfig): LlmBackend | null {
  if (override !== undefined) return override;
  if (!config.anthropicApiKey) return null;
  if (!cached || cached.key !== config.anthropicApiKey || cached.model !== config.anthropicModel) {
    cached = {
      key: config.anthropicApiKey,
      model: config.anthropicModel,
      backend: new AnthropicBackend(config.anthropicApiKey, config.anthropicModel),
    };
  }
  return cached.backend;
}

/** Test hook: force a backend (or null for "no key"); pass undefined to restore. */
export function setLlmForTest(backend: LlmBackend | null | undefined): void {
  override = backend;
}
