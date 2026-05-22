// ============================================================
// ATTENDANCE — REST/AJAX client for schools.nagalandai.com
//
// Auth model: same as Driver Mode — POST to wp-login.php, harvest the
// WordPress auth cookies, then call admin-ajax with the cookies + a nonce.
// Cookies live in SecureStore so they survive app restarts but never end
// up in plain AsyncStorage.
//
// Idempotency: every submission carries a client-generated UUID. The server
// plugin treats it as an idempotency key (see ATTENDANCE_API.actions.submit).
// That means our retry-on-failure is safe even if a previous attempt
// actually succeeded but we never saw the response.
// ============================================================

import AsyncStorage from '@react-native-async-storage/async-storage';
import { ATTENDANCE_API, STORAGE_KEYS } from '../config/constants';
import { getSecure, setSecure, deleteSecure } from './secureStorage';
import { wpLogin, fetchNonce } from './wpAuth';

// ---- session shape ---------------------------------------------------------
// { cookie: 'name=val; name2=val2', nonce: 'abc123', teacher: { id, name, email } }
let _session = null;

export async function loadSession() {
  if (_session) return _session;
  try {
    const raw = await getSecure(STORAGE_KEYS.TEACHER_SESSION);
    if (raw) _session = JSON.parse(raw);
  } catch { _session = null; }
  return _session;
}

async function persistSession(s) {
  _session = s;
  await setSecure(STORAGE_KEYS.TEACHER_SESSION, JSON.stringify(s));
}

export async function clearSession() {
  _session = null;
  await deleteSecure(STORAGE_KEYS.TEACHER_SESSION);
  await AsyncStorage.multiRemove([
    STORAGE_KEYS.TEACHER_LAST_CLASS,
    STORAGE_KEYS.TEACHER_LAST_SUBJECT,
  ]);
}

// ---- low-level admin-ajax POST --------------------------------------------
// Throws AttendanceApiError on protocol failure. Treats `success: false` from
// the server as a structured failure (returned, not thrown) so callers can
// surface server messages verbatim.
export class AttendanceApiError extends Error {
  constructor(message, opts = {}) {
    super(message);
    this.name = 'AttendanceApiError';
    this.status = opts.status;
    this.code = opts.code;       // 'no_session' | 'expired' | 'network' | 'parse'
  }
}

async function ajax(action, params = {}) {
  const s = await loadSession();
  if (!s?.cookie) throw new AttendanceApiError('Not signed in', { code: 'no_session' });

  const body = new URLSearchParams();
  body.append('action', action);
  if (s.nonce) body.append('nonce', s.nonce);
  Object.keys(params).forEach((k) => {
    const v = params[k];
    if (v === undefined || v === null) return;
    body.append(k, typeof v === 'string' ? v : JSON.stringify(v));
  });

  let r;
  try {
    r = await fetch(ATTENDANCE_API.ajaxUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        Cookie: s.cookie,
      },
      body: body.toString(),
      credentials: 'include',
    });
  } catch (e) {
    throw new AttendanceApiError(e.message || 'Network unreachable', { code: 'network' });
  }

  if (r.status === 401 || r.status === 403) {
    throw new AttendanceApiError('Session expired', { status: r.status, code: 'expired' });
  }
  if (!r.ok) {
    throw new AttendanceApiError(`Server error (HTTP ${r.status})`, { status: r.status });
  }

  const text = await r.text();
  try { return JSON.parse(text); }
  catch {
    throw new AttendanceApiError('Server returned non-JSON (session likely expired)', { code: 'parse' });
  }
}

// ============================================================
// LOGIN — username + password → harvest auth cookies + nonce + teacher info
// Returns the teacher payload on success. Throws AttendanceApiError otherwise.
// ============================================================
export async function login(username, password) {
  let result;
  try {
    result = await wpLogin({
      loginUrl: ATTENDANCE_API.loginUrl,
      redirectTo: ATTENDANCE_API.origin + '/wp-admin/',
      username,
      password,
    });
  } catch (e) {
    throw new AttendanceApiError(e.message || 'Network unreachable', { code: 'network' });
  }

  // Strict success: require the wordpress_logged_in cookie. Some plugin
  // configurations redirect to /wp-admin even when authentication actually
  // failed (e.g. 2FA or maintenance interstitials), so landing on /wp-admin
  // is not a reliable signal on its own. The role/identity check via
  // getMyClasses below is the second gate — if that fails we throw and clear
  // the partial session before any local state is persisted.
  if (!result.ok) {
    throw new AttendanceApiError('Invalid username or password');
  }

  const cookieHeader = result.cookieHeader;
  const nonce = await fetchNonce({
    ajaxUrl: ATTENDANCE_API.ajaxUrl,
    action: ATTENDANCE_API.actions.getNonce,
    cookieHeader,
  });

  // Persist preliminary session so ajax() below can use it.
  await persistSession({ cookie: cookieHeader, nonce, teacher: null });

  // Verify role + fetch initial roster in one call.
  const dr = await ajax(ATTENDANCE_API.actions.getMyClasses, {});
  if (!dr.success) {
    await clearSession();
    throw new AttendanceApiError(dr.data?.message || 'Your account is not assigned as a teacher.');
  }

  const teacher = dr.data?.teacher || { name: username };
  await persistSession({ cookie: cookieHeader, nonce, teacher });
  return { teacher, classes: dr.data?.classes || [] };
}

// ============================================================
// REFRESH — pull the latest classes + students for the logged-in teacher.
// ============================================================
export async function fetchClasses() {
  const dr = await ajax(ATTENDANCE_API.actions.getMyClasses, {});
  if (!dr.success) {
    throw new AttendanceApiError(dr.data?.message || 'Could not load classes');
  }
  return { teacher: dr.data?.teacher || null, classes: dr.data?.classes || [] };
}

// ============================================================
// SUBMIT — single batch of records for one class+subject+date.
// `records` is an array of { client_id, student_id, status, remarks }.
// Server response on success: { success: true, data: { results: [{ client_id, server_id }] } }.
// On idempotent re-submission, server returns the original server_id.
// ============================================================
export async function submitAttendanceBatch({ classId, subjectId, date, records }) {
  const dr = await ajax(ATTENDANCE_API.actions.submit, {
    class_id: classId,
    subject_id: subjectId ?? '',
    date,
    records,
  });
  if (!dr.success) {
    throw new AttendanceApiError(dr.data?.message || 'Server rejected the batch');
  }
  // Map client_id -> server_id for the caller.
  const map = {};
  for (const row of dr.data?.results || []) {
    if (row.client_id) map[row.client_id] = row.server_id ?? null;
  }
  return map;
}
