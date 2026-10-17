import type { FilterField, TextField } from './ast';

export type FieldName = TextField | FilterField;

// Field names accepted from common database syntaxes (ACM DL, IEEE Xplore,
// Scopus, Web of Science, PubMed, arXiv). Keys are matched case-insensitively
// with spaces/underscores collapsed.
const ALIASES: Record<string, FieldName> = {
  all: 'all',
  any: 'all',
  allfield: 'all',
  allfields: 'all',
  'all fields': 'all',
  'all metadata': 'all',
  'full text & metadata': 'all',
  ts: 'all',

  title: 'title',
  ti: 'title',
  'document title': 'title',
  'article title': 'title',
  'publication title words': 'title',

  abstract: 'abstract',
  ab: 'abstract',
  abs: 'abstract',

  tiab: 'tiab',
  'title/abstract': 'tiab',
  'title-abs': 'tiab',
  'title-abs-key': 'tiab',
  tak: 'tiab',

  author: 'author',
  authors: 'author',
  au: 'author',
  auth: 'author',
  'first author': 'author',

  venue: 'venue',
  so: 'venue',
  source: 'venue',
  srctitle: 'venue',
  'source title': 'venue',
  'publication title': 'venue',
  journal: 'venue',
  conference: 'venue',
  ta: 'venue',
  jour: 'venue',

  keyword: 'keyword',
  keywords: 'keyword',
  kw: 'keyword',
  key: 'keyword',
  authkey: 'keyword',
  'author keywords': 'keyword',
  'index terms': 'keyword',
  mh: 'keyword',
  mesh: 'keyword',

  year: 'year',
  py: 'year',
  pubyear: 'year',
  dp: 'year',
  'publication year': 'year',
  'publication date': 'year',

  publisher: 'publisher',
  pub: 'publisher',

  type: 'type',
  doctype: 'type',
  pt: 'type',

  oa: 'oa',
  'open access': 'oa',
  isoa: 'oa',

  lang: 'lang',
  language: 'lang',
  la: 'lang',
};

export function normalizeFieldKey(raw: string): string {
  return raw.trim().toLowerCase().replace(/[_\s]+/g, ' ');
}

export function resolveField(raw: string): FieldName | null {
  return ALIASES[normalizeFieldKey(raw)] ?? null;
}

export const TEXT_FIELDS: readonly TextField[] = [
  'all',
  'title',
  'abstract',
  'tiab',
  'author',
  'venue',
  'keyword',
];

export function isTextField(field: FieldName): field is TextField {
  return (TEXT_FIELDS as readonly string[]).includes(field);
}

/** DOI prefixes used to emulate `publisher:` on sources without a publisher filter. */
export const PUBLISHER_DOI_PREFIXES: Record<string, string> = {
  acm: '10.1145',
  ieee: '10.1109',
  springer: '10.1007',
  elsevier: '10.1016',
  wiley: '10.1002',
  arxiv: '10.48550',
  plos: '10.1371',
  mdpi: '10.3390',
  nature: '10.1038',
  sage: '10.1177',
  'taylor & francis': '10.1080',
  iop: '10.1088',
  aaai: '10.1609',
};

export function publisherFromDoi(doi: string | undefined): string | undefined {
  if (!doi) return undefined;
  const prefix = doi.split('/')[0];
  return Object.entries(PUBLISHER_DOI_PREFIXES).find(([, p]) => p === prefix)?.[0];
}

/** Words dropped from unquoted terms because databases ignore them anyway. */
export const STOPWORDS = new Set([
  'a',
  'an',
  'and',
  'or',
  'not',
  'the',
  'of',
  'in',
  'on',
  'for',
  'to',
  'with',
  'by',
  'at',
  'from',
  'is',
  'are',
]);
