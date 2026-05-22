# AUDIT_NOTES.md — What this v1.2.0 audit found and fixed

This document records the production-readiness audit done after the
initial v1.2.0 rename, and the additional fixes applied as a result.

## File parity

Every file from v1.1.0 is present in v1.2.0. Nothing was removed.
Two new docs were added: `SETUP_v1.2.md` (step-by-step setup) and
`AUDIT_NOTES.md` (this file).

## SDK 54 breaking changes that required CODE fixes

The dependency bumps alone are not enough. Three SDK 54 changes need
actual code-level fixes, which have been applied in this version.

### 1. Ionicons import style — known SDK 54 bug

**Problem:** GitHub issue expo/vector-icons#351 documents that in
SDK 54 + RN 0.81, `import { Ionicons } from '@expo/vector-icons'`
causes icons to render as a "?" placeholder on iOS.

**Fix:** Switched to direct path imports across all 12 files that use
Ionicons:

```diff
- import { Ionicons } from '@expo/vector-icons';
+ import Ionicons from '@expo/vector-icons/Ionicons';
```

Files changed: ErrorBoundary.js, AppHeader.js, AppSwitcher.js,
OfflineScreen.js, DriverScreen.js, OnboardingScreen.js,
SettingsScreen.js, RosterScreen.js, ClassPicker.js, SubjectPicker.js,
SyncStatusBar.js, AttendanceLogin.js.

### 2. React Native Firebase v23 — modular API migration

**Problem:** v1.1.0 used `@react-native-firebase/messaging` v21 with
the namespaced API (`messaging().getToken()`, etc.). v21 does not
compile against RN 0.81 (Expo SDK 54). v22+ removes the namespaced API.
Continuing to use it produces deprecation warnings and will break in
the next major release.

**Fix:** Bumped to `^23.0.1` and migrated `src/services/notifications.js`
to the modular API:

```diff
- import messaging from '@react-native-firebase/messaging';
+ import {
+   getMessaging,
+   getToken as fcmGetToken,
+   registerDeviceForRemoteMessages,
+   isDeviceRegisteredForRemoteMessages,
+ } from '@react-native-firebase/messaging';
+ const fbMessaging = getMessaging();

- if (!messaging().isDeviceRegisteredForRemoteMessages) {
-   await messaging().registerDeviceForRemoteMessages();
- }
- const fcmToken = await messaging().getToken();
+ if (!isDeviceRegisteredForRemoteMessages(fbMessaging)) {
+   await registerDeviceForRemoteMessages(fbMessaging);
+ }
+ const fcmToken = await fcmGetToken(fbMessaging);
```

The single `fbMessaging` instance is created once at module load and
reused for every API call (the v22 best practice). No other files
needed changes.

### 3. expo-build-properties field rename

**Problem:** SDK 54 renamed `enableProguardInReleaseBuilds` to
`enableMinifyInReleaseBuilds`.

**Fix:** Added the new field to the `expo-build-properties` plugin in
`app.json` Android section. (Original v1.1.0 didn't set this field at
all, so this is additive.)

## Production-readiness gaps fixed

### 4. eas.json — appVersionSource changed from "remote" to "local"

**Problem:** `"appVersionSource": "remote"` requires a one-time setup
step (`eas build:version:set:remote`) before the first build can run,
which trips up first-time builders.

**Fix:** Switched to `"local"`, which reads the build number / version
code from `app.json` and uses `autoIncrement: true` to bump locally.
Simpler, no extra setup needed.

### 5. react-native-webview version

**Problem:** Set to 13.16.0; the exact version bundled with SDK 54 per
Expo docs is 13.16.1.

**Fix:** Bumped to 13.16.1 exactly.

### 6. Removed redundant `ios.autoIncrement` in eas.json

**Problem:** `production` block had both `autoIncrement: true`
(top-level) and `ios: { autoIncrement: true }` (nested). The top-level
applies to both platforms; the nested one was redundant.

**Fix:** Removed the nested duplicate.

## SDK 54 changes verified as not affecting this app

Checked but no fix needed:

- **expo-notifications removed exports**: SDK 54 removed
  `removeNotificationSubscription`, `removePushTokenSubscription`,
  `presentNotificationAsync`. The app uses none of these — `App.js`
  uses the modern `subscription.remove()` pattern instead.
- **expo-av removal in SDK 55**: Not used.
- **JavaScriptCore removal**: App uses Hermes (default).
- **Reanimated v4 / worklets**: Not used.
- **expo-file-system /legacy path**: Not used.
- **app.json `statusBar` field removal**: Was not set.
- **app.json `notification` top-level field**: Was not set (uses
  `expo-notifications` plugin instead).
- **React 19 lifecycle deprecations**: No deprecated lifecycles used.
- **forwardRef**: Still works in 19.1, no migration urgent. Kept as-is
  in `MainShell.js`.

## What about the user agent / WordPress detection?

The WebView still injects `NagalandMe-App/<version>` as the user agent
suffix and `window.IS_NAGALAND_ME_APP = true` as the JS flag for
backward compatibility with the WPCode snippet already deployed on
your 6 sites. The new `IS_NAGALAND_AI_APP` flag is set alongside, so
new code can use either. You do NOT need to update any WordPress
snippets.

## What you should still verify after first build

1. Run `npx expo-doctor` after `npm install --legacy-peer-deps` — it
   should report 17/17 checks passed (or close to it). Any failures
   need attention before building.
2. Confirm `GoogleService-Info.plist` and `google-services.json` are
   in the project root (next to `app.json`) before running EAS Build.
3. Confirm `DEVICE_TOKEN_SECRET` is set as an EAS secret AND in
   `wp-config.php` on nagalandai.com as `NAI_DEVICE_TOKEN_SECRET`.
4. After first `eas init`, confirm `extra.eas.projectId` in `app.json`
   was filled in automatically (not still the placeholder).

## Status

This v1.2.0 is production-ready pending:
- Firebase config files dropped in
- DEVICE_TOKEN_SECRET configured in both EAS and WordPress
- `eas init` run to register the project on EAS

No further code changes are anticipated. The 3 critical SDK 54 fixes
have been applied; the 3 production-readiness improvements are done.
