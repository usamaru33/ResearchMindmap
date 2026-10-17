import type { LlmBackend, LlmRequest, StructuredRequest } from './client';

/**
 * Scriptable LLM for tests: `respond` decides each structured answer, and
 * `text` is streamed in a few chunks. Records every request it receives.
 */
export class FakeLlm implements LlmBackend {
  readonly model = 'fake-model';
  readonly requests: LlmRequest[] = [];
  private readonly respond: (req: StructuredRequest<unknown>) => unknown;
  private readonly text: string;

  constructor(opts: { respond?: (req: StructuredRequest<unknown>) => unknown; text?: string } = {}) {
    this.respond = opts.respond ?? (() => null);
    this.text = opts.text ?? '';
  }

  async structured<T>(req: StructuredRequest<T>): Promise<T | null> {
    this.requests.push(req);
    const raw = this.respond(req as StructuredRequest<unknown>);
    if (raw instanceof Error) throw raw;
    if (raw === null || raw === undefined) return null;
    // Validate like the real structured-output parser would.
    const parsed = req.schema.safeParse(raw);
    return parsed.success ? parsed.data : null;
  }

  async streamText(req: LlmRequest, onDelta: (text: string) => void): Promise<string> {
    this.requests.push(req);
    const chunks = this.text.match(/[\s\S]{1,16}/g) ?? [];
    for (const c of chunks) onDelta(c);
    return this.text;
  }
}
