// ============================================================
// Crash + error reporter — single integration point.
//
// Today this is a thin wrapper around `console.error` with a small
// in-memory recent-error buffer for diagnostics. The whole point of
// keeping it in its own module is so plugging in a real backend
// (Sentry / Bugsnag / Crashlytics) later is a one-file change —
// ErrorBoundary, the global handler, and every callsite stay the
// same.
//
// To enable Sentry:
//   1. `npx expo install @sentry/react-native`
//   2. In EAS secrets: `eas secret:create --name SENTRY_DSN --value <dsn>`
//   3. Replace the body of `initBackend()` below with:
//        const Sentry = require('@sentry/react-native');
//        Sentry.init({ dsn, tracesSampleRate: 0.1, ...opts });
//        backend = {
//          captureException: (e, ctx) => Sentry.captureException(e, { extra: ctx }),
//          setUser: (u) => Sentry.setUser(u),
//        };
//   4. Wrap App in `Sentry.wrap()` (see App.js comment).
// ============================================================

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import { APP_VERSION } from '../config/constants';

let backend = null;       // { captureException, setUser } once a real SDK is wired
let initialized = false;
const recent = [];        // last 20 errors, for in-app diagnostics if ever needed

function pushRecent(error, context) {
  recent.push({
    at: Date.now(),
    message: error?.message || String(error),
    stack: error?.stack,
    context: context || null,
  });
  if (recent.length > 20) recent.shift();
}

function initBackend(dsn) {
  // Placeholder. Replace this block with the Sentry init shown in the
  // header comment once `@sentry/react-native` is installed.
  if (!dsn) return null;
  console.warn('[crashReporter] SENTRY_DSN is set but the SDK is not wired yet. See src/services/crashReporter.js header comment.');
  return null;
}

/** Call once on app start, before any other code that might throw. */
export function initCrashReporter() {
  if (initialized) return;
  initialized = true;

  const dsn = Constants?.expoConfig?.extra?.sentryDsn || '';
  backend = initBackend(dsn);

  // Catch uncaught JS exceptions outside the React tree (eg. inside an
  // async event handler that never awaits). React's ErrorBoundary alone
  // can't see these.
  if (typeof global !== 'undefined' && global.ErrorUtils) {
    const prev = global.ErrorUtils.getGlobalHandler();
    global.ErrorUtils.setGlobalHandler((error, isFatal) => {
      reportError(error, { source: 'global-handler', isFatal: !!isFatal });
      if (prev) prev(error, isFatal);
    });
  }
}

/**
 * Report a non-fatal error.
 * @param {Error|any} error
 * @param {object} [context] - free-form extras (component name, props, etc.)
 */
export function reportError(error, context) {
  pushRecent(error, context);
  if (backend) {
    try { backend.captureException(error, context); } catch {}
    return;
  }
  // Fallback path — kept structured so it's easy to grep in a tail -f.
  const tag = '[crashReporter]';
  if (context) console.error(tag, error, context);
  else         console.error(tag, error);
}

/** Tie subsequent reports to a logged-in user. Pass `null` to clear. */
export function setReporterUser(user) {
  if (backend) {
    try { backend.setUser(user || null); } catch {}
  }
}

/** Read-only snapshot of recent errors for in-app diagnostics. */
export function getRecentErrors() {
  return recent.slice();
}

/** Stable metadata included on every report (when a backend is wired). */
export function getReporterMetadata() {
  return {
    appVersion: APP_VERSION,
    platform: Platform.OS,
    platformVersion: Platform.Version,
  };
}
