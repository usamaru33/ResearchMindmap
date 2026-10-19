import type { Entry } from '../format';

/** Finding important papers the map lacks (DESIGN 15.1). */
export const missing = {
  'analysis.tab.missing': ['見落とし', 'Missing papers'],
  'missing.hint': [
    'マップの論文の引用・被引用から、分野の重要文献でマップに入っていないものを探し、どれだけ網羅できているかを示します（OpenAlex を使います）。',
    'Looks through what the map cites and what cites it for important works the map lacks, and shows how well it covers them (uses OpenAlex).',
  ],
  'missing.seeds': ['対象 {n} / {total} 件（DOI・arXiv ID・OpenAlex ID のある論文）', '{n} of {total} papers (those with a DOI, arXiv or OpenAlex id)'],
  'missing.run': ['OpenAlex で調べる', 'Check with OpenAlex'],
  'missing.rerun': ['もう一度調べる', 'Check again'],
  'missing.loading': ['調べています…', 'Checking…'],
  'missing.coverageLabel': ['網羅率', 'Coverage'],
  'missing.coverageTitle': ['網羅率', 'coverage'],
  'missing.coverage': [
    'マップの {threshold} 件以上が引用している文献 {total} 件のうち、{inMap} 件がマップにあります。',
    '{inMap} of the {total} works cited by at least {threshold} map papers are in the map.',
  ],
  'missing.coverageNone': ['マップの複数の論文が共通して引用している文献は見つかりませんでした。', 'No works are cited in common by several map papers.'],
  'missing.forwardFailed': ['マップを引用する論文を取得できなかったため、後続研究と共引用は含まれていません。', 'Works citing the map could not be fetched, so follow-up research and co-citation are missing.'],
  'missing.filterLabel': ['手がかりで絞り込む', 'Filter by clue'],
  'missing.all': ['すべて {n}', 'All {n}'],
  'missing.signal.foundation': ['基礎文献', 'Foundations'],
  'missing.signal.foundation.hint': ['マップの複数の論文が引用している文献', 'Works cited by several map papers'],
  'missing.signal.followUp': ['後続研究', 'Follow-up research'],
  'missing.signal.followUp.hint': ['マップの複数の論文を引用している論文', 'Works citing several map papers'],
  'missing.signal.cocited': ['共引用', 'Co-cited'],
  'missing.signal.cocited.hint': [
    'マップを引用する論文が、マップの論文と一緒に引用している文献',
    'Works that papers citing the map cite together with it',
  ],
  'missing.citedBy': ['マップの {n} 件が引用', 'Cited by {n} map {n|paper|papers}'],
  'missing.cites': ['マップの {n} 件を引用', 'Cites {n} map {n|paper|papers}'],
  'missing.cocited': ['共引用 {n} 回', 'Co-cited {n} {n|time|times}'],
  'missing.citations': ['被引用 {n}', '{n} cites'],
  'missing.chosen': ['{n} 件選択', '{n} selected'],
  'missing.add': ['引用関係ごとこのマップに追加（{n}）', 'Add to this map with citations ({n})'],
  'missing.choose': ['「{title}」を選ぶ', 'Select {title}'],
  'missing.none': ['見落としの候補はありません。', 'No missing works found.'],
  'missing.noneHere': ['この手がかりの候補はありません。', 'No candidates for this clue.'],
  'missing.footer': [
    'OpenAlex で見つかったマップの論文 {seeds} 件と、それを引用する論文 {citing} 件から調べました。',
    'Based on {seeds} map papers found in OpenAlex and {citing} works citing them.',
  ],
  'cmd.missing': ['見落とし論文を探す', 'Find missing papers'],
} as const satisfies Record<string, Entry>;
