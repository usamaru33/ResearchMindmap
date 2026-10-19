import type { Entry } from '../format';

/** The feature menu (DESIGN 14.2). */
export const nav = {
  'nav.label': ['機能', 'Features'],
  'nav.toggleOpen': ['機能メニューを開く', 'Open the feature menu'],
  'nav.toggleClose': ['機能メニューを閉じる', 'Close the feature menu'],
  'nav.group.collect': ['論文を集める', 'Collect papers'],
  'nav.group.organize': ['読む・整理する', 'Read & organize'],
  'nav.group.analyze': ['分析する', 'Analyze'],
  'nav.group.write': ['書く', 'Write'],
  'nav.search': ['論文を検索', 'Search papers'],
  'nav.add': ['論文を追加', 'Add papers'],
  'nav.library': ['ライブラリ', 'Library'],
  'nav.screen': ['スクリーニング', 'Screening'],
  'nav.compare': ['比較表', 'Comparison table'],
  'nav.analyze': ['分析', 'Analysis'],
  'nav.write': ['執筆支援', 'Writing'],
  'nav.alerts': ['新着 {n} 件', '{n} new'],
  'cmd.toggleNav': ['機能メニューの表示・非表示', 'Show or hide the feature menu'],
} as const satisfies Record<string, Entry>;
