import type { Entry } from '../format';

/** The analysis panel: map statistics and research trends. */
export const analysis = {
  'toolbar.analyze': ['分析', 'Analyze'],
  'toolbar.analyzeTitle': ['マップの統計と研究動向', 'Map statistics and research trends'],
  'sidebar.analyze': ['分析', 'Analysis'],

  'stats.empty': ['マップに論文がありません。', 'There are no papers in the map.'],
  'stats.filtering': ['マップで「{text}」に合う論文を強調しています', 'Highlighting papers matching "{text}" in the map'],
  'stats.clearFilter': ['解除', 'Clear'],
  'stats.papers': ['論文', 'Papers'],
  'stats.read': ['読了', 'Read'],
  'stats.oa': ['PDF あり（OA）', 'With PDF (OA)'],
  'stats.medianCites': ['被引用数の中央値', 'Median citations'],
  'stats.byYear': ['年ごとの件数（押すとマップで強調）', 'Papers per year (click to highlight)'],
  'stats.undated': ['年の分からない論文が {n} 件あります。', '{n} {n|paper has|papers have} no year.'],
  'stats.status': ['読書状況', 'Reading status'],
  'stats.screening': ['スクリーニング', 'Screening'],
  'stats.pending': ['未判定', 'Pending'],
  'stats.venues': ['掲載先', 'Venues'],
  'stats.authors': ['著者', 'Authors'],
  'stats.tags': ['タグ', 'Tags'],
  'stats.publishers': ['出版社', 'Publishers'],
  'stats.topCited': ['被引用数の多い論文', 'Most cited'],
  'stats.abstracts': ['抄録のある論文: {n} / {total} 件', 'Papers with an abstract: {n} / {total}'],
} as const satisfies Record<string, Entry>;
