import type { Entry } from '../format';

/** Literature notes export. */
export const notes = {
  'project.notes': ['文献ノート', 'Literature notes'],
  'project.notesMd': ['Markdown (.md)', 'Markdown (.md)'],
  'project.notesObsidian': ['Obsidian 用 (.zip)', 'For Obsidian (.zip)'],
  'project.notesObsidianTitle': ['論文ごとのノート（front matter と [[リンク]] つき）を 1 つのフォルダにまとめた zip', 'A zip folder with one note per paper (front matter and [[links]])'],

  'notes.title': ['{name} — 文献ノート', '{name} — literature notes'],
  'notes.summary': ['{n} 件 · {date} に書き出し', '{n} {n|paper|papers} · exported {date}'],
  'notes.authors': ['著者', 'Authors'],
  'notes.venue': ['掲載先', 'Venue'],
  'notes.links': ['リンク', 'Links'],
  'notes.citeKey': ['引用キー', 'Citation key'],
  'notes.status': ['状況', 'Status'],
  'notes.comparison': ['比較表', 'Comparison'],
  'notes.notes': ['メモ', 'Notes'],
  'notes.challenges': ['課題', 'Challenges'],
  'notes.futureWork': ['今後の展望', 'Future work'],
  'notes.inMap': ['このマップでの引用関係', 'Citations in this map'],
  'notes.cites': ['引用している', 'Cites'],
  'notes.citedBy': ['引用されている', 'Cited by'],
  'notes.abstract': ['抄録', 'Abstract'],
} as const satisfies Record<string, Entry>;
