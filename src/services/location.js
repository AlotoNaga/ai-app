import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecure } from './secureStorage';
import { LOCATION_TASK_NAME, DRIVER_API, STORAGE_KEYS, APP_VERSION } from '../config/constants';

// Background task — runs even when app is backgrounded
TaskManager.defineTask(LOCATION_TASK_NAME, async ({ data, error }) => {
  if (error || !data) return;
  const { locations } = data;
  if (!locations || !locations.length) return;
  const loc = locations[locations.length - 1];

  try {
    const tripId = await AsyncStorage.getItem(STORAGE_KEYS.TRIP_ID);
    const cookie = await getSecure(STORAGE_KEYS.DRIVER_COOKIE);
    if (!tripId) return;

    const headers = { 'Content-Type': 'application/json', 'X-App-Version': APP_VERSION };
    if (cookie) headers['Cookie'] = cookie;

    const resp = await fetch(DRIVER_API.pingUrl, {
      method: 'POST', headers,
      body: JSON.stringify({
        trip_id: tripId,
        latitude: loc.coords.latitude,
        longitude: loc.coords.longitude,
        speed: Math.max(0, Math.round((loc.coords.speed || 0) * 3.6)),
        accuracy: Math.round(loc.coords.accuracy || 0),
        heading: Math.round(loc.coords.heading || 0),
        timestamp: Math.round(loc.timestamp / 1000),
      }),
    });

    // Counter must reflect successful backend writes only — otherwise the
    // Driver Mode UI shows healthy pings while the server is rejecting them.
    if (resp.ok) {
      const count = parseInt((await AsyncStorage.getItem(STORAGE_KEYS.PING_COUNT)) || '0', 10);
      await AsyncStorage.setItem(STORAGE_KEYS.PING_COUNT, String(count + 1));
      await AsyncStorage.removeItem(STORAGE_KEYS.LAST_PING_ERROR);
    } else {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_PING_ERROR, `http_${resp.status}`);
      console.warn('GPS ping rejected:', resp.status);
    }
  } catch (e) {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_PING_ERROR, `network_${e?.message || 'unknown'}`).catch(() => {});
    console.error('GPS ping error:', e.message);
  }
});

export async function requestLocationPermissions() {
  const { status: fg } = await Location.requestForegroundPermissionsAsync();
  if (fg !== 'granted') return { granted: false, reason: 'foreground_denied' };
  const { status: bg } = await Location.requestBackgroundPermissionsAsync();
  if (bg !== 'granted') return { granted: false, reason: 'background_denied' };
  return { granted: true };
}

export async function startGpsTracking() {
  const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
  if (isTracking) return true;
  try {
    await Location.startLocationUpdatesAsync(LOCATION_TASK_NAME, {
      accuracy: Location.Accuracy.BestForNavigation, timeInterval: 30000, distanceInterval: 20,
      showsBackgroundLocationIndicator: true,
      foregroundService: { notificationTitle: 'Nagaland AI — Bus Tracking', notificationBody: 'Sharing your bus location with parents', notificationColor: '#10B981' },
      pausesUpdatesAutomatically: false, activityType: Location.ActivityType.AutomotiveNavigation,
    });
    await AsyncStorage.setItem(STORAGE_KEYS.PING_COUNT, '0');
    return true;
  } catch { return false; }
}

export async function stopGpsTracking() {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
    if (isTracking) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    await AsyncStorage.multiRemove([STORAGE_KEYS.TRIP_ID, STORAGE_KEYS.TRIP_ACTIVE, STORAGE_KEYS.PING_COUNT]);
    return true;
  } catch { return false; }
}

export async function isGpsTracking() {
  try { return await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME); } catch { return false; }
}

export async function getCurrentLocation() {
  try {
    const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, speed: loc.coords.speed, accuracy: loc.coords.accuracy };
  } catch { return null; }
}

// Cheap, cached read — does NOT power on the GPS chip. Prefer this for periodic
// UI refresh when a background task is already pulling fresh fixes.
export async function getLastKnownLocation() {
  try {
    const loc = await Location.getLastKnownPositionAsync({ maxAge: 60000 });
    if (!loc) return null;
    return { latitude: loc.coords.latitude, longitude: loc.coords.longitude, speed: loc.coords.speed, accuracy: loc.coords.accuracy };
  } catch { return null; }
}
