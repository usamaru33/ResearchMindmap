import { memo } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { QueryRootData } from '../../types';
import styles from './MapNodes.module.css';

function QueryRootNodeComponent({ data, selected }: NodeProps) {
  const d = data as unknown as QueryRootData;
  return (
    <div className={`${styles.root} ${selected ? styles.selected : ''}`}>
      <div className={styles.rootKicker}>{d.mode === 'vague' ? 'なんとなく検索' : 'Query'}</div>
      <div className={styles.rootQuery} title={d.query}>
        {d.query}
      </div>
      <div className={styles.rootMeta}>
        {d.paperCount} papers · {new Date(d.createdAt).toLocaleDateString()}
      </div>
      {/* Clusters hang off either side; root edges pick the handle by side. */}
      <Handle id="r" type="source" position={Position.Right} className={styles.hiddenHandle} />
      <Handle id="l" type="source" position={Position.Left} className={styles.hiddenHandle} />
    </div>
  );
}

export const QueryRootNode = memo(QueryRootNodeComponent);
