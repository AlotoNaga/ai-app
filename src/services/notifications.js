import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import HmacSHA256 from 'crypto-js/hmac-sha256';
import HexEncoder from 'crypto-js/enc-hex';
import {
  getMessaging,
  getToken as fcmGetToken,
  registerDeviceForRemoteMessages,
  isDeviceRegisteredForRemoteMessages,
} from '@react-native-firebase/messaging';
import { NOTIFICATION_CHANNELS, STORAGE_KEYS, URLS, APP_VERSION } from '../config/constants';

// Firebase Messaging modular API (RNFB v22+). Reuse the single instance app-wide
// instead of calling getMessaging() on every API call.
const fbMessaging = getMessaging();

// Shared HMAC secret. Set per-build via app.json `extra.deviceTokenSecret`
// or via EAS env var passed through. NEVER commit a real secret.
const DEVICE_TOKEN_SECRET =
  Constants?.expoConfig?.extra?.deviceTokenSecret ||
  Constants?.manifest?.extra?.deviceTokenSecret ||
  '';

// Logged once at module load. Without a secret, every register-device call
// will be rejected by the backend with 401 'nai_unsigned' and silently fail
// after three retries — and the dev/QA tester would have no idea why pushes
// don't arrive. Surface it as a hard warning at startup instead.
if (!DEVICE_TOKEN_SECRET) {
  console.error(
    '[notifications] DEVICE_TOKEN_SECRET is empty. Push token registration ' +
    'will fail. Set it via EAS secrets and reference it in eas.json env.'
  );
}

function signRequest(timestamp, body) {
  if (!DEVICE_TOKEN_SECRET) return '';
  return HmacSHA256(`${timestamp}.${body}`, DEVICE_TOKEN_SECRET).toString(HexEncoder);
}

// ============================================================
// USER PREFERENCE LOOKUP — read once, cache in module scope, refresh on demand
// Each entry maps a notification channel to the AsyncStorage pref key that
// SettingsScreen toggles. Emergency is force-on and ignores user prefs.
// ============================================================
const PREF_KEY_BY_CHANNEL = {
  [NOTIFICATION_CHANNELS.ATTENDANCE]: 'attendance',
  [NOTIFICATION_CHANNELS.ABSENT]:     'absent',
  [NOTIFICATION_CHANNELS.HOLIDAY]:    'holiday',
  [NOTIFICATION_CHANNELS.ORDERS]:     'orders',
  [NOTIFICATION_CHANNELS.MESSAGES]:   'messages',
  [NOTIFICATION_CHANNELS.REVIEWS]:    'reviews',
  [NOTIFICATION_CHANNELS.NEWS]:       'news',
  // EMERGENCY and SYSTEM intentionally have no key — never user-suppressible.
};

let _prefsCache = null;

async function readPrefs() {
  if (_prefsCache) return _prefsCache;
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
    _prefsCache = raw ? JSON.parse(raw) : {};
  } catch {
    _prefsCache = {};
  }
  return _prefsCache;
}

// Settings screen calls this after a toggle so the next push picks up the change.
export function invalidatePrefsCache() { _prefsCache = null; }

async function isChannelEnabled(ch) {
  if (ch === NOTIFICATION_CHANNELS.EMERGENCY) return true;
  const key = PREF_KEY_BY_CHANNEL[ch];
  if (!key) return true; // SYSTEM and unknown channels — always show
  const prefs = await readPrefs();
  return prefs[key] !== false; // default ON when key absent
}

// ============================================================
// FOREGROUND HANDLER — checks user prefs before showing
// Returning suppressed flags hides the alert/sound but lets the data payload
// through so in-app routing still works (badge stays 0 too).
//
// Returns both old (shouldShowAlert) and new (shouldShowBanner / shouldShowList)
// flags so the same code works on Expo SDK 52 and 53+.
// ============================================================
const showAll = (extra) => ({
  shouldShowAlert: true, shouldShowBanner: true, shouldShowList: true,
  shouldPlaySound: true, shouldSetBadge: true, ...extra,
});
const hideAll = {
  shouldShowAlert: false, shouldShowBanner: false, shouldShowList: false,
  shouldPlaySound: false, shouldSetBadge: false,
};
const badgeOnly = {
  shouldShowAlert: false, shouldShowBanner: false, shouldShowList: false,
  shouldPlaySound: false, shouldSetBadge: true,
};

Notifications.setNotificationHandler({
  handleNotification: async (notification) => {
    const ch = notification.request.content.data?.channel || NOTIFICATION_CHANNELS.SYSTEM;
    const enabled = await isChannelEnabled(ch);

    if (!enabled) return hideAll;
    if (ch === NOTIFICATION_CHANNELS.EMERGENCY) {
      return showAll({ priority: Notifications.AndroidNotificationPriority.MAX });
    }
    // Silent badge-only — daily presence ping
    if (ch === NOTIFICATION_CHANNELS.ATTENDANCE) return badgeOnly;
    if ([
      NOTIFICATION_CHANNELS.ABSENT,
      NOTIFICATION_CHANNELS.ORDERS,
      NOTIFICATION_CHANNELS.MESSAGES,
    ].includes(ch)) {
      return showAll();
    }
    return showAll({ shouldPlaySound: false });
  },
});

// ============================================================
// ANDROID CHANNELS — the file basenames here MUST match real raw resources
// shipped via the expo-notifications plugin in app.json.
// ============================================================
export async function setupNotificationChannels() {
  if (Platform.OS !== 'android') return;

  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.ATTENDANCE, {
    name: 'Daily Attendance', description: 'Silent daily attendance status',
    importance: Notifications.AndroidImportance.LOW, sound: null, showBadge: true, lightColor: '#10B981',
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.ABSENT, {
    name: 'Absent Alerts', description: 'Child marked absent',
    importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250],
    sound: 'absent_alert.wav', showBadge: true, lightColor: '#EF4444',
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.EMERGENCY, {
    name: 'Emergency Alerts', description: 'School emergencies',
    importance: Notifications.AndroidImportance.MAX, vibrationPattern: [0, 500, 200, 500, 200, 500],
    sound: 'emergency_alarm.wav', showBadge: true, bypassDnd: true, lightColor: '#EF4444',
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.HOLIDAY, {
    name: 'Holiday Announcements', description: 'School holidays',
    importance: Notifications.AndroidImportance.DEFAULT, sound: 'holiday_chime.wav',
    showBadge: true, lightColor: '#D4A843',
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.ORDERS, {
    name: 'Order Updates', description: 'New orders, deliveries, completions',
    importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 250, 250, 250],
    sound: 'order_received.wav', showBadge: true, lightColor: '#10B981',
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.MESSAGES, {
    name: 'Messages', description: 'Buyer and expert messages',
    importance: Notifications.AndroidImportance.HIGH, vibrationPattern: [0, 200, 100, 200],
    showBadge: true, lightColor: '#D4A843',
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.REVIEWS, {
    name: 'Reviews', description: 'New reviews on services',
    importance: Notifications.AndroidImportance.DEFAULT, showBadge: true, lightColor: '#F59E0B',
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.NEWS, {
    name: 'News', description: 'Latest Nagaland news headlines',
    importance: Notifications.AndroidImportance.DEFAULT, showBadge: true, lightColor: '#EC4899',
  });
  await Notifications.setNotificationChannelAsync(NOTIFICATION_CHANNELS.SYSTEM, {
    name: 'System', description: 'App updates and announcements',
    importance: Notifications.AndroidImportance.DEFAULT, showBadge: true, lightColor: '#10B981',
  });
}

// ============================================================
// PUSH TOKEN REGISTRATION
//
// Both platforms register an FCM token with the backend so the server has
// a single transport (FCM HTTP v1) for everything. iOS uses
// @react-native-firebase/messaging to pair the device's APNs token with
// an FCM registration token; FCM then relays each push to APNs at send
// time, so iPhones still receive notifications via Apple's normal
// delivery path. Android uses expo-notifications' bundled
// firebase-messaging implementation, which already returns an FCM token.
//
// This is required because the backend (nai_send_push) explicitly skips
// raw APNs tokens — without an FCM token on iOS, iPhone users receive
// nothing at all.
// ============================================================
async function getNativePushToken() {
  if (Platform.OS === 'ios') {
    // iOS: pair APNs token with an FCM token via Firebase Messaging.
    // registerDeviceForRemoteMessages() is a no-op if already registered;
    // calling it before getToken() guarantees Firebase has the APNs token
    // it needs to mint an FCM token.
    if (!isDeviceRegisteredForRemoteMessages(fbMessaging)) {
      await registerDeviceForRemoteMessages(fbMessaging);
    }
    const fcmToken = await fcmGetToken(fbMessaging);
    if (!fcmToken) {
      throw new Error('Firebase Messaging returned an empty token on iOS');
    }
    return { data: fcmToken, type: 'fcm' };
  }
  // Android: expo-notifications already wraps firebase-messaging.
  const t = await Notifications.getDevicePushTokenAsync();
  return { data: t.data, type: t.type || 'fcm' };
}

export async function registerForPushNotifications() {
  if (!Device.isDevice) return null;

  const { status: existing } = await Notifications.getPermissionsAsync();
  let finalStatus = existing;
  if (existing !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync({
      ios: { allowAlert: true, allowBadge: true, allowSound: true },
    });
    finalStatus = status;
  }
  if (finalStatus !== 'granted') return null;

  try {
    const tokenData = await getNativePushToken();
    // Mark TOKEN_REGISTERED false up front so a backend failure here is
    // visible to refreshTokenIfNeeded() on the next foreground event.
    await AsyncStorage.setItem(STORAGE_KEYS.PUSH_TOKEN, tokenData.data);
    await AsyncStorage.setItem(STORAGE_KEYS.TOKEN_REGISTERED, 'false');
    await sendTokenToBackend(tokenData.data, tokenData.type);
    return tokenData.data;
  } catch (e) {
    console.warn('Push token error:', e?.message || e);
    return null;
  }
}

async function sendTokenToBackend(token, tokenType, attempt = 1) {
  // Without a shared secret the backend will reject every request with 401.
  // Bail before burning three retries on an unrecoverable misconfiguration.
  if (!DEVICE_TOKEN_SECRET) return false;
  const canonicalType = tokenType || (Platform.OS === 'ios' ? 'apns' : 'fcm');
  const body = JSON.stringify({
    token,
    token_type: canonicalType,
    platform: Platform.OS,
    device_model: Device.modelName || 'unknown',
    os_version: Device.osVersion || 'unknown',
    app_version: APP_VERSION,
  });
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = signRequest(timestamp, body);

  try {
    const resp = await fetch(URLS.tokenRegister, {
      method: 'POST',
      headers: {
        'Content-Type':    'application/json',
        'X-App-Version':   APP_VERSION,
        'X-App-Platform':  Platform.OS,
        'X-Token-Type':    canonicalType,
        'X-NAI-Timestamp': String(timestamp),
        'X-NAI-Signature': signature,
      },
      body,
    });
    if (resp.ok) {
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN_REGISTERED, 'true');
      return true;
    }
    // 401/403 → bad signature or stale clock; retrying won't help.
    if (resp.status === 401 || resp.status === 403) {
      console.warn('Push token register rejected:', resp.status);
      return false;
    }
    console.warn('Push token register attempt', attempt, 'failed:', resp.status);
  } catch (e) {
    console.warn('Push token register attempt', attempt, 'network error:', e?.message || e);
  }
  if (attempt < 3) {
    await new Promise((r) => setTimeout(r, 2000 * attempt));
    return sendTokenToBackend(token, tokenType, attempt + 1);
  }
  return false;
}

// ============================================================
// NOTIFICATION ROUTING — maps channel to a site key in SITES/TOOLS.
// Backend can also override by setting data.site = 'help' | 'news' | etc.
// ============================================================
export function getNotificationRoute(notification) {
  const data = notification?.request?.content?.data || {};
  if (typeof data.site === 'string' && data.site.length) return data.site;
  const ch = data.channel || '';
  switch (ch) {
    case NOTIFICATION_CHANNELS.ATTENDANCE:
    case NOTIFICATION_CHANNELS.ABSENT:
    case NOTIFICATION_CHANNELS.EMERGENCY:
      return 'schools';
    case NOTIFICATION_CHANNELS.ORDERS:
    case NOTIFICATION_CHANNELS.MESSAGES:
    case NOTIFICATION_CHANNELS.REVIEWS:
      return 'experts';
    case NOTIFICATION_CHANNELS.NEWS:
      return 'news';
    case NOTIFICATION_CHANNELS.HOLIDAY:
    default:
      return 'chat';
  }
}

export async function clearBadge() {
  try { await Notifications.setBadgeCountAsync(0); } catch {}
}

export async function refreshTokenIfNeeded() {
  if (!Device.isDevice) return;
  const { status } = await Notifications.getPermissionsAsync();
  if (status !== 'granted') return;
  try {
    const tokenData = await getNativePushToken();
    const stored = await AsyncStorage.getItem(STORAGE_KEYS.PUSH_TOKEN);
    const registered = await AsyncStorage.getItem(STORAGE_KEYS.TOKEN_REGISTERED);

    if (tokenData.data !== stored) {
      // Token rotated — persist new value and (re)register with backend.
      await AsyncStorage.setItem(STORAGE_KEYS.PUSH_TOKEN, tokenData.data);
      await AsyncStorage.setItem(STORAGE_KEYS.TOKEN_REGISTERED, 'false');
      await sendTokenToBackend(tokenData.data, tokenData.type);
    } else if (registered !== 'true') {
      // Token unchanged but a previous backend registration never confirmed.
      // Without this, a transient outage on first run could silently disable
      // pushes for this device until the OS rotates the token.
      await sendTokenToBackend(tokenData.data, tokenData.type);
    }
  } catch (e) {
    console.warn('refreshTokenIfNeeded error:', e?.message || e);
  }
}
