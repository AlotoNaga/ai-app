// ============================================================
// NAGALAND AI — UNIFIED APP CONSTANTS
// One app. 7 websites + Driver Mode + Account + Settings.
// Home: nagalandai.com (AI Chat)
// Switch via the 9-dot "Apps" grid icon in the header (Option A).
// ============================================================

export const APP_VERSION = '1.2.0';

export const COLORS = {
  primary: '#10B981',
  background: '#0F2419',
  backgroundLight: '#132D1F',
  card: '#1A3A2A',
  border: '#1a3a2a',
  textPrimary: '#FFFFFF',
  textSecondary: '#9CA3AF',
  textMuted: '#6B7280',
  inactive: '#6B7280',
  active: '#10B981',
  gold: '#D4A843',
  danger: '#EF4444',
  warning: '#F59E0B',
};

// ============================================================
// 7 WEBSITES — shown as cards in the Apps grid switcher
// `key`         stable identifier used in state + notification routes
// `name`        display label
// `tagline`     one-line description shown under the name in the switcher
// `icon`        Ionicons name
// `color`       accent colour for the icon tile
// `url`         URL the WebView opens
// `isHome`      true for the site that opens by default on app launch
// ============================================================
export const SITES = [
  {
    key: 'chat',
    name: 'AI Chat',
    tagline: 'Ask AI anything · powered by Nagaland Me',
    icon: 'chatbubble-ellipses',
    color: '#10B981',
    url: 'https://nagalandai.com',
    isHome: true,
  },
  {
    key: 'experts',
    name: 'Experts',
    tagline: 'Hire local experts & services',
    icon: 'people',
    color: '#D4A843',
    url: 'https://experts.nagaland.me',
  },
  {
    key: 'help',
    name: 'Help Nagaland',
    tagline: 'Community help & support',
    icon: 'help-buoy',
    color: '#F59E0B',
    url: 'https://helpnagaland.com',
  },
  {
    key: 'profiles',
    name: 'Profiles',
    tagline: 'People & business profiles',
    icon: 'person-add',
    color: '#8B5CF6',
    url: 'https://nagalandprofiles.com',
  },
  {
    key: 'dictionary',
    name: 'Dictionary',
    tagline: 'Naga words & meanings',
    icon: 'book',
    color: '#06B6D4',
    url: 'https://nagalanddictionary.com',
  },
  {
    key: 'news',
    name: 'News Today',
    tagline: 'Latest Nagaland news',
    icon: 'newspaper',
    color: '#EC4899',
    url: 'https://nagalandnewstoday.com',
  },
  {
    key: 'schools',
    name: 'Schools',
    tagline: 'School info & updates',
    icon: 'school',
    color: '#3B82F6',
    url: 'https://schools.nagalandai.com/',
  },
];

// Built-in tools shown below the 7 websites in the switcher
export const TOOLS = [
  {
    key: 'attendance',
    name: 'Attendance',
    tagline: 'Mark attendance offline · syncs later',
    icon: 'clipboard',
    color: '#10B981',
    special: 'attendance',
  },
  {
    key: 'driver',
    name: 'Driver Mode',
    tagline: 'School bus GPS tracking',
    icon: 'bus',
    color: '#EF4444',
    special: 'driver',
  },
  {
    key: 'account',
    name: 'My Account',
    tagline: 'Profile & subscriptions',
    icon: 'person-circle',
    color: '#9CA3AF',
    url: 'https://nagalandai.com/account/',
  },
  {
    key: 'settings',
    name: 'Settings',
    tagline: 'Notifications, privacy, about',
    icon: 'settings',
    color: '#9CA3AF',
    special: 'settings',
  },
];

export const SITE_BY_KEY = [...SITES, ...TOOLS].reduce((acc, s) => {
  acc[s.key] = s;
  return acc;
}, {});

export const HOME_KEY = 'chat';

// Legacy URL bag — kept for screens / services that still reference it
export const URLS = {
  chat: 'https://nagalandai.com',
  studentMode: 'https://nagalandai.com/#student-mode',
  experts: 'https://experts.nagaland.me',
  expertsBrowse: 'https://experts.nagaland.me/services/',
  schools: 'https://schools.nagalandai.com/',
  account: 'https://nagalandai.com/account/',
  privacy: 'https://nagalandai.com/privacy-policy/',
  terms: 'https://nagalandai.com/terms/',
  help: 'https://helpnagaland.com',
  profiles: 'https://nagalandprofiles.com',
  dictionary: 'https://nagalanddictionary.com',
  news: 'https://nagalandnewstoday.com',
  // Backend endpoints
  tokenRegister: 'https://nagalandai.com/wp-json/nai/v1/register-device',
};

// ============================================================
// ATTENDANCE — server contract (single source of truth)
//
// The mobile app talks to schools.nagalandai.com via WordPress's
// admin-ajax.php using cookie auth + a nonce. The four action names
// below MUST be registered server-side in the NAIS plugin (typically
// via add_action('wp_ajax_<name>', ...)). See SERVER_CONTRACT.md at
// the repo root for the full request/response spec.
//
// Status values accepted by the server: 'present', 'absent', 'late',
// 'excused'. The mobile UI currently surfaces only the first three
// (P / A / L); 'excused' is reserved for the web teacher dashboard.
//
// If the plugin uses different action names, change ONLY this block.
// Nothing else in the app hardcodes them.
// ============================================================
// Shared WordPress host that Driver Mode and Attendance both authenticate
// against. Splitting it out so the URLs live in exactly one place — drift
// between Driver and Attendance was a real bug.
export const SCHOOLS_WP = {
  origin:    'https://schools.nagalandai.com',
  loginUrl:  'https://schools.nagalandai.com/wp-login.php',
  logoutUrl: 'https://schools.nagalandai.com/wp-login.php?action=logout',
  ajaxUrl:   'https://schools.nagalandai.com/wp-admin/admin-ajax.php',
  adminUrl:  'https://schools.nagalandai.com/wp-admin/',
};

export const ATTENDANCE_API = {
  ...SCHOOLS_WP,
  // admin-ajax.php action names. POST x-www-form-urlencoded with
  // `action` + `nonce` + the per-endpoint fields documented in
  // SERVER_CONTRACT.md.
  actions: {
    getNonce:     'nais_get_nonce',                  // GET — returns { nonce }
    getMyClasses: 'nais_teacher_get_my_classes',     // POST — list classes + students + subjects
    submit:       'nais_teacher_submit_attendance',  // POST — batch submit (idempotent on client_id)
    todayStatus:  'nais_teacher_attendance_today',   // POST — prefill existing entries (optional)
  },
};

export const DRIVER_API = {
  ...SCHOOLS_WP,
  pingUrl: 'https://schools.nagalandai.com/wp-json/nais/v1/bus/ping',
  actions: {
    getNonce:   'nais_get_nonce',
    getMyBus:   'nais_driver_get_my_bus',
    startTrip:  'nais_driver_start_trip',
    endTrip:    'nais_driver_end_trip',
  },
};

// Domains that stay inside the WebView — everything else opens in the device browser
export const INTERNAL_DOMAINS = [
  'nagalandai.com',
  'www.nagalandai.com',
  'schools.nagalandai.com',
  'experts.nagaland.me',
  'nagaland.me',
  'helpnagaland.com',
  'www.helpnagaland.com',
  'nagalandprofiles.com',
  'www.nagalandprofiles.com',
  'nagalanddictionary.com',
  'www.nagalanddictionary.com',
  'nagalandnewstoday.com',
  'www.nagalandnewstoday.com',
];

export const NOTIFICATION_CHANNELS = {
  ATTENDANCE: 'attendance',
  ABSENT: 'absent',
  EMERGENCY: 'emergency',
  HOLIDAY: 'holiday',
  ORDERS: 'orders',
  MESSAGES: 'messages',
  REVIEWS: 'reviews',
  NEWS: 'news',
  SYSTEM: 'system',
};

export const STORAGE_KEYS = {
  ONBOARDING_COMPLETE: '@nai_onboarding_complete',
  PUSH_TOKEN: '@nai_push_token',
  USER_PREFERENCES: '@nai_user_preferences',
  TOKEN_REGISTERED: '@nai_token_registered',
  LAST_SITE: '@nai_last_site',
  DRIVER_SESSION: '@nai_driver_session',
  DRIVER_COOKIE: '@nai_driver_cookie',
  TRIP_ACTIVE: '@nai_trip_active',
  TRIP_ID: '@nai_trip_id',
  PING_COUNT: '@nai_ping_count',
  PING_QUEUE: '@nai_ping_queue',
  LAST_PING_ERROR: '@nai_last_ping_error',
  // Attendance — session blob (cookie + nonce + teacher info) lives in SecureStore
  TEACHER_SESSION: '@nai_teacher_session',
  TEACHER_LAST_CLASS: '@nai_teacher_last_class',
  TEACHER_LAST_SUBJECT: '@nai_teacher_last_subject',
};

export const LOCATION_TASK_NAME = 'nai-bus-gps-tracking';

export const APP_INFO = {
  name: 'Nagaland AI',
  version: APP_VERSION,
  developer: 'Nagaland Me',
  website: 'nagalandai.com',
  email: 'info@nagalandai.com',
  gst: '13DIHPA5679B1ZK',
  whatsapp: '+917085055505',
};
