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

  'toolbar.note': ['付箋', 'Note'],
  'shortcuts.note': ['キャンバスの空いた所に付箋を置く', 'Put a sticky note on the empty canvas'],
  'toolbar.noteTitle': ['付箋（メモ）をマップに置く。キャンバスのダブルクリックでも置けます', 'Put a sticky note on the map (or double-click the canvas)'],
  'note.placeholder': ['メモ（Markdown 可）。Ctrl+Enter で確定', 'Note (Markdown). Ctrl+Enter to finish'],
  'note.label': ['付箋の内容', 'Note text'],
  'note.editHint': ['ダブルクリックで編集', 'Double-click to edit'],
  'note.color': ['付箋の色', 'Note color'],
  'note.color.yellow': ['黄', 'Yellow'],
  'note.color.pink': ['桃', 'Pink'],
  'note.color.green': ['緑', 'Green'],
  'note.color.blue': ['青', 'Blue'],
  'note.color.gray': ['灰', 'Gray'],
  'status.unread': ['未読', 'To read'],
  'status.reading': ['読書中', 'Reading'],
  'status.read': ['読了', 'Read'],
  'status.skipped': ['見送り', 'Skipped'],
} as const satisfies Record<string, Entry>;
