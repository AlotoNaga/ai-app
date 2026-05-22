import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, StyleSheet, ScrollView, TouchableOpacity, TextInput,
  Alert, ActivityIndicator, AppState, Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Linking from 'expo-linking';
import { COLORS, URLS, STORAGE_KEYS } from '../config/constants';
import { getSecure, setSecure, deleteSecure } from '../services/secureStorage';
import {
  requestLocationPermissions, startGpsTracking, stopGpsTracking,
  isGpsTracking, getLastKnownLocation,
} from '../services/location';
import { wpLogin, fetchNonce } from '../services/wpAuth';

const S = {
  LOGIN: 'login', LOADING: 'loading', NOT_DRIVER: 'not_driver',
  READY: 'ready', STARTING: 'starting', TRACKING: 'tracking', STOPPING: 'stopping',
};

export default function DriverScreen() {
  const insets = useSafeAreaInsets();
  const [state, setState]         = useState(S.LOGIN);
  const [username, setUsername]   = useState('');
  const [password, setPassword]   = useState('');
  const [showPwd, setShowPwd]     = useState(false);
  const [loginError, setLoginError] = useState('');
  const [busInfo, setBusInfo]     = useState(null);
  const [cookie, setCookie]       = useState('');
  const [nonce, setNonce]         = useState('');
  const [tripId, setTripId]       = useState(null);
  const [pingCount, setPingCount] = useState(0);
  const [speed, setSpeed]         = useState(0);
  const [lastPing, setLastPing]   = useState(null);
  const timerRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => { checkSession(); }, []);

  useEffect(() => {
    if (state === S.TRACKING) {
      timerRef.current = setInterval(async () => {
        const c = await AsyncStorage.getItem(STORAGE_KEYS.PING_COUNT);
        setPingCount(parseInt(c || '0', 10));
        // Read cached last-known position instead of forcing a fresh GPS fix —
        // background tracking already feeds the cache every 30s; an extra 10s
        // fresh fix would double battery drain.
        const loc = await getLastKnownLocation();
        if (loc) setSpeed(Math.max(0, Math.round((loc.speed || 0) * 3.6)));
        setLastPing(new Date());
      }, 10000);
    }
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [state]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', async (next) => {
      const prev = appStateRef.current;
      const wasBackgrounded = prev === 'background' || prev === 'inactive';
      if (wasBackgrounded && next === 'active' && state === S.TRACKING) {
        if (!(await isGpsTracking())) {
          setState(S.READY);
          Alert.alert('Tracking Stopped', 'GPS was stopped by the system. Start the trip again.');
        }
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, [state]);

  const checkSession = async () => {
    try {
      const d = await getSecure(STORAGE_KEYS.DRIVER_SESSION);
      if (!d) return;
      const s = JSON.parse(d);
      if (!s.cookie || !s.busInfo) return;
      setCookie(s.cookie);
      setNonce(s.nonce || '');
      setBusInfo(s.busInfo);
      const active = await AsyncStorage.getItem(STORAGE_KEYS.TRIP_ACTIVE);
      const tid    = await AsyncStorage.getItem(STORAGE_KEYS.TRIP_ID);
      if (active === 'true' && tid && (await isGpsTracking())) {
        setTripId(tid); setState(S.TRACKING); return;
      }
      setState(S.READY);
    } catch {}
  };

  const callAjax = async (action, params = {}, c, n) => {
    const body = new URLSearchParams();
    body.append('action', action);
    if (n) body.append('nonce', n);
    Object.keys(params).forEach((k) => body.append(k, params[k]));
    const r = await fetch(URLS.busBase, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded', Cookie: c || cookie },
      body: body.toString(),
      credentials: 'include',
    });
    // WP returns HTML (not JSON) when the nonce has expired or the session is
    // invalid. Detect that explicitly so callers don't see a generic SyntaxError.
    if (!r.ok) {
      const err = new Error(`HTTP ${r.status}`);
      err.status = r.status;
      throw err;
    }
    const text = await r.text();
    try { return JSON.parse(text); }
    catch { throw new Error('Server returned non-JSON response (session may have expired)'); }
  };

  const handleLogin = async () => {
    if (!username.trim() || !password.trim()) {
      setLoginError('Enter username and password');
      return;
    }
    setLoginError('');
    setState(S.LOADING);
    try {
      // wpLogin() centralises the cookie-harvesting logic shared with
      // attendanceApi.js. Strict success requires the wordpress_logged_in
      // cookie — the role check via nais_driver_get_my_bus is the second gate.
      const result = await wpLogin({
        loginUrl: 'https://schools.nagalandai.com/wp-login.php',
        redirectTo: 'https://schools.nagalandai.com/wp-admin/',
        username: username.trim(),
        password,
      });

      if (!result.ok) {
        setState(S.LOGIN);
        setLoginError('Invalid username or password');
        return;
      }

      const ac = result.cookieHeader;
      setCookie(ac);

      const an = await fetchNonce({
        ajaxUrl: 'https://schools.nagalandai.com/wp-admin/admin-ajax.php',
        action: 'nais_get_nonce',
        cookieHeader: ac,
      });
      setNonce(an);

      let dr;
      try {
        dr = await callAjax('nais_driver_get_my_bus', {}, ac, an);
      } catch {
        setState(S.LOGIN);
        setLoginError('Could not verify your account. Try again.');
        return;
      }
      if (!dr.success) { setState(S.NOT_DRIVER); return; }

      const info = dr.data || {};
      const bi = {
        bus_number:  info.bus_number  || 'Unknown',
        route_name:  info.route_name  || 'Unknown Route',
        school_name: info.school_name || 'Unknown School',
        bus_id:      info.bus_id,
      };
      setBusInfo(bi);

      await setSecure(
        STORAGE_KEYS.DRIVER_SESSION,
        JSON.stringify({ cookie: ac, nonce: an, busInfo: bi }),
      );

      setState(S.READY);
    } catch {
      setState(S.LOGIN);
      setLoginError('Network error. Check your connection.');
    }
  };

  const handleStart = async () => {
    setState(S.STARTING);
    try {
      const perms = await requestLocationPermissions();
      if (!perms.granted) {
        Alert.alert(
          'Permission Required',
          perms.reason === 'background_denied'
            ? 'Allow "Always" location access in Settings for bus tracking.'
            : 'Location permission is required.',
          [
            { text: 'Cancel', onPress: () => setState(S.READY) },
            { text: 'Open Settings', onPress: () => { Linking.openSettings(); setState(S.READY); } },
          ],
        );
        return;
      }
      let r;
      try {
        r = await callAjax('nais_driver_start_trip', {}, cookie, nonce);
      } catch (e) {
        // Surface session-expiry / network errors with a useful message
        // instead of falling through to the generic outer catch.
        Alert.alert('Cannot Start', e.message || 'Server error. Try logging in again.');
        setState(S.READY);
        return;
      }
      if (!r.success) {
        Alert.alert('Cannot Start', r.data?.message || 'Server error.');
        setState(S.READY);
        return;
      }
      const tid = String(r.data?.trip_id || Date.now());
      setTripId(tid);
      await AsyncStorage.setItem(STORAGE_KEYS.TRIP_ID, tid);
      await AsyncStorage.setItem(STORAGE_KEYS.TRIP_ACTIVE, 'true');
      await setSecure(STORAGE_KEYS.DRIVER_COOKIE, cookie);
      if (!(await startGpsTracking())) {
        Alert.alert('GPS Error', 'Could not start tracking.');
        await AsyncStorage.multiRemove([STORAGE_KEYS.TRIP_ID, STORAGE_KEYS.TRIP_ACTIVE]);
        setState(S.READY);
        return;
      }
      setPingCount(0);
      setState(S.TRACKING);
    } catch {
      Alert.alert('Error', 'Could not start trip.');
      setState(S.READY);
    }
  };

  const handleEnd = () => {
    Alert.alert('End Trip', 'Stop GPS tracking?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'End Trip', style: 'destructive',
        onPress: async () => {
          setState(S.STOPPING);
          try {
            await stopGpsTracking();
            await callAjax('nais_driver_end_trip', { trip_id: tripId }, cookie, nonce);
          } catch {
            await stopGpsTracking();
          }
          await deleteSecure(STORAGE_KEYS.DRIVER_COOKIE);
          setTripId(null); setPingCount(0); setSpeed(0);
          setState(S.READY);
        },
      },
    ]);
  };

  const handleLogout = async () => {
    if (await isGpsTracking()) {
      Alert.alert('Trip Active', 'End the trip before logging out.');
      return;
    }
    await deleteSecure(STORAGE_KEYS.DRIVER_SESSION);
    await deleteSecure(STORAGE_KEYS.DRIVER_COOKIE);
    await AsyncStorage.multiRemove([
      STORAGE_KEYS.TRIP_ID, STORAGE_KEYS.TRIP_ACTIVE, STORAGE_KEYS.PING_COUNT,
    ]);
    setCookie(''); setNonce(''); setBusInfo(null); setTripId(null);
    setUsername(''); setPassword('');
    setState(S.LOGIN);
  };

  const ct = { paddingTop: insets.top + 16, paddingBottom: Math.max(insets.bottom, 20) + 20 };

  if (state === S.LOADING || state === S.STARTING || state === S.STOPPING) {
    return (
      <View style={[styles.c, styles.center, ct]}>
        <ActivityIndicator size="large" color={COLORS.primary} />
        <Text style={styles.lt}>
          {state === S.LOADING ? 'Verifying...' : state === S.STARTING ? 'Starting trip...' : 'Ending trip...'}
        </Text>
      </View>
    );
  }

  if (state === S.NOT_DRIVER) {
    return (
      <ScrollView style={styles.c} contentContainerStyle={[styles.center, ct]}>
        <View style={[styles.ic, { backgroundColor: 'rgba(239,68,68,0.08)' }]}>
          <Ionicons name="close-circle" size={48} color={COLORS.danger} />
        </View>
        <Text style={styles.h}>Not Authorized</Text>
        <Text style={styles.sub}>
          Your account is not assigned as a bus driver. Contact your school administrator.
        </Text>
        <TouchableOpacity style={styles.secBtn} onPress={handleLogout}>
          <Text style={styles.secBtnT}>Back to Login</Text>
        </TouchableOpacity>
      </ScrollView>
    );
  }

  if (state === S.LOGIN) {
    return (
      <ScrollView style={styles.c} contentContainerStyle={[styles.center, ct]} keyboardShouldPersistTaps="handled">
        <Text style={styles.st}>Driver Mode</Text>
        <View style={[styles.ic, { backgroundColor: 'rgba(16,185,129,0.08)' }]}>
          <Ionicons name="bus" size={48} color={COLORS.primary} />
        </View>
        <Text style={styles.h}>Bus Driver Login</Text>
        <Text style={styles.sub}>Log in with your school account to start bus tracking.</Text>
        <View style={styles.inp}>
          <Ionicons name="person-outline" size={18} color={COLORS.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={styles.ti} placeholder="Username" placeholderTextColor={COLORS.textMuted}
            value={username} onChangeText={setUsername} autoCapitalize="none" autoCorrect={false} returnKeyType="next"
          />
        </View>
        <View style={styles.inp}>
          <Ionicons name="lock-closed-outline" size={18} color={COLORS.textMuted} style={{ marginRight: 10 }} />
          <TextInput
            style={[styles.ti, { flex: 1 }]} placeholder="Password" placeholderTextColor={COLORS.textMuted}
            value={password} onChangeText={setPassword} secureTextEntry={!showPwd}
            autoCapitalize="none" returnKeyType="go" onSubmitEditing={handleLogin}
          />
          <TouchableOpacity onPress={() => setShowPwd(!showPwd)} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
            <Ionicons name={showPwd ? 'eye-off-outline' : 'eye-outline'} size={18} color={COLORS.textMuted} />
          </TouchableOpacity>
        </View>
        {loginError ? <Text style={styles.err}>{loginError}</Text> : null}
        <TouchableOpacity style={styles.priBtn} onPress={handleLogin} activeOpacity={0.7}>
          <Ionicons name="log-in-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.priBtnT}>Log In</Text>
        </TouchableOpacity>
        <Text style={styles.foot}>
          Only authorized bus drivers assigned by a school admin can use Driver Mode.
        </Text>
      </ScrollView>
    );
  }

  if (state === S.TRACKING) {
    return (
      <ScrollView style={styles.c} contentContainerStyle={[{ paddingHorizontal: 20 }, ct]}>
        <Text style={styles.st}>Driver Mode</Text>
        <View style={[styles.statusCard, { borderColor: COLORS.primary, backgroundColor: 'rgba(16,185,129,0.06)' }]}>
          <View style={styles.liveDot} />
          <Text style={[styles.statusT, { color: COLORS.primary }]}>TRIP ACTIVE — GPS TRACKING</Text>
        </View>
        <View style={styles.card}>
          <View style={styles.cardH}>
            <Ionicons name="bus" size={24} color={COLORS.primary} />
            <Text style={styles.cardT}>{busInfo?.bus_number || 'Bus'}</Text>
          </View>
          <View style={styles.ir}>
            <Text style={styles.il}>Route</Text>
            <Text style={styles.iv}>{busInfo?.route_name || '—'}</Text>
          </View>
        </View>
        <View style={styles.statsGrid}>
          <View style={styles.stat}><Text style={styles.statN}>{pingCount}</Text><Text style={styles.statL}>GPS Pings</Text></View>
          <View style={styles.stat}><Text style={styles.statN}>{speed}</Text><Text style={styles.statL}>km/h</Text></View>
        </View>
        {lastPing && <Text style={styles.lastPingT}>Last update: {lastPing.toLocaleTimeString()}</Text>}
        <TouchableOpacity style={styles.endBtn} onPress={handleEnd} activeOpacity={0.7}>
          <Ionicons name="stop-circle" size={24} color="#FFF" style={{ marginRight: 10 }} />
          <Text style={styles.endBtnT}>End Trip</Text>
        </TouchableOpacity>
        <Text style={styles.hint}>GPS continues in background. Parents are receiving live updates.</Text>
      </ScrollView>
    );
  }

  // READY
  return (
    <ScrollView style={styles.c} contentContainerStyle={[{ paddingHorizontal: 20 }, ct]}>
      <Text style={styles.st}>Driver Mode</Text>
      <View style={styles.card}>
        <View style={styles.cardH}>
          <Ionicons name="bus" size={24} color={COLORS.primary} />
          <Text style={styles.cardT}>Your Bus</Text>
        </View>
        <View style={styles.ir}><Text style={styles.il}>Bus Number</Text><Text style={styles.iv}>{busInfo?.bus_number || '—'}</Text></View>
        <View style={styles.sep} />
        <View style={styles.ir}><Text style={styles.il}>Route</Text><Text style={styles.iv}>{busInfo?.route_name || '—'}</Text></View>
        <View style={styles.sep} />
        <View style={styles.ir}><Text style={styles.il}>School</Text><Text style={styles.iv}>{busInfo?.school_name || '—'}</Text></View>
      </View>
      <View style={styles.statusCard}>
        <Ionicons name="radio-button-off" size={16} color={COLORS.textMuted} />
        <Text style={styles.statusT}>No active trip</Text>
      </View>
      <TouchableOpacity style={styles.startBtn} onPress={handleStart} activeOpacity={0.7}>
        <Ionicons name="navigate" size={24} color="#FFF" style={{ marginRight: 10 }} />
        <Text style={styles.startBtnT}>Start Trip</Text>
      </TouchableOpacity>
      <Text style={styles.hint}>
        GPS will be shared with parents every 30 seconds.{'\n'}Tracking continues when screen is locked.
      </Text>
      <TouchableOpacity style={styles.logoutBtn} onPress={handleLogout} activeOpacity={0.6}>
        <Ionicons name="log-out-outline" size={18} color={COLORS.textMuted} style={{ marginRight: 6 }} />
        <Text style={styles.logoutT}>Log Out</Text>
      </TouchableOpacity>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  center: { alignItems: 'center', paddingHorizontal: 20 },
  st: { fontSize: 28, fontWeight: '700', color: '#FFF', marginBottom: 24, alignSelf: 'flex-start' },
  ic: { width: 96, height: 96, borderRadius: 48, alignItems: 'center', justifyContent: 'center', marginBottom: 20 },
  h:  { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 8 },
  sub:{ fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 28, maxWidth: 300 },
  inp:{ flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.card, borderRadius: 12, paddingHorizontal: 14, marginBottom: 12, width: '100%', maxWidth: 340, borderWidth: 1, borderColor: COLORS.border },
  ti: { flex: 1, color: '#FFF', fontSize: 15, paddingVertical: Platform.OS === 'ios' ? 14 : 12 },
  err:{ color: COLORS.danger, fontSize: 13, marginBottom: 16 },
  priBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, paddingVertical: 14, paddingHorizontal: 32, borderRadius: 12, width: '100%', maxWidth: 340, marginTop: 8, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  priBtnT:{ color: '#FFF', fontSize: 16, fontWeight: '600' },
  secBtn:{ paddingVertical: 12, paddingHorizontal: 24, borderRadius: 12, borderWidth: 1, borderColor: COLORS.border },
  secBtnT:{ color: COLORS.textSecondary, fontSize: 15, fontWeight: '500' },
  foot:{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 24, lineHeight: 18, maxWidth: 300 },
  lt: { color: COLORS.textSecondary, fontSize: 15, marginTop: 16 },
  card:{ backgroundColor: COLORS.card, borderRadius: 14, padding: 16, width: '100%', marginBottom: 16, borderWidth: 1, borderColor: COLORS.border },
  cardH:{ flexDirection: 'row', alignItems: 'center', marginBottom: 14 },
  cardT:{ fontSize: 17, fontWeight: '600', color: '#FFF', marginLeft: 10 },
  ir: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 8 },
  il: { fontSize: 14, color: COLORS.textMuted },
  iv: { fontSize: 14, fontWeight: '600', color: '#FFF', maxWidth: '60%', textAlign: 'right' },
  sep:{ height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border },
  statusCard:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.card, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 16, marginBottom: 20, width: '100%', borderWidth: 1, borderColor: COLORS.border },
  statusT:{ fontSize: 13, fontWeight: '600', color: COLORS.textMuted, marginLeft: 8, letterSpacing: 0.5 },
  liveDot:{ width: 10, height: 10, borderRadius: 5, backgroundColor: COLORS.primary },
  statsGrid:{ flexDirection: 'row', width: '100%', gap: 12, marginBottom: 12 },
  stat:{ flex: 1, backgroundColor: COLORS.card, borderRadius: 12, paddingVertical: 18, alignItems: 'center', borderWidth: 1, borderColor: COLORS.border },
  statN:{ fontSize: 32, fontWeight: '700', color: '#FFF', marginBottom: 4 },
  statL:{ fontSize: 12, color: COLORS.textMuted },
  lastPingT:{ fontSize: 12, color: COLORS.textMuted, marginBottom: 20 },
  startBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.primary, paddingVertical: 16, borderRadius: 14, width: '100%', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  startBtnT:{ color: '#FFF', fontSize: 18, fontWeight: '700' },
  endBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', backgroundColor: COLORS.danger, paddingVertical: 16, borderRadius: 14, width: '100%', shadowColor: COLORS.danger, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  endBtnT:{ color: '#FFF', fontSize: 18, fontWeight: '700' },
  hint:{ fontSize: 12, color: COLORS.textMuted, textAlign: 'center', marginTop: 16, lineHeight: 18 },
  logoutBtn:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'center', marginTop: 32, paddingVertical: 10 },
  logoutT:{ fontSize: 14, color: COLORS.textMuted, fontWeight: '500' },
});
