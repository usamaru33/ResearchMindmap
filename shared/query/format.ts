import type { ParsedQuery, QueryFilters, QueryNode, TermNode } from './ast';

function formatTerm(t: TermNode): string {
  const body = t.phrase || /[\s():"]/.test(t.value) ? `"${t.value}${t.wildcard ? '*' : ''}"` : `${t.value}${t.wildcard ? '*' : ''}`;
  return t.field === 'all' ? body : `${t.field}:${body}`;
}

function formatNode(node: QueryNode, parent: 'and' | 'or' | 'not' | 'root'): string {
  switch (node.type) {
    case 'term':
      return formatTerm(node);
    case 'not':
      return `NOT ${formatNode(node.child, 'not')}`;
    case 'and': {
      const s = node.children.map((c) => formatNode(c, 'and')).join(' AND ');
      return parent === 'not' ? `(${s})` : s;
    }
    case 'or': {
      const s = node.children.map((c) => formatNode(c, 'or')).join(' OR ');
      return parent === 'root' ? s : `(${s})`;
    }
  }
}

export function formatFilters(f: QueryFilters): string[] {
  const parts: string[] = [];
  if (f.yearMin !== undefined && f.yearMax !== undefined) {
    parts.push(f.yearMin === f.yearMax ? `year:${f.yearMin}` : `year:${f.yearMin}..${f.yearMax}`);
  } else if (f.yearMin !== undefined) {
    parts.push(`year:>=${f.yearMin}`);
  } else if (f.yearMax !== undefined) {
    parts.push(`year:<=${f.yearMax}`);
  }
  const list = (name: string, values: string[]) => {
    if (values.length === 1) parts.push(`${name}:${values[0]}`);
    else if (values.length > 1) parts.push(`${name}:(${values.join(' OR ')})`);
  };
  list('publisher', f.publishers);
  list('type', f.types);
  list('lang', f.languages);
  if (f.openAccess !== undefined) parts.push(`oa:${f.openAccess}`);
  return parts;
}

/** Canonical RQL text for a parsed query (stable, so usable as a cache key). */
export function formatQuery(q: ParsedQuery): string {
  const parts: string[] = [];
  if (q.text) {
    const s = formatNode(q.text, 'root');
    // An OR at the top must be grouped when filters follow it.
    parts.push(q.text.type === 'or' && formatFilters(q.filters).length > 0 ? `(${s})` : s);
  }
  parts.push(...formatFilters(q.filters));
  return parts.join(' AND ');
}

export function formatNodeText(node: QueryNode): string {
  return formatNode(node, 'root');
}
