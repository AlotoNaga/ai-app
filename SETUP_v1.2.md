# SETUP_v1.2.md — Nagaland AI Setup, Step by Step

Read this from top to bottom. Do not skip steps. Every command goes in
Terminal on your MacBook unless it says otherwise.

---

## 0. Why Expo Go does not work, and what changed

You spent hours scanning the QR code with Expo Go and getting these errors:

- "Project is incompatible with this version of Expo Go" (SDK 52 vs 54)
- "Cannot find module 'babel-preset-expo'"
- "Private properties are not supported"
- "Property 'DOMException' doesn't exist"
- "Native module RNFBAppModule not found"
- "App entry not found"

All six errors are symptoms of one root cause:

> **This app uses native code that the prebuilt Expo Go app does not contain.**

Specifically:

1. `@react-native-firebase/app` and `@react-native-firebase/messaging` —
   needed because your backend (`nai_send_push`) only sends via FCM, so
   iPhones need Firebase to convert APNs tokens to FCM tokens.
2. `expo-task-manager` with background location — for school bus GPS.
3. Custom notification sounds (`emergency_alarm.wav`, `absent_alert.wav`,
   `holiday_chime.wav`, `order_received.wav`) — bundled at build time.
4. `expo-secure-store` and `expo-build-properties` with
   `useFrameworks: "static"` — both require native compilation.

Expo Go is a prebuilt app published to the App Store and Play Store by
Anthropic, sorry, by Expo. Apple only allows ONE version of Expo Go to
exist on the App Store at a time, and that version is locked to the
latest SDK (currently SDK 54). So:

- You cannot install a SDK 52 version of Expo Go on iOS.
- You cannot make Expo Go include native code that isn't already inside it.

The solution is to make your own custom version of Expo Go that contains
your app's native code. This is called a **development build** (or
"dev client"). You build it once with EAS Build, install it on your
phone, and from then on you scan QR codes with your custom dev client
instead of Expo Go.

Production builds (for TestFlight and Play Store) are the same idea but
without the live-reload dev features.

---

## 1. Prerequisites

Open Terminal and check each of these. If any fail, install before
continuing.

```bash
node --version    # must be 20.19.4 or higher
npm --version     # must be 10.x or higher
git --version
```

If Node is below 20.19.4, install via nvm:

```bash
brew install nvm
mkdir -p ~/.nvm
echo 'export NVM_DIR="$HOME/.nvm"' >> ~/.zshrc
echo '[ -s "/opt/homebrew/opt/nvm/nvm.sh" ] && . "/opt/homebrew/opt/nvm/nvm.sh"' >> ~/.zshrc
source ~/.zshrc
nvm install 20
nvm use 20
```

You also need:

- An Apple Developer account ($99/year) — you already submitted v1.1, so
  you have this.
- A Google Play Console account ($25 one-time) — you may not need this
  for now, only for Play Store release.
- An Expo account — you said you have one (the `nagalandme` org).
- A Firebase project with both iOS and Android apps registered. You said
  you have both `GoogleService-Info.plist` and `google-services.json`.

---

## 2. Unpack v1.2.0 and install

```bash
# 1. Unzip the new v1.2.0 ZIP to your Desktop
cd ~/Desktop
unzip nagaland-ai-app-v1.2.0.zip
cd nagaland-ai-app-v1.2.0

# 2. Install dependencies (--legacy-peer-deps is needed because
#    @react-native-firebase v23 still has some old peer dep declarations)
npm install --legacy-peer-deps

# 3. Make sure every package is at the exact version SDK 54 expects.
#    This is the step you were missing in v1.1.0.
npx expo install --fix

# 4. Run Expo Doctor — it should report 17/17 checks passed (or close)
npx expo-doctor
```

If `expo-doctor` complains about a specific package version, run:

```bash
npx expo install <package-name>
```

That installs the exact version Expo SDK 54 wants. Do NOT use `npm install`
for Expo packages — it ignores SDK pinning.

---

## 3. Drop in your Firebase config files

You need two files from the Firebase Console, placed at the project root
next to `app.json`:

```
nagaland-ai-app-v1.2.0/
├── app.json
├── GoogleService-Info.plist    ← from Firebase iOS app
├── google-services.json        ← from Firebase Android app
└── package.json
```

**Get them:**

1. Open the Firebase Console → your Nagaland AI project.
2. **iOS:** Click the gear → Project Settings → Your apps → iOS app
   (bundle ID `com.nagalandme.nagalandai`) → "GoogleService-Info.plist"
   download. Save next to `app.json`.
3. **Android:** Same screen, Android app (package
   `com.nagalandme.nagalandai`) → "google-services.json" download.
   Save next to `app.json`.

If the Firebase apps don't exist yet (you said they do), the bundle ID
and package name must EXACTLY match `com.nagalandme.nagalandai`.

These files contain sensitive Firebase API keys. Do not commit them to
Git — they're already in `.gitignore`.

---

## 4. Install EAS CLI and log in

```bash
npm install -g eas-cli@latest

# Verify it works
eas --version    # should be 16.x or higher

# Log in with your nagalandme Expo account
eas login
# Enter your email + password
```

If you can't remember your Expo password, reset it at
`https://expo.dev/forgot-password`.

---

## 5. Initialize the EAS project

This is a one-time step. It registers the project on EAS and writes a
project ID into your `app.json` so EAS knows which project to build.

```bash
cd ~/Desktop/nagaland-ai-app-v1.2.0
eas init
```

When asked:
- "Would you like to create a new EAS project?" → **Yes**
- It will offer a slug — accept `nagaland-ai` (or use your own).
- It writes `extra.eas.projectId` into `app.json` automatically.

After this completes, open `app.json` and confirm that
`extra.eas.projectId` has a long ID (looks like `abc123de-...`) instead of
`REPLACE_AFTER_FIRST_EAS_BUILD_INIT`.

---

## 6. Create the device token secret

The backend (`nai_send_push` on `nagalandai.com`) rejects any push token
registration request that isn't signed with a shared HMAC secret. You must
generate that secret once and put it in two places.

```bash
# 1. Generate a long random string (run this command, save the output)
openssl rand -hex 32
# Example output: a3f8c2e9... (64 characters)

# 2. Tell EAS about it
eas secret:create --name DEVICE_TOKEN_SECRET --value 'a3f8c2e9...'
# (paste the same value you generated above)

# 3. Verify
eas secret:list
# You should see DEVICE_TOKEN_SECRET in the list.
```

**Now put the SAME value into wp-config.php on nagalandai.com:**

1. Open Hostinger File Manager → public_html (or wherever WordPress
   lives) → `wp-config.php`.
2. Find the section that has other `define(...)` lines (near the top,
   after the database credentials).
3. Add this line:
   ```php
   define('NAI_DEVICE_TOKEN_SECRET', 'a3f8c2e9...');  // same value as EAS secret
   ```
4. Save.

Without this, push notifications will silently fail in production. Every
register-device request from the app will get a 401 from the backend.

---

## 7. Build the iOS development client

This is the moment Expo Go is replaced.

```bash
npm run build:dev:ios
# Same as: eas build --platform ios --profile development
```

EAS will ask:

- "Generate a new Apple Distribution Certificate?" → **Yes**
- "Generate a new Apple Provisioning Profile?" → **Yes**
- "Apple ID email" → enter it
- "App-specific password" → generate one at
  `https://appleid.apple.com/account/manage` → Sign-In and Security →
  App-Specific Passwords → "+" → name it "EAS Build"

The build takes 15–25 minutes. EAS gives you a URL like
`https://expo.dev/accounts/nagalandme/projects/nagaland-ai/builds/abc123`.

**Install on your iPhone:**

1. Open the build URL in Safari on your iPhone.
2. Tap "Install".
3. iOS will say "Untrusted Enterprise Developer" — go to:
   Settings → General → VPN & Device Management → tap your Apple ID →
   tap "Trust".
4. The app icon appears on your home screen. This is your **custom Expo
   Go**. Use it instead of the App Store Expo Go from now on.

---

## 8. Build the Android development client

```bash
npm run build:dev:android
```

Same 15–25 minute wait. The output is a `.apk` file.

**Install on your Android phone:**

1. Open the build URL in Chrome on your Android.
2. Tap "Install" / "Download".
3. Tap the APK file → "Install" (allow "install from unknown sources" if
   prompted).
4. App icon appears. Done.

---

## 9. Start the dev server and connect

```bash
# In the project folder
npx expo start
```

You see the familiar QR code in Terminal.

- **iOS**: Open the Camera app, scan the QR code → it asks to open in
  "Nagaland AI" (your dev client, not Expo Go).
- **Android**: Open your custom Nagaland AI dev client → tap "Scan QR
  code" → scan.

The app loads with hot reload, just like Expo Go did, but now with Firebase
and background location working.

---

## 10. Common problems

### "DEVICE_TOKEN_SECRET is empty" warning at startup

You're running in development without the EAS secret. Either:
- Set it as a local env var: `export DEVICE_TOKEN_SECRET=<value> && npx expo start`
- Or just ignore it for now — push tokens won't register but everything
  else works. Production builds will pick up the secret from EAS.

### Build fails with "non-modular header" or "use_frameworks" error

This is a known Firebase + SDK 54 issue. Solution: open `app.json`, find
the `expo-build-properties` plugin, and confirm it has:

```json
"ios": { "useFrameworks": "static" }
```

It already does in v1.2.0. If you still hit the error, add this inside
the `ios` block:

```json
"ios": {
  "useFrameworks": "static",
  "extraPods": []
}
```

### "App entry not found" after install

Run:

```bash
npx expo start --clear
```

The `--clear` wipes Metro's bundler cache.

### Hot reload not working

Shake your iPhone (or Cmd+D in iOS simulator, Cmd+M in Android emulator)
to open the dev menu → "Reload".

---

## 11. Going to production

Once everything works in the dev client:

```bash
# iOS production build (for TestFlight)
npm run build:ios

# Android production build (for Play Console)
npm run build:android
```

Each build takes 25–40 minutes. Production builds:
- Use the production-signed certificate / keystore.
- Include the DEVICE_TOKEN_SECRET from EAS secrets.
- Auto-increment build number / version code each time.

**Submit to App Store:**

1. First open `eas.json` and update the `submit.production.ios` block
   with your Apple ID email, your App Store Connect app ID (from
   `appstoreconnect.apple.com` → your app → App Information), and your
   Apple Team ID (from `developer.apple.com` → Membership).
2. Run:
   ```bash
   npm run submit:ios
   ```
3. EAS uploads the build to TestFlight. From there, add testers in App
   Store Connect.

**Submit to Play Store:**

1. Create a service account in Google Cloud Console with "Service Account
   User" + "Release Manager" roles in Play Console.
2. Download the JSON key → save as `google-service-account.json` next to
   `app.json`. Add to `.gitignore`.
3. Run:
   ```bash
   npm run submit:android
   ```

---

## 12. What to send Claude when something breaks

When something fails, send these THREE things in one message:

1. The exact error message (screenshot or copy-paste).
2. The command you ran right before the error.
3. The contents of `npx expo-doctor` (run it and copy the output).

That's enough information to diagnose 95% of problems on the first try.
Don't iterate on error after error like with v1.1.0 — send the full
context once and we'll fix it in one step.
