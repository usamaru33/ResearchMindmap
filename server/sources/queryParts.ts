import type { QueryNode, TermNode, TextField } from '../../shared/query';

/** Render a boolean expression with a source-specific term renderer. */
export function renderBoolean(
  node: QueryNode,
  term: (t: TermNode) => string,
  ops: { and: string; or: string; not: (child: string) => string } = {
    and: ' AND ',
    or: ' OR ',
    not: (c) => `NOT ${c}`,
  },
  parent: 'root' | 'and' | 'or' | 'not' = 'root',
): string {
  switch (node.type) {
    case 'term':
      return term(node);
    case 'not':
      return ops.not(renderBoolean(node.child, term, ops, 'not'));
    case 'and': {
      const s = node.children.map((c) => renderBoolean(c, term, ops, 'and')).join(ops.and);
      return parent === 'root' ? s : `(${s})`;
    }
    case 'or': {
      const s = node.children.map((c) => renderBoolean(c, term, ops, 'or')).join(ops.or);
      return parent === 'root' ? s : `(${s})`;
    }
  }
}

export function fieldsUsed(node: QueryNode): Set<TextField> {
  const out = new Set<TextField>();
  const walk = (n: QueryNode) => {
    if (n.type === 'term') out.add(n.field);
    else if (n.type === 'not') walk(n.child);
    else n.children.forEach(walk);
  };
  walk(node);
  return out;
}

export function hasWildcard(node: QueryNode): boolean {
  if (node.type === 'term') return node.wildcard;
  if (node.type === 'not') return hasWildcard(node.child);
  return node.children.some(hasWildcard);
}

export function hasBooleanStructure(node: QueryNode): boolean {
  if (node.type === 'term') return node.phrase;
  if (node.type === 'or' || node.type === 'not') return true;
  return node.children.some(hasBooleanStructure);
}

/** Top-level conjuncts of the text query. */
export function conjuncts(node: QueryNode | null): QueryNode[] {
  if (!node) return [];
  return node.type === 'and' ? node.children : [node];
}

export function isPlainPositiveTerm(node: QueryNode): node is TermNode {
  return node.type === 'term';
}

/** Quote a term for engines that understand double-quoted phrases. */
export function quoted(t: TermNode): string {
  const v = t.value.replace(/"/g, '');
  return t.phrase || /\s/.test(v) ? `"${v}"` : v;
}
