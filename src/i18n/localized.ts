import type { Lang } from './format';

/** Pick the server-provided reason in the UI language (the server sends Japanese plus an English copy). */
export function localizedReason(x: { reason?: string; reasonEn?: string }, lang: Lang): string | undefined {
  return lang === 'en' ? (x.reasonEn ?? x.reason) : x.reason;
}
