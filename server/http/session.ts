import { timingSafeEqual } from 'node:crypto';
import type { MiddlewareHandler } from 'hono';
import { getCookie, setCookie } from 'hono/cookie';

function sameSecret(a: string | undefined | null, b: string): boolean {
  if (!a) return false;
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

/** Cookie names ignore the port, so two running copies must not share one. */
export const sessionCookieName = (port: number) => `rmm_session_${port}`;

/**
 * Desktop app (DESIGN 15.3): only the browser tab the app opened may use the API.
 * The app opens `/?launch=<token>`; that sets an HttpOnly, SameSite=Strict cookie
 * and redirects to `/`. API calls without the cookie (other programs or other
 * users on this machine, a tab left over from an earlier launch) get 401.
 */
export function launchSession(token: string, port: number): MiddlewareHandler {
  const cookie = sessionCookieName(port);
  return async (c, next) => {
    const launch = c.req.query('launch');
    if (c.req.path === '/' && launch !== undefined) {
      if (!sameSecret(launch, token)) {
        return c.text('This link is from an earlier launch. Start Research Mind Map again. / 古い起動リンクです。アプリを起動し直してください。', 403);
      }
      setCookie(c, cookie, token, { httpOnly: true, sameSite: 'Strict', path: '/' });
      return c.redirect('/', 303);
    }
    if (c.req.path.startsWith('/api/') && !sameSecret(getCookie(c, cookie), token)) {
      return c.json({ error: { code: 'unauthorized', message: 'アプリが開いたタブから使ってください（アプリを起動し直すと新しいタブが開きます）。 / Use the tab the app opened (start the app again to get one).' } }, 401);
    }
    await next();
  };
}
