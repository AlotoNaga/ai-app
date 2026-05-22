import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { reportError } from './crashReporter';

// expo-secure-store keys must match /^[A-Za-z0-9._\-]+$/, so we strip
// any leading '@' from STORAGE_KEYS values before using them as keys.
function safeKey(k) {
  return String(k).replace(/^@/, '');
}

// SecureStore is iOS Keychain / Android EncryptedSharedPreferences. Use for
// cookies, session blobs, refresh tokens — anything sensitive. On the
// vanishingly rare device where SecureStore is unavailable (broken keychain,
// stripped Android variant) we fall back to plaintext AsyncStorage so the
// app stays usable, but we surface the event to the crash reporter so a real
// production failure mode is visible — release builds strip console.warn so
// the previous fallback was effectively silent.
function noteFallback(op, key, err) {
  reportError(err instanceof Error ? err : new Error(String(err)), {
    source: 'secureStorage',
    operation: op,
    // Do NOT include the value — it's sensitive. The key alone is enough to
    // identify which subsystem (driver / teacher / push token) is affected.
    key: String(key),
  });
}

export async function setSecure(key, value) {
  const k = safeKey(key);
  try {
    if (SecureStore?.setItemAsync) {
      await SecureStore.setItemAsync(k, value, {
        keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
      });
      return;
    }
  } catch (e) {
    noteFallback('set', key, e);
  }
  await AsyncStorage.setItem(key, value);
}

export async function getSecure(key) {
  const k = safeKey(key);
  try {
    if (SecureStore?.getItemAsync) {
      const v = await SecureStore.getItemAsync(k);
      if (v != null) return v;
    }
  } catch (e) {
    noteFallback('get', key, e);
  }
  return AsyncStorage.getItem(key);
}

export async function deleteSecure(key) {
  const k = safeKey(key);
  try { if (SecureStore?.deleteItemAsync) await SecureStore.deleteItemAsync(k); }
  catch (e) { noteFallback('delete', key, e); }
  try { await AsyncStorage.removeItem(key); }
  catch (e) { noteFallback('delete-fallback', key, e); }
}
