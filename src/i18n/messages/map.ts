import type { Entry } from '../format';

/** Map canvas, nodes and reading status. */
export const map = {
  'map.addConnection': ['つながりを追加', 'Add Connection'],
  'map.cancel': ['キャンセル', 'Cancel'],
  'map.add': ['追加', 'Add'],
  'map.foundation': ['基礎論文', 'Foundation'],
  'map.recent': ['最新の発展', 'Recent advance'],
  'map.renameCluster': ['ダブルクリックで名前を変更', 'Double-click to rename'],
  'map.clusterName': ['クラスタ名', 'Cluster name'],
  'map.rootVague': ['なんとなく検索', 'Vague search'],
  'map.rootQuery': ['クエリ', 'Query'],
  'map.rootMeta': ['{n} 件 · {date}', '{n} {n|paper|papers} · {date}'],

  'status.unread': ['未読', 'To read'],
  'status.reading': ['読書中', 'Reading'],
  'status.read': ['読了', 'Read'],
  'status.skipped': ['見送り', 'Skipped'],
} as const satisfies Record<string, Entry>;
