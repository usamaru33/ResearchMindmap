import { resolveField, type FieldName } from './fields';

export type Token =
  | { kind: 'lparen'; start: number; end: number }
  | { kind: 'rparen'; start: number; end: number }
  | { kind: 'and'; start: number; end: number }
  | { kind: 'or'; start: number; end: number }
  | { kind: 'not'; start: number; end: number }
  | { kind: 'word'; value: string; start: number; end: number }
  | { kind: 'phrase'; value: string; start: number; end: number }
  /** `title:` / `TI=` / `"Document Title":` / `TITLE-ABS-KEY(` */
  | { kind: 'field'; field: FieldName; raw: string; start: number; end: number }
  /** PubMed-style postfix tag: `term[tiab]` */
  | { kind: 'tag'; raw: string; start: number; end: number }
  | { kind: 'eof'; start: number; end: number };

export class TokenizeError extends Error {
  readonly start: number;
  readonly end: number;

  constructor(message: string, start: number, end: number) {
    super(message);
    this.start = start;
    this.end = end;
  }
}

const OPEN_QUOTES = new Set(['"', '“', '”', '＂']);
const CLOSE_QUOTES = new Set(['"', '”', '“', '＂']);
const WORD_STOP = /[\s()[\]"“”＂（）]/;

function isOperatorWord(word: string): 'and' | 'or' | 'not' | null {
  if (word === 'AND') return 'and';
  if (word === 'OR') return 'or';
  if (word === 'NOT' || word === 'ANDNOT') return 'not';
  return null;
}

export function tokenize(input: string): Token[] {
  const tokens: Token[] = [];
  let i = 0;
  const n = input.length;

  // `-term` / `!term` mean NOT only at the start of a term (not inside
  // `covid-19` and not right after `year:` where `-2020` is a range).
  const prevAllowsPrefix = () => {
    const prev = tokens[tokens.length - 1];
    if (!prev) return true;
    if (prev.kind === 'field' && prev.end === i) return false;
    return prev.kind === 'lparen' || prev.kind === 'not' || /\s/.test(input[i - 1] ?? ' ');
  };

  while (i < n) {
    const ch = input[i];

    if (/\s/.test(ch)) {
      i++;
      continue;
    }
    if (ch === '(' || ch === '（') {
      tokens.push({ kind: 'lparen', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === ')' || ch === '）') {
      tokens.push({ kind: 'rparen', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (input.startsWith('&&', i)) {
      tokens.push({ kind: 'and', start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if (input.startsWith('||', i)) {
      tokens.push({ kind: 'or', start: i, end: i + 2 });
      i += 2;
      continue;
    }
    if ((ch === '-' || ch === '!') && i + 1 < n && !/\s/.test(input[i + 1]) && prevAllowsPrefix()) {
      tokens.push({ kind: 'not', start: i, end: i + 1 });
      i++;
      continue;
    }
    if (ch === '+' && i + 1 < n && !/\s/.test(input[i + 1]) && prevAllowsPrefix()) {
      // `+term` (required) is the default for AND-ed terms; ignore the marker.
      i++;
      continue;
    }
    if (ch === '[') {
      const close = input.indexOf(']', i + 1);
      if (close === -1) throw new TokenizeError('「]」が閉じていません', i, n);
      tokens.push({ kind: 'tag', raw: input.slice(i + 1, close), start: i, end: close + 1 });
      i = close + 1;
      continue;
    }
    if (ch === ']') {
      throw new TokenizeError('対応する「[」がありません', i, i + 1);
    }
    if (OPEN_QUOTES.has(ch)) {
      let j = i + 1;
      while (j < n && !CLOSE_QUOTES.has(input[j])) j++;
      if (j >= n) throw new TokenizeError('引用符が閉じていません', i, n);
      const value = input.slice(i + 1, j);
      const end = j + 1;
      // `"Document Title":` — a quoted field name
      if ((input[end] === ':' || input[end] === '=') && resolveField(value)) {
        tokens.push({ kind: 'field', field: resolveField(value)!, raw: value, start: i, end: end + 1 });
        i = end + 1;
        continue;
      }
      tokens.push({ kind: 'phrase', value, start: i, end });
      i = end;
      continue;
    }

    // Plain word, possibly carrying a field prefix (`title:x`, `TI=x`) or
    // opening a function-style field (`TITLE-ABS-KEY(`).
    const start = i;
    let j = i;
    let emitted = false;
    while (j < n && !WORD_STOP.test(input[j])) {
      if (input[j] === ':' || input[j] === '=') {
        const prefix = input.slice(start, j);
        const field = prefix ? resolveField(prefix) : null;
        if (field) {
          tokens.push({ kind: 'field', field, raw: prefix, start, end: j + 1 });
          i = j + 1;
          emitted = true;
          break;
        }
      }
      j++;
    }
    if (emitted) continue;

    const word = input.slice(start, j);
    i = j;
    const op = isOperatorWord(word);
    if (op) {
      tokens.push({ kind: op, start, end: j });
      continue;
    }
    if ((input[j] === '(' || input[j] === '（') && resolveField(word)) {
      tokens.push({ kind: 'field', field: resolveField(word)!, raw: word, start, end: j });
      continue;
    }
    // Scopus `PUBYEAR > 2019`: a year field followed by a spaced comparison.
    if (resolveField(word) === 'year' && /^\s*(?:<=|>=|<|>|=)/.test(input.slice(j))) {
      tokens.push({ kind: 'field', field: 'year', raw: word, start, end: j });
      continue;
    }
    tokens.push({ kind: 'word', value: word, start, end: j });
  }

  tokens.push({ kind: 'eof', start: n, end: n });
  return tokens;
}
