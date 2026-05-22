import * as SecureStore from 'expo-secure-store';
import AsyncStorage from '@react-native-async-storage/async-storage';

// expo-secure-store keys must match /^[A-Za-z0-9._\-]+$/, so we strip
// any leading '@' from STORAGE_KEYS values before using them as keys.
function safeKey(k) {
  return String(k).replace(/^@/, '');
}

// SecureStore is iOS Keychain / Android EncryptedSharedPreferences. Use
// for cookies, session blobs, refresh tokens — anything sensitive. Falls
// back to AsyncStorage on platforms or builds where SecureStore isn't
// available (this is rare but the fallback keeps the app usable).
//
// The fallback writes to plaintext AsyncStorage. We log a clear warning
// when that happens so a broken keychain on a tester's device is at least
// visible in the JS console rather than silently leaking auth cookies.
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
    console.warn('[secureStorage] SecureStore.setItemAsync failed for', key, '— falling back to plaintext AsyncStorage:', e?.message || e);
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
    console.warn('[secureStorage] SecureStore.getItemAsync failed for', key, '— falling back to plaintext AsyncStorage:', e?.message || e);
  }
  return AsyncStorage.getItem(key);
}

export async function deleteSecure(key) {
  const k = safeKey(key);
  try { if (SecureStore?.deleteItemAsync) await SecureStore.deleteItemAsync(k); } catch {}
  try { await AsyncStorage.removeItem(key); } catch {}
}
