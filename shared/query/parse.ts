import {
  emptyFilters,
  type ParseResult,
  type QueryError,
  type QueryFilters,
  type QueryNode,
  type TermNode,
  type TextField,
  type FilterField,
} from './ast';
import { STOPWORDS, isTextField, resolveField, type FieldName } from './fields';
import { TokenizeError, tokenize, type Token } from './tokenize';

// Intermediate tree: like QueryNode but filters may still appear anywhere and
// carry source positions so misplaced ones can be reported.
type FilterNode = { type: 'filter'; field: FilterField; values: string[]; start: number; end: number };
type INode =
  | (TermNode & { start: number; end: number })
  | { type: 'and'; children: INode[] }
  | { type: 'or'; children: INode[] }
  | { type: 'not'; child: INode; start: number; end: number }
  | FilterNode;

class ParseError extends Error {
  readonly start: number;
  readonly end: number;

  constructor(message: string, start: number, end: number) {
    super(message);
    this.start = start;
    this.end = end;
  }
}

class Parser {
  private pos = 0;
  readonly warnings: QueryError[] = [];
  private readonly tokens: Token[];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.pos];
  }

  private next(): Token {
    return this.tokens[this.pos++];
  }

  parseQuery(): INode | null {
    if (this.peek().kind === 'eof') return null;
    const node = this.parseOr('all');
    const tok = this.peek();
    if (tok.kind === 'rparen') throw new ParseError('対応する「(」がありません', tok.start, tok.end);
    if (tok.kind !== 'eof') throw new ParseError('ここで式が終わるはずです', tok.start, tok.end);
    return node;
  }

  private parseOr(field: TextField): INode | null {
    const parts: INode[] = [];
    const first = this.parseAnd(field);
    if (first) parts.push(first);
    while (this.peek().kind === 'or') {
      const op = this.next();
      if (this.startsPrimary(this.peek()) === false) {
        throw new ParseError('OR の後に検索語がありません', op.start, op.end);
      }
      const rhs = this.parseAnd(field);
      if (rhs) parts.push(rhs);
    }
    if (parts.length === 0) return null;
    return parts.length === 1 ? parts[0] : { type: 'or', children: parts };
  }

  private parseAnd(field: TextField): INode | null {
    const parts: INode[] = [];
    const push = (node: INode | null) => {
      if (node) parts.push(node);
    };
    push(this.parseNot(field));
    for (;;) {
      const tok = this.peek();
      if (tok.kind === 'and') {
        this.next();
        if (!this.startsPrimary(this.peek())) {
          throw new ParseError('AND の後に検索語がありません', tok.start, tok.end);
        }
        push(this.parseNot(field));
      } else if (this.startsPrimary(tok)) {
        push(this.parseNot(field)); // implicit AND
      } else {
        break;
      }
    }
    if (parts.length === 0) return null;
    return parts.length === 1 ? parts[0] : { type: 'and', children: parts };
  }

  private startsPrimary(tok: Token): boolean {
    return (
      tok.kind === 'word' ||
      tok.kind === 'phrase' ||
      tok.kind === 'lparen' ||
      tok.kind === 'not' ||
      tok.kind === 'field'
    );
  }

  private parseNot(field: TextField): INode | null {
    const tok = this.peek();
    if (tok.kind === 'not') {
      this.next();
      if (!this.startsPrimary(this.peek())) {
        throw new ParseError('NOT の後に検索語がありません', tok.start, tok.end);
      }
      const child = this.parseNot(field);
      if (!child) return null;
      return { type: 'not', child, start: tok.start, end: this.tokens[this.pos - 1].end };
    }
    return this.parsePrimary(field);
  }

  private parsePrimary(field: TextField): INode | null {
    const tok = this.peek();
    let node: INode | null;

    switch (tok.kind) {
      case 'field': {
        this.next();
        node = isTextField(tok.field)
          ? this.parseFieldOperand(tok.field, tok)
          : this.parseFilter(tok.field, tok);
        break;
      }
      case 'lparen': {
        this.next();
        if (this.peek().kind === 'rparen') {
          throw new ParseError('括弧の中が空です', tok.start, this.peek().end);
        }
        node = this.parseOr(field);
        const close = this.next();
        if (close.kind !== 'rparen') throw new ParseError('「(」が閉じていません', tok.start, tok.end);
        break;
      }
      case 'word':
      case 'phrase':
        this.next();
        node = makeTerm(tok.kind === 'phrase', tok.value, field, tok.start, tok.end);
        break;
      case 'eof':
        throw new ParseError('検索語がありません', tok.start, tok.end);
      default:
        throw new ParseError(`ここに「${describe(tok)}」は置けません`, tok.start, tok.end);
    }

    // PubMed postfix tag: term[ti], (a OR b)[tiab], 2019:2024[dp]
    const tag = this.peek();
    if (tag.kind === 'tag') {
      this.next();
      const tagField = resolveField(tag.raw);
      if (!tagField) {
        this.warnings.push({ message: `不明なタグ [${tag.raw}] は無視しました`, start: tag.start, end: tag.end });
      } else if (node) {
        node = applyTag(node, tagField, tag);
      }
    }
    return node;
  }

  private parseFieldOperand(field: TextField, fieldTok: Token): INode | null {
    if (!this.startsPrimary(this.peek()) || this.peek().kind === 'field') {
      throw new ParseError('フィールド名の後に検索語がありません', fieldTok.start, fieldTok.end);
    }
    return this.parseNot(field);
  }

  private parseFilter(field: FilterField, fieldTok: Token): FilterNode {
    const values: string[] = [];
    const tok = this.peek();
    if (tok.kind === 'lparen') {
      // publisher:(acm OR ieee)
      this.next();
      for (;;) {
        const v = this.next();
        if (v.kind !== 'word' && v.kind !== 'phrase') {
          throw new ParseError('フィルタの値がありません', v.start, v.end);
        }
        values.push(v.value);
        const sep = this.next();
        if (sep.kind === 'rparen') break;
        if (sep.kind !== 'or') throw new ParseError('フィルタの値は OR で区切ってください', sep.start, sep.end);
      }
    } else if (tok.kind === 'word' || tok.kind === 'phrase') {
      this.next();
      let value = tok.value;
      // Scopus style `PUBYEAR > 2019` (operator separated by spaces)
      if (field === 'year' && /^(<=|>=|<|>|=)$/.test(value) && this.peek().kind === 'word') {
        value += (this.next() as { value: string }).value;
      }
      values.push(value);
    } else {
      throw new ParseError('フィルタの値がありません', fieldTok.start, fieldTok.end);
    }
    return { type: 'filter', field, values, start: fieldTok.start, end: this.tokens[this.pos - 1].end };
  }
}

function describe(tok: Token): string {
  switch (tok.kind) {
    case 'rparen':
      return ')';
    case 'and':
      return 'AND';
    case 'or':
      return 'OR';
    case 'tag':
      return `[${tok.raw}]`;
    default:
      return tok.kind;
  }
}

function makeTerm(
  phrase: boolean,
  raw: string,
  field: TextField,
  start: number,
  end: number,
): INode | null {
  let value = raw.trim().replace(/\s+/g, ' ');
  let wildcard = false;
  if (value.endsWith('*') || value.endsWith('?') || value.endsWith('$')) {
    wildcard = true;
    value = value.replace(/[*?$]+$/, '');
  }
  if (!value) return null;
  // Unquoted single words: drop stop words that databases ignore anyway.
  if (!phrase && STOPWORDS.has(value.toLowerCase())) return null;
  // A quoted single word is just a word.
  const isPhrase = phrase && value.includes(' ');
  return { type: 'term', field, value, phrase: isPhrase, wildcard, start, end };
}

function applyTag(node: INode, field: FieldName, tag: Token): INode {
  if (isTextField(field)) return setField(node, field);
  // [dp]/[pt]/[la] turn a word into a filter value
  if (node.type === 'term') {
    return { type: 'filter', field, values: [node.value], start: node.start, end: tag.end };
  }
  throw new ParseError(`[${(tag as { raw: string }).raw}] は単語にだけ付けられます`, tag.start, tag.end);
}

function setField(node: INode, field: TextField): INode {
  switch (node.type) {
    case 'term':
      return { ...node, field };
    case 'and':
    case 'or':
      return { ...node, children: node.children.map((c) => setField(c, field)) };
    case 'not':
      return { ...node, child: setField(node.child, field) };
    default:
      return node;
  }
}

// ---- filters -------------------------------------------------------------

export function parseYearRange(raw: string): { min?: number; max?: number } | null {
  const v = raw.trim().replace(/\s+/g, '');
  let m: RegExpMatchArray | null;
  if ((m = v.match(/^(\d{4})$/))) return { min: +m[1], max: +m[1] };
  if ((m = v.match(/^(\d{4})(?:\.\.|-|–|:|~|〜)(\d{4})$/))) {
    const [a, b] = [+m[1], +m[2]];
    return { min: Math.min(a, b), max: Math.max(a, b) };
  }
  if ((m = v.match(/^(\d{4})(?:\.\.|-|–|:|~|〜)$/))) return { min: +m[1] };
  if ((m = v.match(/^(?:\.\.|-|–|:|~|〜)(\d{4})$/))) return { max: +m[1] };
  if ((m = v.match(/^>=(\d{4})$/))) return { min: +m[1] };
  if ((m = v.match(/^>(\d{4})$/))) return { min: +m[1] + 1 };
  if ((m = v.match(/^<=(\d{4})$/))) return { max: +m[1] };
  if ((m = v.match(/^<(\d{4})$/))) return { max: +m[1] - 1 };
  if ((m = v.match(/^=(\d{4})$/))) return { min: +m[1], max: +m[1] };
  return null;
}

function parseBool(raw: string): boolean | null {
  const v = raw.trim().toLowerCase();
  if (['true', 'yes', '1', 'y', 'on'].includes(v)) return true;
  if (['false', 'no', '0', 'n', 'off'].includes(v)) return false;
  return null;
}

function applyFilter(filters: QueryFilters, node: FilterNode): void {
  switch (node.field) {
    case 'year': {
      for (const raw of node.values) {
        const range = parseYearRange(raw);
        if (!range) throw new ParseError(`年の指定「${raw}」を読み取れません（例: 2020, 2019..2024, >=2020）`, node.start, node.end);
        if (range.min !== undefined) filters.yearMin = Math.max(filters.yearMin ?? -Infinity, range.min);
        if (range.max !== undefined) filters.yearMax = Math.min(filters.yearMax ?? Infinity, range.max);
      }
      if (filters.yearMin !== undefined && filters.yearMax !== undefined && filters.yearMin > filters.yearMax) {
        throw new ParseError('年の範囲が空です', node.start, node.end);
      }
      return;
    }
    case 'oa': {
      const b = parseBool(node.values[0]);
      if (b === null) throw new ParseError('oa: には true か false を指定してください', node.start, node.end);
      filters.openAccess = b;
      return;
    }
    case 'publisher':
      filters.publishers.push(...node.values.map((v) => v.trim().toLowerCase()));
      return;
    case 'type':
      filters.types.push(...node.values.map((v) => v.trim().toLowerCase()));
      return;
    case 'lang':
      filters.languages.push(...node.values.map((v) => v.trim().toLowerCase()));
      return;
  }
}

/** Pull filters out of the top-level conjunction; anywhere else is an error. */
function extract(root: INode | null): { text: QueryNode | null; filters: QueryFilters } {
  const filters = emptyFilters();
  if (!root) return { text: null, filters };
  const top = root.type === 'and' ? root.children : [root];
  const textParts: QueryNode[] = [];
  for (const child of top) {
    if (child.type === 'filter') applyFilter(filters, child);
    else textParts.push(toQueryNode(child));
  }
  const flat = textParts.flatMap((c) => (c.type === 'and' ? c.children : [c]));
  const text = flat.length === 0 ? null : flat.length === 1 ? flat[0] : { type: 'and' as const, children: flat };
  return { text, filters };
}

function toQueryNode(node: INode): QueryNode {
  switch (node.type) {
    case 'term': {
      const { field, value, phrase, wildcard } = node;
      return { type: 'term', field, value, phrase, wildcard };
    }
    case 'and':
    case 'or': {
      // Flatten (a AND (b AND c)) → (a AND b AND c) so equivalent queries share one shape.
      const children = node.children
        .map(toQueryNode)
        .flatMap((c) => (c.type === node.type ? c.children : [c]));
      return { type: node.type, children };
    }
    case 'not':
      return { type: 'not', child: toQueryNode(node.child) };
    case 'filter':
      throw new ParseError(
        'year: や publisher: などのフィルタは、OR や NOT や括弧の中ではなく、AND でつないだ最上位に置いてください',
        node.start,
        node.end,
      );
  }
}

export function parseQuery(input: string): ParseResult {
  try {
    const parser = new Parser(tokenize(input));
    const root = parser.parseQuery();
    const query = extract(root);
    if (!query.text && isEmptyFilters(query.filters)) {
      return { ok: false, errors: [{ message: '検索語を入力してください', start: 0, end: input.length }] };
    }
    if (query.text && onlyNegative(query.text)) {
      return {
        ok: false,
        errors: [{ message: 'NOT だけの検索はできません。含めたい語も指定してください', start: 0, end: input.length }],
      };
    }
    return { ok: true, query, warnings: parser.warnings };
  } catch (err) {
    if (err instanceof ParseError || err instanceof TokenizeError) {
      return { ok: false, errors: [{ message: err.message, start: err.start, end: err.end }] };
    }
    throw err;
  }
}

function isEmptyFilters(f: QueryFilters): boolean {
  return (
    f.yearMin === undefined &&
    f.yearMax === undefined &&
    f.openAccess === undefined &&
    f.publishers.length === 0 &&
    f.types.length === 0 &&
    f.languages.length === 0
  );
}

function onlyNegative(node: QueryNode): boolean {
  switch (node.type) {
    case 'not':
      return true;
    case 'and':
      return node.children.every(onlyNegative);
    case 'or':
      return node.children.some(onlyNegative);
    default:
      return false;
  }
}
