import type { Entry } from '../format';

/** Syncing projects between devices through Google Drive (DESIGN 16). */
export const sync = {
  'sync.title': ['デバイス間の同期', 'Sync between devices'],
  'sync.desc': [
    '同じ Google アカウントでログインした端末のあいだで、プロジェクトを自分の Google Drive（このアプリ専用の非公開領域）を通して揃えます。このアプリのサーバーには保存しません',
    'Keeps your projects the same on every device signed in to the same Google account, through your own Google Drive (a private area only this app can read). Nothing is stored on this app\'s server',
  ],
  'sync.signIn': ['Google でログイン', 'Sign in with Google'],
  'sync.signInAgain': ['もう一度ログイン', 'Sign in again'],
  'sync.signingIn': ['ログイン中…', 'Signing in…'],
  'sync.signOut': ['ログアウト', 'Sign out'],
  'sync.signedInAs': ['{email} でログイン中', 'Signed in as {email}'],
  'sync.now': ['今すぐ同期', 'Sync now'],
  'sync.syncing': ['同期中…', 'Syncing…'],
  'sync.last': ['最後の同期: {when}', 'Last synced: {when}'],
  'sync.never': ['まだ同期していません', 'Not synced yet'],
  'sync.expired': ['ログインの有効期限（約 1 時間）が切れました。もう一度ログインしてください', 'Your sign-in expired (after about an hour). Please sign in again'],
  'sync.upToDate': ['すべて同期済みです', 'Everything is in sync'],
  'sync.summary': ['送信 {up} · 取得 {down} · 削除 {del}', 'Sent {up} · Received {down} · Deleted {del}'],
  'sync.conflicts': [
    '{n} 件は両方の端末で変わっていたため、別の端末の内容を別のプロジェクトとして残しました',
    '{n} {n|project was|projects were} changed on both devices; the other device\'s version was kept as a separate project',
  ],
  'sync.skipped': ['{n} 件は同期中に編集されたため、次回に回しました', '{n} {n|project was|projects were} edited while syncing and will be synced next time'],
  'sync.unreadable': ['{n} 件は読み取れませんでした', '{n} {n|project|projects} could not be read'],
  'sync.copySuffix': [' (別の端末)', ' (other device)'],
  'sync.hint': [
    '同期はログインしている間だけ行います。ログインの情報は保存せず、ブラウザを閉じると消えます',
    'Syncing runs only while you are signed in. The sign-in is not stored and is gone when you close the browser',
  ],
  'sync.err.quota': ['Google Drive の空き容量が足りません', 'Your Google Drive is full'],
  'sync.err.network': ['通信できませんでした', 'Could not connect'],
  'sync.err.http': ['Google Drive がエラーを返しました（{status}）', 'Google Drive returned an error ({status})'],
  'sync.err.scope': [
    '「Google Drive の非公開領域へのアクセス」が許可されていません。許可しないと同期できません',
    'Access to the private app area of Google Drive was not allowed. Syncing needs it',
  ],
  'sync.err.popup': ['ログインのウィンドウが閉じられました', 'The sign-in window was closed'],
  'sync.err.script': ['Google のログイン部品を読み込めませんでした', 'Could not load Google\'s sign-in'],
  'sync.err.denied': ['Google がログインを受け付けませんでした（{reason}）', 'Google did not accept the sign-in ({reason})'],
} as const satisfies Record<string, Entry>;
