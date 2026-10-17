import { useMemo, useState } from 'react';
import type { Paper } from '../../types';
import { authorKey, coauthorGraph } from '../../store/coauthors';
import { forceLayout } from '../../utils/forceLayout';
import styles from './Explore.module.css';

const W = 360;
const H = 300;

interface CoauthorNetworkProps {
  papers: Paper[];
  /** Highlighted person (e.g. the author being explored). */
  focus?: string;
  maxAuthors?: number;
  onPickAuthor?: (name: string) => void;
}

/** Authors as nodes (size = papers), co-authorship as edges (width = papers together). */
export function CoauthorNetwork({ papers, focus, maxAuthors = 30, onPickAuthor }: CoauthorNetworkProps) {
  const [hover, setHover] = useState<string | null>(null);
  const graph = useMemo(() => coauthorGraph(papers, maxAuthors), [papers, maxAuthors]);
  const pos = useMemo(
    () => forceLayout(graph.authors.map((a) => a.key), graph.edges, { width: W, height: H, pad: 34 }),
    [graph],
  );

  if (graph.authors.length < 2) return <p className={styles.muted}>共著関係を描けるだけの著者がいません</p>;

  const focusKey = focus ? authorKey(focus) : null;
  const maxCount = graph.authors[0].paperIds.length;
  const maxWeight = Math.max(1, ...graph.edges.map((e) => e.weight));
  const radius = (n: number) => 4 + 9 * Math.sqrt(n / maxCount);
  const neighbours = new Set(
    hover ? graph.edges.flatMap((e) => (e.a === hover ? [e.b] : e.b === hover ? [e.a] : [])) : [],
  );
  // Label the busiest authors, plus whatever is focused or hovered.
  const labelled = new Set(graph.authors.slice(0, 10).map((a) => a.key));

  return (
    <figure className={styles.network}>
      <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label="Co-author network">
        {graph.edges.map((e) => {
          const a = pos.get(e.a)!;
          const b = pos.get(e.b)!;
          const active = hover !== null && (e.a === hover || e.b === hover);
          return (
            <line
              key={`${e.a}|${e.b}`}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className={active ? styles.edgeActive : styles.edge}
              strokeWidth={0.6 + 2.4 * (e.weight / maxWeight)}
            >
              <title>{`${e.weight} 本の共著`}</title>
            </line>
          );
        })}
        {graph.authors.map((a) => {
          const p = pos.get(a.key)!;
          const isFocus = a.key === focusKey;
          const dim = hover !== null && a.key !== hover && !neighbours.has(a.key);
          const r = radius(a.paperIds.length);
          return (
            <g
              key={a.key}
              className={`${styles.person} ${dim ? styles.dim : ''}`}
              transform={`translate(${p.x},${p.y})`}
              onMouseEnter={() => setHover(a.key)}
              onMouseLeave={() => setHover(null)}
              onClick={() => onPickAuthor?.(a.name)}
              role={onPickAuthor ? 'button' : undefined}
              aria-label={`${a.name}（${a.paperIds.length} 件）`}
            >
              <circle r={r} className={isFocus ? styles.nodeFocus : styles.node} />
              {(labelled.has(a.key) || isFocus || a.key === hover) && (
                <text y={-r - 3} textAnchor="middle" className={styles.nodeLabel}>
                  {a.name}
                </text>
              )}
              <title>{`${a.name}: ${a.paperIds.length} 件`}</title>
            </g>
          );
        })}
      </svg>
      <figcaption className={styles.muted}>
        上位 {graph.authors.length} 人（{papers.length} 件の論文から）。円の大きさ = 論文数、線の太さ = 共著数
        {onPickAuthor ? '。クリックでその人を探す' : ''}
      </figcaption>
    </figure>
  );
}
