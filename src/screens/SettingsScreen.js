import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, AppState } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, APP_INFO, URLS, STORAGE_KEYS, SITES } from '../config/constants';
import { invalidatePrefsCache } from '../services/notifications';

// All notification categories default ON — user opts out, not in.
const DEFAULT_PREFS = {
  attendance: true, absent: true, holiday: true,
  orders: true, messages: true, reviews: true, news: true,
};

// Icons / accents used in the "Our Websites" links list. Keyed by SITES.key
// so adding a new site in constants.js automatically gets a sensible label
// and only the icon / colour need to be added here.
const SITE_LINK_META = {
  chat:       { icon: 'chatbubble-ellipses-outline', color: COLORS.primary, suffix: ' — nagalandai.com' },
  experts:    { icon: 'storefront-outline',          color: COLORS.gold },
  help:       { icon: 'help-buoy-outline',           color: '#F59E0B' },
  profiles:   { icon: 'person-add-outline',          color: '#8B5CF6' },
  dictionary: { icon: 'book-outline',                color: '#06B6D4' },
  news:       { icon: 'newspaper-outline',           color: '#EC4899' },
  schools:    { icon: 'school-outline',              color: '#3B82F6' },
};

function Row({ icon, iconColor, label, right }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={iconColor} style={{ marginRight: 12 }} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      {right}
    </View>
  );
}

function LinkRow({ icon, iconColor, label, onPress }) {
  return (
    <TouchableOpacity style={styles.row} onPress={onPress} activeOpacity={0.6}>
      <View style={styles.rowLeft}>
        <Ionicons name={icon} size={20} color={iconColor} style={{ marginRight: 12 }} />
        <Text style={styles.rowLabel}>{label}</Text>
      </View>
      <Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} />
    </TouchableOpacity>
  );
}

function Toggle({ value, onValueChange, color, disabled }) {
  return (
    <Switch
      value={value}
      onValueChange={onValueChange}
      trackColor={{ false: '#3e3e3e', true: color }}
      thumbColor="#FFF"
      ios_backgroundColor="#3e3e3e"
      disabled={disabled}
    />
  );
}

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [notifsOn, setNotifsOn] = useState(true);
  const [prefs, setPrefs] = useState(DEFAULT_PREFS);

  // Serialise prefs writes so two fast toggles can't lose updates via
  // read-modify-write race.
  const writeChain = useRef(Promise.resolve());

  const loadPrefs = useCallback(async () => {
    try {
      const raw = await AsyncStorage.getItem(STORAGE_KEYS.USER_PREFERENCES);
      if (!raw) return;
      const parsed = JSON.parse(raw);
      // Defensive merge — only accept known boolean keys from disk so a
      // corrupted blob can't inject unexpected state into the UI.
      const clean = {};
      for (const k of Object.keys(DEFAULT_PREFS)) {
        if (typeof parsed?.[k] === 'boolean') clean[k] = parsed[k];
      }
      setPrefs((prev) => ({ ...prev, ...clean }));
    } catch {
      // Corrupt JSON — fall back to defaults silently.
    }
  }, []);

  const refreshPermissionState = useCallback(async () => {
    const { status } = await Notifications.getPermissionsAsync();
    setNotifsOn(status === 'granted');
  }, []);

  useEffect(() => {
    loadPrefs();
    refreshPermissionState();
  }, [loadPrefs, refreshPermissionState]);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      if (next === 'active') refreshPermissionState();
    });
    return () => sub.remove();
  }, [refreshPermissionState]);

  // Apply the toggle to local state and persist the resulting object as a
  // whole. Building from latest local state (not re-reading disk) plus
  // chaining writes guarantees no toggle is dropped.
  const setPref = useCallback((key, value) => {
    setPrefs((prev) => {
      const next = { ...prev, [key]: value };
      writeChain.current = writeChain.current.then(async () => {
        try {
          await AsyncStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(next));
          invalidatePrefsCache();
        } catch {}
      });
      return next;
    });
  }, []);

  const toggleMasterPush = useCallback(async (next) => {
    if (next) {
      const { status } = await Notifications.requestPermissionsAsync();
      if (status === 'granted') {
        setNotifsOn(true);
      } else {
        Alert.alert(
          'Allow notifications in iOS Settings',
          'Push permission was denied. Open Settings to allow it, then return to the app.',
          [
            { text: 'Cancel' },
            { text: 'Open Settings', onPress: () => Linking.openSettings() },
          ],
        );
        // No state change — Switch stays off because notifsOn never updated.
      }
      return;
    }
    // Switch was flipped OFF. iOS does not expose an API to revoke
    // permission from inside the app, so the toggle would otherwise
    // appear to do nothing. Snap it back to ON and route the user to
    // device settings.
    setNotifsOn(true);
    Alert.alert(
      'Disable in iOS Settings',
      "iOS doesn't let apps turn off notifications themselves. Open Settings → Notifications → Nagaland AI to disable them there.",
      [
        { text: 'Cancel' },
        { text: 'Open Settings', onPress: () => Linking.openSettings() },
      ],
    );
  }, []);

  const resetPreferences = useCallback(() => {
    Alert.alert(
      'Reset Notification Preferences',
      'Re-enable every notification category? Push permission and other app state stay as-is.',
      [
        { text: 'Cancel' },
        {
          text: 'Reset',
          style: 'destructive',
          onPress: async () => {
            try {
              await AsyncStorage.removeItem(STORAGE_KEYS.USER_PREFERENCES);
            } catch (e) {
              Alert.alert('Could not reset', e?.message || 'Storage write failed.');
              return;
            }
            // The notifications module caches the prefs object at module
            // scope; without this the next incoming push is still filtered
            // against the pre-reset values until app restart.
            invalidatePrefsCache();
            setPrefs(DEFAULT_PREFS);
            Alert.alert('Done', 'Notification preferences reset.');
          },
        },
      ],
    );
  }, []);

  const websiteLinks = SITES
    .map((site) => {
      const meta = SITE_LINK_META[site.key];
      if (!meta || !site.url) return null;
      return { key: site.key, url: site.url, label: `${site.name}${meta.suffix || ''}`, icon: meta.icon, color: meta.color };
    })
    .filter(Boolean);

  return (
    <ScrollView style={styles.container} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 20 }}>
      <View style={styles.header}>
        <View style={styles.appIcon}><Text style={styles.appIconText}>AI</Text></View>
        <Text style={styles.appName}>{APP_INFO.name}</Text>
        <Text style={styles.appVersion}>Version {APP_INFO.version}</Text>
      </View>

      <Text style={styles.section}>School Notifications</Text>
      <View style={styles.sectionCard}>
        <Row icon="notifications" iconColor={COLORS.primary} label="Push Notifications"
          right={<Toggle value={notifsOn} onValueChange={toggleMasterPush} color={COLORS.primary} />} />
        <View style={styles.sep} />
        <Row icon="checkmark-circle" iconColor={COLORS.primary} label="Daily Attendance"
          right={<Toggle value={prefs.attendance} onValueChange={(v) => setPref('attendance', v)} color={COLORS.primary} disabled={!notifsOn} />} />
        <View style={styles.sep} />
        <Row icon="alert-circle" iconColor={COLORS.danger} label="Absent Alerts"
          right={<Toggle value={prefs.absent} onValueChange={(v) => setPref('absent', v)} color={COLORS.danger} disabled={!notifsOn} />} />
        <View style={styles.sep} />
        <Row icon="sunny" iconColor={COLORS.gold} label="Holiday Announcements"
          right={<Toggle value={prefs.holiday} onValueChange={(v) => setPref('holiday', v)} color={COLORS.gold} disabled={!notifsOn} />} />
        <View style={styles.sep} />
        {/* Emergency alerts cannot be disabled — school-safety requirement. */}
        <Row icon="warning" iconColor={COLORS.warning} label="Emergency Alerts"
          right={<Text style={{ color: COLORS.warning, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>ALWAYS ON</Text>} />
      </View>

      <Text style={styles.section}>Experts Notifications</Text>
      <View style={styles.sectionCard}>
        <Row icon="cart" iconColor={COLORS.primary} label="Order Updates"
          right={<Toggle value={prefs.orders} onValueChange={(v) => setPref('orders', v)} color={COLORS.primary} disabled={!notifsOn} />} />
        <View style={styles.sep} />
        <Row icon="chatbubble-ellipses" iconColor={COLORS.gold} label="Messages"
          right={<Toggle value={prefs.messages} onValueChange={(v) => setPref('messages', v)} color={COLORS.gold} disabled={!notifsOn} />} />
        <View style={styles.sep} />
        <Row icon="star" iconColor={COLORS.warning} label="Reviews"
          right={<Toggle value={prefs.reviews} onValueChange={(v) => setPref('reviews', v)} color={COLORS.warning} disabled={!notifsOn} />} />
      </View>

      <Text style={styles.section}>News & Updates</Text>
      <View style={styles.sectionCard}>
        <Row icon="newspaper" iconColor="#EC4899" label="Nagaland News"
          right={<Toggle value={prefs.news} onValueChange={(v) => setPref('news', v)} color="#EC4899" disabled={!notifsOn} />} />
      </View>

      <Text style={styles.section}>General</Text>
      <View style={styles.sectionCard}>
        <LinkRow icon="refresh-outline" iconColor={COLORS.textMuted} label="Reset Notification Preferences" onPress={resetPreferences} />
        <View style={styles.sep} />
        <LinkRow icon="lock-closed-outline" iconColor={COLORS.textMuted} label="Privacy Policy" onPress={() => Linking.openURL(URLS.privacy)} />
        <View style={styles.sep} />
        <LinkRow icon="document-text-outline" iconColor={COLORS.textMuted} label="Terms of Service" onPress={() => Linking.openURL(URLS.terms)} />
      </View>

      <Text style={styles.section}>Our Websites</Text>
      <View style={styles.sectionCard}>
        {websiteLinks.map((site, i) => (
          <React.Fragment key={site.key}>
            {i > 0 && <View style={styles.sep} />}
            <LinkRow icon={site.icon} iconColor={site.color} label={site.label} onPress={() => Linking.openURL(site.url)} />
          </React.Fragment>
        ))}
      </View>

      <Text style={styles.section}>Support</Text>
      <View style={styles.sectionCard}>
        <LinkRow icon="mail-outline" iconColor={COLORS.primary} label="Contact Us"
          onPress={() => Linking.openURL(`mailto:${APP_INFO.email}`)} />
        <View style={styles.sep} />
        <LinkRow icon="logo-whatsapp" iconColor="#25D366" label="WhatsApp Support"
          onPress={() => Linking.openURL(`https://wa.me/${APP_INFO.whatsapp.replace('+', '')}`)} />
      </View>

      <View style={styles.footer}>
        <Text style={styles.footerName}>{APP_INFO.developer}</Text>
        <Text style={styles.footerSub}>GST: {APP_INFO.gst}</Text>
        <Text style={styles.footerSub}>Dimapur, Nagaland, India</Text>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  header: { alignItems: 'center', paddingTop: 24, paddingBottom: 32 },
  appIcon: { width: 72, height: 72, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  appIconText: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  appName: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  appVersion: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  section: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 20, marginTop: 24, marginBottom: 8 },
  sectionCard: { backgroundColor: COLORS.card, marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  rowLeft: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rowLabel: { fontSize: 15, color: '#FFF' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 48 },
  footer: { alignItems: 'center', paddingTop: 32, paddingBottom: 16 },
  footerName: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  footerSub: { fontSize: 12, color: '#4B5563', marginTop: 2 },
});
