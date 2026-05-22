# Changelog

## v1.2.1 — Production-readiness audit pass

Fixes from the audit recorded in
`/root/.claude/plans/please-investigate-my-app-quirky-dusk.md`. All
items below land on top of v1.2.0; no schema or contract changes
require a server-side migration. Behavioural differences a user might
notice are highlighted with **UX**.

### Security
- **C1** WebView: refuse `javascript:` and `about:*` (except
  `about:blank`) navigation. These ran in the page's trusted origin
  and could read WordPress session cookies.
- **C2** Backend `/register-device` rate-limit: split into a tight
  unauthenticated abuse counter (300/hr) and a loose authenticated
  counter (600/hr), so legitimate signed traffic from a NAT'd
  campus is never blocked by an unsigned attacker. TTL is no longer
  reset on every hit, so the window can't be held open
  indefinitely.
- **C3** EAS production builds fail if any `REPLACE_*` placeholder
  remains in `app.json` or `eas.json`. Local builds warn instead so
  iteration isn't blocked.
- **H5** Driver and Teacher logout now POST to `wp-login.php?action=logout`
  (best-effort) so the server-side session is revoked. Captured
  cookies stop working at logout instead of at natural expiry.
- **H6** SecureStore plaintext fallback events go through
  `reportError` so a broken keychain on a tester's device is
  visible in production crash reporting, not buried in a stripped
  `console.warn`.

### Reliability
- **C4** `APPLE_REVIEW_NOTES.md` restructured with explicit
  `<FILL IN>` markers and a pre-submission checklist for demo
  accounts. Apple Guideline 2.1 requires functional credentials in
  reviewer notes.
- **C5** "Reset Notification Preferences" (was "Clear Cache") now
  invalidates the notifications module's in-memory prefs cache after
  wiping disk, so the next push is filtered against the new state
  immediately. **UX:** menu label and confirmation text changed.
- **H1** Backend logs every token-format rejection with the
  device's platform, model, OS, and app version so Apple/FCM token
  changes are diagnosable.
- **H2** Token debounce key hashes the full metadata, not just the
  token bytes. A re-registration with new device_model / os_version
  / app_version inside the 60s window now writes correctly.
- **H3** New `src/services/crashReporter.js` is the single point of
  integration for unhandled JS errors and the React ErrorBoundary.
  Today it's a structured `console.error` fallback; plugging in
  Sentry / Bugsnag is a one-file change once the SDK is installed.
- **H7** RosterScreen distinguishes "no students" from "load
  failed" and offers a Retry button. **UX:** previously a SQLite
  open failure rendered an empty class with no signal.
- **H8** RosterScreen `useEffect` keys on `subject?.id` (scalar)
  instead of `subject` (object), so it no longer re-runs SQLite
  on every parent re-render.
- **H9** SyncStatusBar guards every async `setState` against
  unmount.
- **M2** `registerForPushNotifications()` deduplicates concurrent
  callers via an in-flight promise, so the first-launch race
  between cold-start + AppState-foreground doesn't fire two
  permission prompts on iOS.
- **M3** GPS pings have a bounded offline queue (20 entries / ~10
  min) in AsyncStorage. Pings buffered during a dead zone flush
  oldest-first when connectivity returns. **UX:** Driver Mode now
  shows "N ping(s) buffered" and "Last ping rejected: …" pills.
- **M12** ClassPicker auto-refresh effect is now mount-only — the
  previous deps closed over a prop function whose identity flipped
  on every parent render.
- **M13** OnboardingScreen reports `ONBOARDING_COMPLETE` write
  failures to `reportError` instead of silently swallowing them.

### Architecture / API
- **H4 + M5** Introduced `SCHOOLS_WP` shared host constants and a
  new `DRIVER_API` that mirrors `ATTENDANCE_API`. DriverScreen and
  `location.js` no longer hardcode WordPress URLs.
- **M9** Settings "Our Websites" list now maps over `SITES` from
  constants. Adding a new site picks up here automatically.
- **M10** Master push toggle: iOS can't revoke its own permission,
  so flipping the master switch off now snaps it back and routes
  the user to iOS Settings with a clear explanation. **UX:**
  previously the switch appeared to do nothing.
- **M11** SettingsScreen helpers (`<Row>`, `<LinkRow>`, `<Toggle>`)
  promoted to module-level components.
- **M7** WebView re-enables `phoneNumber` / `link` data detectors
  so tappable phone numbers work on experts.nagaland.me and the
  school pages.
- **M8** Backend caches the parsed Firebase service-account JSON
  per request so a single push-fanout call reads the private key
  from disk at most once.

### Polish
- **L4** DriverScreen surfaces the offline ping queue depth and
  last server error in two compact warning pills.
- **L6** Backend OAuth error log no longer dumps the full Google
  response body (which sometimes contains the service-account
  email).
- **L8** The startup `[notifications] DEVICE_TOKEN_SECRET is empty`
  warning is `__DEV__`-gated; production builds without the secret
  already fail in `app.config.js`.
- **L9** `LSApplicationQueriesSchemes` now lists `gpay`, `phonepe`,
  `paytm`, `itms-apps*`, `maps`, `comgooglemaps` so iOS
  `Linking.canOpenURL` checks succeed for the schemes already in
  WebViewScreen.
- **L14** Settings menu: "Clear Cache" renamed to "Reset
  Notification Preferences" — the old name implied wiping caches
  it never touched.
- **L15** Dropped the SyncStatusBar 1Hz `setInterval` poll; rising
  edge now flips synchronously inside `onPressSync`, falling edge
  comes from `onSyncChange`.

### Repo
- Repo restructured from a tracked zip file to a normal source
  tree. Pulls / clones now give a working dev environment
  immediately. The v1.2.0 zip is no longer in the repo — pull the
  branch instead, or `git archive --format=zip` if a zip download
  is needed.
- `eas.json` adds `SENTRY_DSN` env reference to all three build
  profiles and `autoIncrement: true` to the preview profile.

### Setup notes
- This release is **SDK 54**. Trying to run it in Expo Go that is
  newer or older than 54 will fail; an EAS development build is
  required for testing on a phone because
  `@react-native-firebase/messaging` is a native module that Expo
  Go does not bundle.
- Run `eas init` after first clone to fill in
  `app.json:extra.eas.projectId`. The app.config.js placeholder
  guard will fail any production build that still has
  `REPLACE_…` markers.
- To enable Sentry: install `@sentry/react-native`, set
  `SENTRY_DSN` via `eas secret:create`, and replace the body of
  `initBackend()` in `src/services/crashReporter.js` per the
  comments there.
