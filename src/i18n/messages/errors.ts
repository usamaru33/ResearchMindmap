import type { Entry } from '../format';

/** Messages raised outside components. */
export const errors = {
  'error.network': ['API サーバーに接続できません（npm run dev:server で起動してください）', 'Cannot reach the API server (start it with npm run dev:server)'],
  'error.networkShort': ['API サーバーに接続できません', 'Cannot reach the API server'],
  'error.storageFull': ['ブラウザの保存領域に書き込めませんでした（容量不足の可能性があります）', 'Could not write to browser storage (it may be full)'],
  'error.storage': ['ブラウザの保存領域に書き込めませんでした', 'Could not write to browser storage'],
  'error.notJson': ['JSON として読み込めません', 'Not valid JSON'],
  'error.notProject': ['Research Mind Map のプロジェクトファイルではありません', 'Not a Research Mind Map project file'],
  'error.badNodes': ['ノードの形式が正しくありません', 'The nodes are not in the expected format'],
  'error.noNodes': ['書き出すノードがありません', 'There is nothing to export'],
} as const satisfies Record<string, Entry>;
