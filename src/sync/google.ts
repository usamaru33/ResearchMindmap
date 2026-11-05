// Google sign-in with Google Identity Services' token flow (DESIGN 16.1): a popup that
// returns an access token. The token stays in memory; nothing is stored or sent to our server.

const SCRIPT_URL = 'https://accounts.google.com/gsi/client';
const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.appdata';
const SCOPES = `${DRIVE_SCOPE} https://www.googleapis.com/auth/userinfo.email`;

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
  error_description?: string;
}
interface TokenClient {
  requestAccessToken(overrides?: { prompt?: string }): void;
}
interface Oauth2 {
  initTokenClient(config: {
    client_id: string;
    scope: string;
    callback: (response: TokenResponse) => void;
    error_callback: (error: { type?: string; message?: string }) => void;
  }): TokenClient;
  hasGrantedAllScopes(response: TokenResponse, ...scopes: string[]): boolean;
  revoke(token: string, done?: () => void): void;
}

const oauth2 = (): Oauth2 | undefined =>
  (window as unknown as { google?: { accounts?: { oauth2?: Oauth2 } } }).google?.accounts?.oauth2;

export type SignInErrorCode = 'script' | 'popup' | 'scope' | 'denied';

export class SignInError extends Error {
  readonly code: SignInErrorCode;
  constructor(code: SignInErrorCode, detail = '') {
    super(detail || code);
    this.code = code;
  }
}

let scriptLoading: Promise<void> | null = null;

function loadScript(): Promise<void> {
  if (oauth2()) return Promise.resolve();
  scriptLoading ??= new Promise<void>((resolve, reject) => {
    const el = document.createElement('script');
    el.src = SCRIPT_URL;
    el.async = true;
    el.onload = () => resolve();
    el.onerror = () => {
      scriptLoading = null;
      el.remove();
      reject(new SignInError('script'));
    };
    document.head.append(el);
  });
  return scriptLoading;
}

export interface Token {
  accessToken: string;
  /** Epoch milliseconds. */
  expiresAt: number;
}

/** Open Google's sign-in popup. Must be called from a click, or the browser blocks the popup. */
export async function requestToken(clientId: string): Promise<Token> {
  await loadScript();
  const api = oauth2();
  if (!api) throw new SignInError('script');
  return new Promise<Token>((resolve, reject) => {
    const client = api.initTokenClient({
      client_id: clientId,
      scope: SCOPES,
      callback: (res) => {
        if (res.error || !res.access_token) {
          reject(new SignInError('denied', res.error_description || res.error));
        } else if (!api.hasGrantedAllScopes(res, DRIVE_SCOPE)) {
          // The consent screen lets the user untick the Drive permission.
          api.revoke(res.access_token);
          reject(new SignInError('scope'));
        } else {
          resolve({ accessToken: res.access_token, expiresAt: Date.now() + Number(res.expires_in ?? 3600) * 1000 });
        }
      },
      error_callback: (err) => reject(new SignInError(err.type === 'popup_closed' ? 'popup' : 'denied', err.type ?? err.message)),
    });
    client.requestAccessToken();
  });
}

export function revokeToken(accessToken: string): void {
  oauth2()?.revoke(accessToken);
}

export interface Account {
  /** Google's stable ID for the account (the email can change). */
  id: string;
  email: string;
}

export async function fetchAccount(accessToken: string, fetchFn: typeof fetch = (...a) => fetch(...a)): Promise<Account> {
  const res = await fetchFn('https://www.googleapis.com/oauth2/v3/userinfo', { headers: { Authorization: `Bearer ${accessToken}` } });
  if (!res.ok) throw new SignInError('denied', `userinfo ${res.status}`);
  const body = (await res.json()) as { sub?: string; email?: string };
  if (!body.sub) throw new SignInError('denied', 'userinfo');
  return { id: body.sub, email: body.email ?? body.sub };
}
