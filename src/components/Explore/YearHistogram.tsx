import styles from './Explore.module.css';

interface YearHistogramProps {
  byYear: Array<{ year: number; count: number }>;
  /** Clicking a bar narrows the list to that year. */
  onPickYear?: (year: number) => void;
}

/** Publications per year as a compact bar chart, with gaps for silent years. */
export function YearHistogram({ byYear, onPickYear }: YearHistogramProps) {
  if (byYear.length === 0) return null;
  const first = byYear[0].year;
  const last = byYear[byYear.length - 1].year;
  const counts = new Map(byYear.map((b) => [b.year, b.count]));
  const years = Array.from({ length: last - first + 1 }, (_, i) => first + i);
  const max = Math.max(...byYear.map((b) => b.count));
  const total = byYear.reduce((s, b) => s + b.count, 0);
  const peak = byYear.reduce((a, b) => (b.count > a.count ? b : a));

  return (
    <figure className={styles.histogram} aria-label="Publications per year">
      <div className={styles.bars}>
        {years.map((y) => {
          const c = counts.get(y) ?? 0;
          return (
            <button
              key={y}
              type="button"
              className={styles.bar}
              style={{ height: `${Math.max(c ? 6 : 0, (c / max) * 100)}%` }}
              title={`${y}: ${c} 件`}
              aria-label={`${y}: ${c} 件`}
              disabled={!onPickYear || c === 0}
              onClick={() => onPickYear?.(y)}
            />
          );
        })}
      </div>
      <figcaption className={styles.histCaption}>
        <span>{first}</span>
        <span>
          計 {total} 件・最多 {peak.year} 年（{peak.count} 件）
        </span>
        <span>{last}</span>
      </figcaption>
    </figure>
  );
}
