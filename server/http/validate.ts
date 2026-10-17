import type { Context } from 'hono';
import type { z } from 'zod';
import { ApiHttpError } from './errors';

/** Parse and validate a JSON request body, or throw a 400 ApiHttpError. */
export async function readJson<S extends z.ZodType>(c: Context, schema: S): Promise<z.infer<S>> {
  let raw: unknown;
  try {
    raw = await c.req.json();
  } catch {
    throw new ApiHttpError(400, 'invalid_json', 'リクエスト本文が JSON ではありません');
  }
  const result = schema.safeParse(raw);
  if (!result.success) {
    throw new ApiHttpError(400, 'invalid_request', '入力が正しくありません', result.error.issues);
  }
  return result.data;
}
