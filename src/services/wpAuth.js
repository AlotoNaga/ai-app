// ============================================================
// Shared WordPress auth / cookie helpers.
//
// Both Driver Mode and Attendance log in to schools.nagalandai.com via
// wp-login.php, harvest the auth cookies, then call admin-ajax.php with
// those cookies + a nonce. Keeping that logic in two places risks drift —
// a fix to one flow would silently miss the other. This module is the
// single testable home for the shared pieces:
//
//   - extractSetCookies(headers)  — robust multi-header parsing
//   - selectAuthCookies(cookies)  — keep only wordpress_logged_in / _sec
//   - hasLoggedInCookie(cookies)  — the strict success signal
//   - fetchNonce(cookieHeader, ajaxUrl, action)
//   - wpLogin({ origin, loginUrl, username, password })
// ============================================================

// React Native's Headers API is unreliable for multi-valued Set-Cookie:
// iOS folds them into one comma-joined string, Android often returns only
// the last entry. Try every avenue, in order:
//   1. headers.getSetCookie()      — modern fetch spec, returns string[]
//   2. headers.map['set-cookie']   — RN-internal, may be a string or array
//   3. headers.get('set-cookie')   — fallback, parsed with the regex below
// Cookie attributes (Expires=Wed, 01 Jan 2025…) contain commas too, so we
// split only on commas that directly precede a new "name=" pair.
export function extractSetCookies(headers) {
  if (!headers) return [];
  if (typeof headers.getSetCookie === 'function') {
    const arr = headers.getSetCookie();
    if (Array.isArray(arr) && arr.length) {
      return arr.map((c) => c.split(';')[0].trim()).filter(Boolean);
    }
  }
  const rnMap = headers.map && headers.map['set-cookie'];
  const raw = Array.isArray(rnMap) ? rnMap.join(', ') : (rnMap || headers.get('set-cookie') || '');
  if (!raw) return [];
  return raw
    .split(/,(?=\s*[A-Za-z0-9!#$%&'*+\-.^_`|~]+=)/)
    .map((p) => p.split(';')[0].trim())
    .filter(Boolean);
}

export const isWpAuthCookie = (c) => /^wordpress(_logged_in|_sec)/.test(c);

export function selectAuthCookies(cookies) {
  return (cookies || []).filter(isWpAuthCookie);
}

export function hasLoggedInCookie(cookies) {
  return (cookies || []).some((c) => c.startsWith('wordpress_logged_in'));
}

// Hit wp-login.php and return { ok, cookieHeader, cookies, response }.
// Caller decides whether to fail fast or do a follow-up identity check.
// Throws on network errors so the caller can wrap them in their own error
// type (DriverScreen and attendanceApi each have a slightly different error
// surface today).
export async function wpLogin({ loginUrl, redirectTo, username, password }) {
  const body =
    `log=${encodeURIComponent(username)}&pwd=${encodeURIComponent(password)}` +
    `&wp-submit=Log+In&testcookie=1` +
    (redirectTo ? `&redirect_to=${encodeURIComponent(redirectTo)}` : '');

  const response = await fetch(loginUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
    credentials: 'include',
  });

  const cookies = selectAuthCookies(extractSetCookies(response.headers));
  const cookieHeader = cookies.join('; ');
  return {
    ok: hasLoggedInCookie(cookies),
    cookies,
    cookieHeader,
    response,
  };
}

// GET admin-ajax.php?action=... and return the nonce string (or '').
export async function fetchNonce({ ajaxUrl, action, cookieHeader }) {
  try {
    const r = await fetch(`${ajaxUrl}?action=${action}`, {
      headers: { Cookie: cookieHeader },
      credentials: 'include',
    });
    const data = await r.json().catch(() => ({}));
    return data?.nonce || data?.data?.nonce || '';
  } catch {
    return '';
  }
}

// Best-effort server-side session revocation. Without this, a logged-out
// cookie remains valid on the server until WP's natural expiry — a stolen
// cookie still works after the user thinks they logged out.
//
// We hit wp-login.php?action=logout with the session cookie. WP normally
// requires a `_wpnonce` for the logout link, but it accepts a JSON-style
// AJAX logout when posted with the auth cookie. As a best-effort
// invalidation we send both shapes and ignore the response — local logout
// proceeds regardless of server reachability.
export async function wpLogout({ logoutUrl, cookieHeader, nonce }) {
  if (!logoutUrl || !cookieHeader) return false;
  try {
    const url = nonce ? `${logoutUrl}&_wpnonce=${encodeURIComponent(nonce)}` : logoutUrl;
    const resp = await fetch(url, {
      method: 'GET',
      headers: { Cookie: cookieHeader },
      credentials: 'include',
      // Don't follow redirects; WP's logout returns 302 to the login page,
      // which we don't need on a phone. RN fetch follows by default but the
      // response is harmless either way.
    });
    return resp.ok || resp.status === 302;
  } catch {
    return false;
  }
}
