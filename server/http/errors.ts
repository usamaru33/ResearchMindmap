import type { ContentfulStatusCode } from 'hono/utils/http-status';

/** Error that the app's onError handler turns into `{ error: { code, message, details } }`. */
export class ApiHttpError extends Error {
  readonly status: ContentfulStatusCode;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: ContentfulStatusCode, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}
