import { XMLParser } from 'fast-xml-parser';

// Inline formatting inside titles/abstracts (PubMed uses <i>, <sup>, …) would
// otherwise split text into separate nodes; flatten it before parsing.
const INLINE_TAGS = /<\/?(?:i|b|u|em|strong|sup|sub|sc|mml:[a-z]+|math)(?:\s[^>]*)?>/gi;

export function parseXml(xml: string, arrayTags: string[] = []): unknown {
  const arrays = new Set(arrayTags);
  const parser = new XMLParser({
    ignoreAttributes: false,
    attributeNamePrefix: '@_',
    textNodeName: '#text',
    trimValues: true,
    parseTagValue: false,
    isArray: (name) => arrays.has(name),
  });
  return parser.parse(xml.replace(INLINE_TAGS, ''));
}

/** Text content of a parsed node that may be a string, a number, or `{ '#text': … }`. */
export function textOf(node: unknown): string {
  if (node === undefined || node === null) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node).replace(/\s+/g, ' ').trim();
  if (Array.isArray(node)) return node.map(textOf).filter(Boolean).join(' ');
  if (typeof node === 'object') {
    const t = (node as Record<string, unknown>)['#text'];
    return t === undefined ? '' : textOf(t);
  }
  return '';
}

export function asArray<T>(value: T | T[] | undefined | null): T[] {
  if (value === undefined || value === null) return [];
  return Array.isArray(value) ? value : [value];
}
