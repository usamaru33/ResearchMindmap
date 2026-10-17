import type { Context } from 'hono';
import { streamSSE } from 'hono/streaming';
import { LlmError } from '../llm/client';

export interface StreamEvents {
  /** Emit a chunk of text. */
  delta: (text: string) => void;
}

/**
 * Run `work` and relay its text as Server-Sent Events:
 * `delta` ({ text }) chunks, then `done` ({ text, ...meta }) or `error` ({ code, message }).
 */
export function streamText(
  c: Context,
  work: (events: StreamEvents, signal: AbortSignal) => Promise<{ text: string; meta?: Record<string, unknown> }>,
) {
  return streamSSE(c, async (stream) => {
    const abort = new AbortController();
    stream.onAbort(() => abort.abort());
    try {
      const result = await work(
        { delta: (text) => void stream.writeSSE({ event: 'delta', data: JSON.stringify({ text }) }) },
        abort.signal,
      );
      await stream.writeSSE({ event: 'done', data: JSON.stringify({ text: result.text, ...result.meta }) });
    } catch (err) {
      const code = err instanceof LlmError ? err.code : 'internal';
      await stream.writeSSE({ event: 'error', data: JSON.stringify({ code, message: (err as Error).message }) });
    }
  });
}
