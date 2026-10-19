import type { Entry } from '../format';

/** New-paper alerts on saved searches. */
export const alerts = {
  'alerts.check': ['新着を確認', 'Check for new'],
  'alerts.checking': ['確認中…', 'Checking…'],
  'alerts.checkTitle': ['保存した（★）クエリ検索で、前回から増えた今年・昨年の論文を探します', 'Look for this and last year\'s papers that are new since the last run of each saved (★) query'],
  'alerts.new': ['新着 {n}', '{n} new'],
  'alerts.none': ['新着なし', 'Nothing new'],
  'alerts.checkedAt': ['確認: {when}', 'Checked {when}'],
  'alerts.markSeen': ['既読にする', 'Mark as seen'],
  'alerts.rootQuery': ['新着: {query}', 'New: {query}'],
  'settings.autoCheck': ['起動時に保存した検索の新着を確認（1 日 1 回）', 'Check saved searches for new papers on open (once a day)'],
} as const satisfies Record<string, Entry>;
