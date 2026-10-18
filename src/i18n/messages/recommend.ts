import type { Entry } from '../format';

/** Recommendations from the map's papers. */
export const recommend = {
  'search.tab.recommend': ['おすすめ', 'Recommend'],
  'rec.intro': ['マップの論文がよく引用している論文・よく引用されている論文・関連論文のうち、まだマップにないものを探します。', 'Finds papers that the papers on the map often cite, are often cited by, or are related to, and that are not on the map yet.'],
  'rec.scope': ['もとにする論文', 'Based on'],
  'rec.scope.map': ['マップ全体（{n} 件）', 'Whole map ({n})'],
  'rec.scope.selected': ['ライブラリで選んだ {n} 件', '{n} selected in the library'],
  'rec.noIds': ['DOI か OpenAlex ID を持つ論文がマップにありません', 'No paper on the map has a DOI or OpenAlex ID'],
  'rec.capped': ['（評価・読書状況・被引用数の高い 100 件を使います）', ' (the top 100 by rating, reading status and citations are used)'],
  'rec.limit': ['件数', 'Results'],
  'rec.find': ['おすすめを探す', 'Find recommendations'],
  'rec.finding': ['探しています…', 'Looking…'],
  'rec.summary': ['もとにした {seeds} 件から候補 {candidates} 件、上位 {n} 件', '{n} picked from {candidates} candidates linked to {seeds} seed papers'],
  'rec.none': ['おすすめが見つかりませんでした。論文を増やすか、選ぶ論文を変えてください。', 'No recommendations found. Add more papers or choose different ones.'],
  'rec.reason.cocited': ['もとの論文 {n} 件が引用', 'cited by {n} seed {n|paper|papers}'],
  'rec.reason.citing': ['もとの論文 {n} 件を引用', 'cites {n} seed {n|paper|papers}'],
  'rec.reason.related': ['もとの論文 {n} 件と関連', 'related to {n} seed {n|paper|papers}'],
  'rec.rootQuery': ['おすすめの論文', 'Recommended papers'],
  'library.similar': ['似た論文を探す', 'Find similar'],
} as const satisfies Record<string, Entry>;
