# APP STORE REVIEW NOTES — NAGALAND AI
# Paste into App Store Connect → App Review Information → Notes

App name: Nagaland AI
Developer: Nagaland Me (registered company, GST 13DIHPA5679B1ZK)

This is NOT a single-website wrapper. Nagaland AI is a unified app
serving Nagaland, Northeast India that bundles seven distinct services
plus genuinely native bus-tracking, push notifications, a settings
panel, and offline handling.

## 1. SEVEN SERVICES IN ONE APP
   The app loads each service in WKWebView (NOT UIWebView):
   - AI Chat            (nagalandai.com)        — state-level AI assistant
   - Experts Marketplace (experts.nagaland.me)   — creator-services marketplace
   - Schools             (schools.nagalandai.com) — school info
   - Help Nagaland       (helpnagaland.com)      — community help
   - Profiles            (nagalandprofiles.com)  — people & business directory
   - Dictionary          (nagalanddictionary.com) — Naga-language dictionary
   - News Today          (nagalandnewstoday.com) — local news
   Users switch services via a 9-dot "Apps" grid icon in the top header,
   which opens a bottom-sheet App Switcher (see screenshots).

## 2. NATIVE SCREENS (not just a browser shell)
   - Animated launch splash with brand mark
   - 5-screen onboarding tour (swipeable) on first run
   - Native top header with Home button + Apps grid switcher
   - Native bottom-sheet App Switcher modal with 7 service cards + 3 tools
   - Native Settings screen with notification channel toggles per category
   - Native Driver Mode (login + GPS trip controls — see §4)
   - Native Attendance screen for teachers (offline-capable, syncs later)
   - Native offline / error fallback with retry
   - Native ErrorBoundary that surfaces fatal errors in-app

## 3. PUSH NOTIFICATIONS (9 channels)
   Schools:  Daily Attendance (silent), Absent Alerts, Emergency, Holiday
   Experts:  Order Updates, Messages, Reviews
   News:     News Today headlines
   System:   App announcements
   Each channel has its own importance, sound and vibration profile.
   These cannot be replicated in Safari.  User toggles in Settings
   suppress channels client-side; emergency alerts are non-suppressible.

## 4. LIVE BUS TRACKING — USES BACKGROUND LOCATION
   - Authenticated school bus drivers log in and start a trip.
   - Background GPS sends a ping every 30 seconds while the trip is active.
   - Parents see their child's bus location in real time.
   - Background location is essential: drivers lock their phone while
     driving — if location stopped on lock, parents would lose tracking.
   - iOS shows the blue location indicator while tracking is active.
   - Only authorized drivers (server-side checked) can start tracking.

## 5. AI CHAT (not a generic ChatGPT wrapper)
   - State-level AI built specifically for Nagaland users
   - 20+ live news sources, weather for 16 districts
   - Naga-language dictionary (18+ tribes)
   - Professional profile directory
   - AI Teacher: Class 1 to PhD across 15+ subjects (NBSE / CBSE / ICSE)

## 6. EXPERTS MARKETPLACE
   - Marketplace for vetted Naga creator-services professionals
   - 8 categories (monetization, video editing, thumbnails, tax, audits)
   - KYC-verified experts with tier system
   - 3-tier pricing (Basic/Standard/Premium)
   - Razorpay payments in INR with escrow protection
   - Order tracking, reviews, in-app messaging

## 7. SCHOOL ATTENDANCE
   - Live attendance backed by real participating schools
   - Offline-first: teachers can mark attendance without internet, syncs
     automatically when back online
   - Push notifications to parents on arrival / absence / emergency
   - Conversational queries supported in AI Chat ("Did my child go to
     school today?")

## 8. BUSINESS CONTEXT
   - Developer: Nagaland Me (registered company, GST 13DIHPA5679B1ZK)
   - App brand: Nagaland AI
   - Address: Dimapur, Nagaland, India
   - YouTube: Aloto Naga TV (500K+ subscribers)
   - No existing alternative serves this market.

## TEST PATH FOR REVIEWER
   1. Install — splash → onboarding → AI Chat home.
   2. Tap the 9-dot grid icon (top right) → App Switcher opens.
   3. Tap any of the 7 service cards — site opens in WebView.
   4. Tap the home icon (top left) — returns to AI Chat.
   5. Open App Switcher → "Settings" — toggle notification categories.
   6. Open App Switcher → "Driver Mode" — login form (test creds below).
   7. Open App Switcher → "Attendance" — login + mark a test class.

   Test credentials
   - AI Chat / Experts / Help / Profiles / Dictionary / News:  no login
   - Student Mode: pick subject + grade on the AI Chat home page
   - Schools (parent code): contact info@nagalandai.com
   - Driver Mode (school account): contact info@nagalandai.com
   - Attendance (teacher account): contact info@nagalandai.com

   To verify live bus tracking, sign in with a Driver test account, tap
   "Start Trip", and grant Always Location. After a few seconds the
   GPS Pings counter increases — that confirms the background task is
   posting to the school backend.
