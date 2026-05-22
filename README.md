# Nagaland AI — v1.2.0

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

## What changed from v1.1.0

1. **Renamed**: app display name is now Nagaland AI (was Nagaland Me). Bundle
   IDs unchanged — Firebase configs and store listings stay intact.
2. **SDK 54**: all dependencies bumped to versions Expo SDK 54 expects.
3. **React Native Firebase**: bumped from v21 to v23 (required for SDK 54).
4. **babel.config.js**: cleaned up. The plugins added during v1.1.0 debugging
   were treating symptoms of the SDK 52 / Expo Go mismatch — removed.
5. **eas.json**: updated to CLI 16+, cleaner build profiles, prod auto-increments.
6. **README** + **APPLE_REVIEW_NOTES** rebranded.

## Why this app cannot run in Expo Go

Read SETUP_v1.2.md → "Why Expo Go does not work" for the full story. Short
version: this app uses `@react-native-firebase/messaging` for iOS push tokens,
plus background location, plus custom notification sounds, plus secure
storage. None of those work in the prebuilt Expo Go app. You must build a
custom **development build** via EAS Build, install it on your phone once,
and use that to test from then on. Production builds go through TestFlight
and the Play Console.

## File map

```
package.json             SDK 54 dependencies (pinned)
app.json                 Expo config — Nagaland AI, permissions, plugins
app.config.js            Wraps app.json; injects DEVICE_TOKEN_SECRET from EAS
eas.json                 EAS Build profiles (development, preview, production)
babel.config.js          Minimal: babel-preset-expo only
.gitignore

App.js                   Root component — init, notifications, splash
SETUP_v1.2.md            Step-by-step setup guide — READ FIRST
APPLE_REVIEW_NOTES.md    Notes for App Store reviewers

src/
  App.js                 (above)
  config/
    constants.js         APP_VERSION, sites, urls, colors, channels, storage keys
  components/
    AppHeader.js
    AppSwitcher.js
    CustomSplash.js
    ErrorBoundary.js
    OfflineScreen.js
    WebViewScreen.js     6-site WebView wrapper, UA injection
  screens/
    MainShell.js         Shell that switches between WebView / Driver / Attendance
    OnboardingScreen.js
    SettingsScreen.js
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
    notifications.js     expo-notifications + FCM for iOS via Firebase Messaging
    location.js          Background GPS task for school bus tracking
    secureStorage.js     expo-secure-store wrapper
    wpAuth.js            WordPress cookie auth (Driver Mode)
    attendanceApi.js     admin-ajax.php client for attendance
    attendanceDb.js      Offline SQLite mirror
    attendanceSync.js    Queue + retry for offline submissions

assets/                  icons, splash, notification sounds
backend/                 PHP plugin code for device token registration
website-app-detection.js JS snippet to install on WP sites via WPCode
```

## Quick start

```bash
# 1. Install dependencies (Node 20.19.4 or higher required)
npm install --legacy-peer-deps

# 2. Verify everything pins correctly to SDK 54
npx expo install --fix
npx expo-doctor

# 3. First-time EAS setup (one time only)
npm install -g eas-cli
eas login                                      # sign in with your nagalandme account
eas init                                       # creates the project on EAS, writes projectId into app.json
eas secret:create --name DEVICE_TOKEN_SECRET --value <long-random-string>

# 4. Put your Firebase config files next to app.json
#    - GoogleService-Info.plist   (from Firebase iOS app)
#    - google-services.json       (from Firebase Android app)
#    The SAME random string from step 3 must be put in wp-config.php on
#    nagalandai.com as:
#        define('NAI_DEVICE_TOKEN_SECRET', '<same-random-string>');

# 5. Build a development client for your iPhone
npm run build:dev:ios
# Wait 15–25 minutes. Open the build URL on your iPhone, install via Safari.

# 6. Once installed, start Metro and connect
npx expo start
# Scan the QR code with your new Nagaland AI dev client (NOT Expo Go)
```

For full step-by-step instructions including Firebase setup, EAS secrets,
TestFlight, and Play Console, read **SETUP_v1.2.md**.

## Production build

```bash
npm run build:ios                              # → .ipa for TestFlight
npm run build:android                          # → .aab for Play Console
npm run submit:ios                             # after updating eas.json with Apple IDs
npm run submit:android                         # after placing google-service-account.json
```

## Version history

| Version | Build | SDK | Notes |
| --- | --- | --- | --- |
| 1.2.0 | 3 | 54 | Renamed to Nagaland AI; SDK 54; RNFB v23 |
| 1.1.0 | 2 | 52 | Driver GPS, Attendance offline, 9 notification channels |
| 1.0.0 | 1 | 52 | First release — WebView + push notifications |
