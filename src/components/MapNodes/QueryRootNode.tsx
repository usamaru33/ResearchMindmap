import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { QueryRootData } from '../../types';
import { useT } from '../../hooks/useT';
import styles from './MapNodes.module.css';

function QueryRootNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as QueryRootData;
  const t = useT();
  return (
    <div className={`${styles.root} ${selected ? styles.selected : ''}`}>
      <div className={styles.rootKicker}>{d.mode === 'vague' ? t('map.rootVague') : t('map.rootQuery')}</div>
      <div className={styles.rootQuery} title={d.query}>
        {d.query}
      </div>
      <div className={styles.rootMeta}>
        {t('map.rootMeta', { n: d.paperCount, date: new Date(d.createdAt).toLocaleDateString() })}
      </div>
      {/* Clusters hang off either side; root edges pick the handle by side. */}
      <Handle id="r" type="source" position={Position.Right} className={styles.hiddenHandle} />
      <Handle id="l" type="source" position={Position.Left} className={styles.hiddenHandle} />
    </div>
  );
}

export const QueryRootNode = memo(QueryRootNodeComponent);
