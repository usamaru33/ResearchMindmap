export type Lang = 'ja' | 'en';
export type Vars = Record<string, string | number>;
/** [Japanese, English] */
export type Entry = readonly [string, string];

/**
 * Fill `{name}` placeholders. `{n|one|other}` picks a word by count
 * (English plurals): "{n} {n|paper|papers}". Unknown placeholders stay as they are.
 */
export function format(template: string, vars: Vars = {}): string {
  return template.replace(/\{(\w+)(?:\|([^|}]*)\|([^}]*))?\}/g, (whole, key: string, one?: string, other?: string) => {
    if (!(key in vars)) return whole;
    if (one !== undefined) return Number(vars[key]) === 1 ? one : (other ?? '');
    return String(vars[key]);
  });
}

/** The browser's preferred UI language, for first-time visitors. */
export function detectLang(languages: readonly string[] | undefined): Lang {
  for (const l of languages ?? []) {
    if (/^ja\b/i.test(l)) return 'ja';
    if (/^en\b/i.test(l)) return 'en';
  }
  return 'ja';
}
