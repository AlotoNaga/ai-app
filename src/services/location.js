import * as Location from 'expo-location';
import * as TaskManager from 'expo-task-manager';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSecure } from './secureStorage';
import { LOCATION_TASK_NAME, DRIVER_API, STORAGE_KEYS, APP_VERSION } from '../config/constants';

// Cap the offline ping queue so a long dead-zone trip can't grow it
// unbounded. 20 entries at the 30s ping cadence ≈ 10 minutes of buffered
// driving; older points are dropped (FIFO) — fine for live tracking, the
// goal is "what's happening now" not a perfect breadcrumb log.
const PING_QUEUE_CAP = 20;

// Compact serialization keeps the AsyncStorage write small. Order matches
// the JSON the server expects.
function pingPayload(tripId, loc) {
  return {
    trip_id: tripId,
    latitude: loc.coords.latitude,
    longitude: loc.coords.longitude,
    speed: Math.max(0, Math.round((loc.coords.speed || 0) * 3.6)),
    accuracy: Math.round(loc.coords.accuracy || 0),
    heading: Math.round(loc.coords.heading || 0),
    timestamp: Math.round(loc.timestamp / 1000),
  };
}

async function postPing(headers, body) {
  return fetch(DRIVER_API.pingUrl, { method: 'POST', headers, body: JSON.stringify(body) });
}

async function readQueue() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PING_QUEUE);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch {
    return [];
  }
}

async function writeQueue(queue) {
  // Trim from the front (oldest) so a stuck connection never grows storage.
  const trimmed = queue.length > PING_QUEUE_CAP ? queue.slice(queue.length - PING_QUEUE_CAP) : queue;
  await AsyncStorage.setItem(STORAGE_KEYS.PING_QUEUE, JSON.stringify(trimmed));
}

async function bumpSuccessCount(by) {
  if (by <= 0) return;
  const count = parseInt((await AsyncStorage.getItem(STORAGE_KEYS.PING_COUNT)) || '0', 10);
  await AsyncStorage.setItem(STORAGE_KEYS.PING_COUNT, String(count + by));
}

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

    const fresh = pingPayload(tripId, loc);
    let freshOk = false;
    try {
      const resp = await postPing(headers, fresh);
      if (resp.ok) {
        freshOk = true;
        await AsyncStorage.removeItem(STORAGE_KEYS.LAST_PING_ERROR);
      } else {
        await AsyncStorage.setItem(STORAGE_KEYS.LAST_PING_ERROR, `http_${resp.status}`);
      }
    } catch (e) {
      await AsyncStorage.setItem(STORAGE_KEYS.LAST_PING_ERROR, `network_${e?.message || 'unknown'}`).catch(() => {});
    }

    if (!freshOk) {
      // Network or server-rejected — buffer this ping so a brief dead zone
      // doesn't lose data. Parents can still see the rear of the trace once
      // connectivity returns.
      const q = await readQueue();
      q.push(fresh);
      await writeQueue(q);
      await bumpSuccessCount(0);
      return;
    }

    // Fresh ping succeeded — try draining the queue (oldest first). Bounded
    // to the buffered count so a flaky network doesn't hold up the next
    // background tick.
    let drained = 0;
    const q = await readQueue();
    while (q.length) {
      try {
        const r = await postPing(headers, q[0]);
        if (!r.ok) break;
        q.shift();
        drained += 1;
      } catch {
        break;
      }
    }
    if (drained > 0) await writeQueue(q);
    await bumpSuccessCount(1 + drained);
  } catch (e) {
    await AsyncStorage.setItem(STORAGE_KEYS.LAST_PING_ERROR, `task_${e?.message || 'unknown'}`).catch(() => {});
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
    await AsyncStorage.multiSet([
      [STORAGE_KEYS.PING_COUNT, '0'],
      [STORAGE_KEYS.PING_QUEUE, '[]'],
    ]);
    return true;
  } catch { return false; }
}

export async function stopGpsTracking() {
  try {
    const isTracking = await Location.hasStartedLocationUpdatesAsync(LOCATION_TASK_NAME).catch(() => false);
    if (isTracking) await Location.stopLocationUpdatesAsync(LOCATION_TASK_NAME);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.TRIP_ID,
      STORAGE_KEYS.TRIP_ACTIVE,
      STORAGE_KEYS.PING_COUNT,
      STORAGE_KEYS.PING_QUEUE,
    ]);
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

// Read the current queue depth — surfaced in DriverScreen so the driver can
// see when pings are buffered (dead zone) versus flowing.
export async function getQueuedPingCount() {
  try {
    const raw = await AsyncStorage.getItem(STORAGE_KEYS.PING_QUEUE);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr.length : 0;
  } catch {
    return 0;
  }
}
