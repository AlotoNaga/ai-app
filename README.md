# Nagaland AI — v1.2.1

The Nagaland AI mobile app: one app, seven services. Built by Nagaland Me
(GST 13DIHPA5679B1ZK, Dimapur, Nagaland, India).

| | |
| --- | --- |
| Display name | Nagaland AI |
| Developer | Nagaland Me |
| Bundle ID (iOS) | com.nagalandme.nagalandai |
| Package (Android) | com.nagalandme.nagalandai |
| Expo SDK | 54 |
| React Native | 0.81.4 |
| React | 19.1.0 |
| Architecture | Legacy (newArchEnabled: false) |
| Hermes | enabled (default) |

## What changed in v1.2.1

Full list with audit IDs in `CHANGELOG.md`. The headlines:

- **Security**: closed a WebView `javascript:` URL hole, fixed the backend
  rate-limiter so an unsigned attacker can no longer lock out a NAT'd
  campus, added server-side WordPress logout on Driver/Teacher sign-out.
- **Reliability**: GPS pings now buffer in a bounded offline queue and
  flush when connectivity returns; concurrent push registrations
  deduplicate; RosterScreen surfaces real load errors instead of pretending
  the class is empty.
- **Production architecture**: centralized crash reporter
  (`src/services/crashReporter.js`) is the single place to plug in
  Sentry / Bugsnag — every callsite already routes through it.
- **Apple review**: `APPLE_REVIEW_NOTES.md` restructured with explicit
  demo-credential placeholders and a pre-submission checklist (Guideline
  2.1 compliance).
- **Build safety**: a placeholder guard in `app.config.js` fails any
  production EAS build that still has `REPLACE_*` markers in `app.json`
  or `eas.json`.
- **Dependencies**: added the missing `expo-font` peer of
  `@expo/vector-icons` that would otherwise have crashed native builds.

## Why this app cannot run in Expo Go

Read **SETUP_v1.2.md → "Why Expo Go does not work"** for the full story.
Short version: this app uses `@react-native-firebase/messaging` for iOS
push tokens, plus background location, plus custom notification sounds.
None of those work in the prebuilt Expo Go app. You must build a custom
**development build** via EAS Build once, install it on your phone, and
use that for daily testing. Production builds go through TestFlight and
the Play Console.

## File map

```
package.json             SDK 54 dependencies (pinned)
package-lock.json        Lockfile — committed for reproducible builds
app.json                 Expo config — Nagaland AI, permissions, plugins
app.config.js            Wraps app.json; injects DEVICE_TOKEN_SECRET +
                         SENTRY_DSN from EAS env; placeholder guard
eas.json                 EAS Build profiles (development, preview, production)
babel.config.js          Minimal: babel-preset-expo only
.gitignore               Standard — also excludes the audit extraction dir
CHANGELOG.md             Per-release notes with audit IDs

App.js                   Root component — init, notifications, splash
SETUP_v1.2.md            Step-by-step setup guide — READ FIRST
APPLE_REVIEW_NOTES.md    Notes for App Store reviewers — fill in demo creds
AUDIT_NOTES.md           SDK 54 migration + audit history

src/
  config/
    constants.js         APP_VERSION, sites, urls, colors, channels,
                         storage keys, SCHOOLS_WP / DRIVER_API endpoints
  components/
    AppHeader.js
    AppSwitcher.js
    CustomSplash.js
    ErrorBoundary.js     Routes errors through crashReporter
    OfflineScreen.js
    WebViewScreen.js     7-site WebView wrapper; URL allow-list + javascript: blocked
  screens/
    MainShell.js         Shell that switches between WebView / Driver / Attendance
    OnboardingScreen.js
    SettingsScreen.js    Notifications + sites list driven by SITES
    DriverScreen.js      School bus GPS tracking
    AttendanceScreen.js
    attendance/
      AttendanceLogin.js
      ClassPicker.js
      SubjectPicker.js
      RosterScreen.js
      SyncStatusBar.js
      styles.js
  services/
    crashReporter.js     Single integration point for unhandled errors
    notifications.js     expo-notifications + FCM via Firebase Messaging
    location.js          Background GPS task + bounded offline ping queue
    secureStorage.js     expo-secure-store wrapper, reports fallback events
    wpAuth.js            WordPress cookie auth, login + logout
    attendanceApi.js     admin-ajax.php client for attendance
    attendanceDb.js      Offline SQLite mirror
    attendanceSync.js    Queue + retry for offline submissions

assets/                  icons, splash, notification sounds
backend/                 PHP plugin code for device token registration
website-app-detection.js JS snippet to install on WP sites via WPCode
```

## Quick start (from a fresh clone)

```bash
# 1. Install dependencies (Node 20.19.4 or higher)
npm install --legacy-peer-deps

# 2. Verify everything pins correctly
npx expo-doctor

# 3. First-time EAS setup (one-time only)
npm install -g eas-cli
eas login                                          # sign in as nagalandme
eas init                                           # writes projectId into app.json
eas secret:create --name DEVICE_TOKEN_SECRET --value <long-random-string>
# Optional, for crash reporting:
eas secret:create --name SENTRY_DSN --value <dsn>

# 4. Drop your Firebase config files next to app.json
#    - GoogleService-Info.plist   (Firebase iOS app)
#    - google-services.json       (Firebase Android app)
#    The same DEVICE_TOKEN_SECRET value from step 3 also goes into
#    wp-config.php on nagalandai.com as:
#        define('NAI_DEVICE_TOKEN_SECRET', '<same-random-string>');

# 5. Build a development client for your iPhone
npm run build:dev:ios
# 15–25 min. Open the build URL on iPhone Safari, install.

# 6. Daily development from then on
npx expo start --dev-client
# Scan the QR with the installed dev client (NOT Expo Go).
```

Full instructions including Firebase setup, EAS secrets, TestFlight, and
the Play Console are in **SETUP_v1.2.md**.

## Production build

```bash
npm run build:ios                                  # → .ipa for TestFlight
npm run build:android                              # → .aab for Play Console
npm run submit:ios                                 # after eas.json Apple IDs filled in
npm run submit:android                             # after google-service-account.json placed
```

The placeholder guard in `app.config.js` will fail any production build
that still has `REPLACE_*` strings in `app.json` or `eas.json`. This is
intentional — submit a real production build, not a half-configured one.

## Troubleshooting

| Symptom | Cause | Fix |
| --- | --- | --- |
| Expo Go shows "Project is incompatible…" | Expo Go ships only the latest SDK; you can't run an older project in it | Build a dev client per the Quick Start above |
| `Cannot find module 'babel-preset-expo'` on phone | Project deps weren't installed, or you opened an old SDK 52 project in a new Expo Go | `npm install --legacy-peer-deps` and re-bundle |
| `[runtime not ready]: private properties are not supported` | Hermes version mismatch (old project / new Expo Go) | Same as above — build a dev client for this project |
| Push token registration always returns 401 | `DEVICE_TOKEN_SECRET` empty in EAS, or doesn't match `NAI_DEVICE_TOKEN_SECRET` in wp-config.php | Both values must be identical; rotate both together |
| GPS Pings counter stuck at 0 during a trip | Server is rejecting pings (401, 500…) | DriverScreen now shows the error and the buffered queue depth — re-login if 401, retry server if 5xx |
| "Could not load students" on RosterScreen | SQLite open / read failed | Tap Retry; if it persists, "Reset Notification Preferences" → reinstall as a last resort |
| Build fails with "Unfilled placeholder(s) detected" | `app.json`/`eas.json` still has `REPLACE_*` markers | Run `eas init`; fill in `submit.production.ios.*` in `eas.json` |

## Version history

| Version | Build | SDK | Notes |
| --- | --- | --- | --- |
| 1.2.1 | 4 | 54 | Production-readiness audit — see CHANGELOG.md |
| 1.2.0 | 3 | 54 | Renamed to Nagaland AI; SDK 54; RNFB v23 |
| 1.1.0 | 2 | 52 | Driver GPS, Attendance offline, 9 notification channels |
| 1.0.0 | 1 | 52 | First release — WebView + push notifications |
