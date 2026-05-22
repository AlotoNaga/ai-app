import React, { useState, useEffect, useCallback, useRef } from 'react';
import { View, Text, StyleSheet, ScrollView, TouchableOpacity, Switch, Alert, AppState } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import * as Linking from 'expo-linking';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as Notifications from 'expo-notifications';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, APP_INFO, URLS, STORAGE_KEYS } from '../config/constants';
import { invalidatePrefsCache } from '../services/notifications';

export default function SettingsScreen() {
  const insets = useSafeAreaInsets();
  const [notifsOn, setNotifsOn] = useState(true);
  const [p, setP] = useState({ attendance: true, absent: true, holiday: true, orders: true, messages: true, reviews: true, news: true });
  // Serialise writes so two fast toggles can't lose updates via read-modify-write race.
  const writeChain = useRef(Promise.resolve());

  useEffect(() => { load(); check(); }, []);
  useEffect(() => { const s = AppState.addEventListener('change', s => { if (s === 'active') check(); }); return () => s.remove(); }, []);

  const load = async () => { try { const d = await AsyncStorage.getItem(STORAGE_KEYS.USER_PREFERENCES); if (d) setP(prev => ({ ...prev, ...JSON.parse(d) })); } catch {} };
  const check = async () => { const { status } = await Notifications.getPermissionsAsync(); setNotifsOn(status === 'granted'); };

  // Apply the toggle to local state and persist the resulting object as a
  // whole. Building from latest local state (not re-reading disk) plus chaining
  // writes guarantees no toggle is dropped.
  const toggle = useCallback((k, v) => {
    setP((prev) => {
      const next = { ...prev, [k]: v };
      writeChain.current = writeChain.current.then(async () => {
        try {
          await AsyncStorage.setItem(STORAGE_KEYS.USER_PREFERENCES, JSON.stringify(next));
          invalidatePrefsCache();
        } catch {}
      });
      return next;
    });
  }, []);

  const toggleNotifs = async (v) => {
    if (v) { const { status } = await Notifications.requestPermissionsAsync(); if (status === 'granted') setNotifsOn(true); else Alert.alert('Notifications Disabled', 'Enable in device Settings.', [{ text: 'Cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]); }
    else Alert.alert('Disable?', 'Go to device Settings.', [{ text: 'Cancel' }, { text: 'Open Settings', onPress: () => Linking.openSettings() }]);
  };

  const clearCache = () => Alert.alert('Clear Cache', 'Reset preferences?', [{ text: 'Cancel' }, { text: 'Clear', style: 'destructive', onPress: async () => { await AsyncStorage.removeItem(STORAGE_KEYS.USER_PREFERENCES); setP({ attendance: true, absent: true, holiday: true, orders: true, messages: true, reviews: true, news: true }); Alert.alert('Done', 'Cleared.'); } }]);

  const sw = (val, onChange, color, dis) => <Switch value={val} onValueChange={onChange} trackColor={{ false: '#3e3e3e', true: color }} thumbColor="#FFF" ios_backgroundColor="#3e3e3e" disabled={dis} />;
  const row = (icon, ic, label, right) => <View style={s.row}><View style={s.rl}><Ionicons name={icon} size={20} color={ic} style={{ marginRight: 12 }} /><Text style={s.rla}>{label}</Text></View>{right}</View>;
  const link = (icon, ic, label, fn) => <TouchableOpacity style={s.row} onPress={fn} activeOpacity={0.6}><View style={s.rl}><Ionicons name={icon} size={20} color={ic} style={{ marginRight: 12 }} /><Text style={s.rla}>{label}</Text></View><Ionicons name="chevron-forward" size={18} color={COLORS.textMuted} /></TouchableOpacity>;

  return (
    <ScrollView style={s.c} contentContainerStyle={{ paddingBottom: Math.max(insets.bottom, 20) + 20 }}>
      <View style={s.hdr}><View style={s.appIc}><Text style={s.appIcT}>AI</Text></View><Text style={s.appN}>{APP_INFO.name}</Text><Text style={s.appV}>Version {APP_INFO.version}</Text></View>

      <Text style={s.sec}>School Notifications</Text>
      <View style={s.secC}>
        {row('notifications', COLORS.primary, 'Push Notifications', sw(notifsOn, toggleNotifs, COLORS.primary))}
        <View style={s.sep} />
        {row('checkmark-circle', COLORS.primary, 'Daily Attendance', sw(p.attendance, v => toggle('attendance', v), COLORS.primary, !notifsOn))}
        <View style={s.sep} />
        {row('alert-circle', COLORS.danger, 'Absent Alerts', sw(p.absent, v => toggle('absent', v), COLORS.danger, !notifsOn))}
        <View style={s.sep} />
        {row('sunny', COLORS.gold, 'Holiday Announcements', sw(p.holiday, v => toggle('holiday', v), COLORS.gold, !notifsOn))}
        <View style={s.sep} />
        {/* Emergency alerts cannot be disabled — school-safety requirement.
            Surfaced here as a read-only row so users know it's still active. */}
        {row('warning', COLORS.warning, 'Emergency Alerts',
          <Text style={{ color: COLORS.warning, fontSize: 12, fontWeight: '700', letterSpacing: 0.5 }}>ALWAYS ON</Text>
        )}
      </View>

      <Text style={s.sec}>Experts Notifications</Text>
      <View style={s.secC}>
        {row('cart', COLORS.primary, 'Order Updates', sw(p.orders, v => toggle('orders', v), COLORS.primary, !notifsOn))}
        <View style={s.sep} />
        {row('chatbubble-ellipses', COLORS.gold, 'Messages', sw(p.messages, v => toggle('messages', v), COLORS.gold, !notifsOn))}
        <View style={s.sep} />
        {row('star', COLORS.warning, 'Reviews', sw(p.reviews, v => toggle('reviews', v), COLORS.warning, !notifsOn))}
      </View>

      <Text style={s.sec}>News & Updates</Text>
      <View style={s.secC}>
        {row('newspaper', '#EC4899', 'Nagaland News', sw(p.news, v => toggle('news', v), '#EC4899', !notifsOn))}
      </View>

      <Text style={s.sec}>General</Text>
      <View style={s.secC}>
        {link('trash-outline', COLORS.textMuted, 'Clear Cache', clearCache)}
        <View style={s.sep} />
        {link('lock-closed-outline', COLORS.textMuted, 'Privacy Policy', () => Linking.openURL(URLS.privacy))}
        <View style={s.sep} />
        {link('document-text-outline', COLORS.textMuted, 'Terms of Service', () => Linking.openURL(URLS.terms))}
      </View>

      <Text style={s.sec}>Our Websites</Text>
      <View style={s.secC}>
        {link('chatbubble-ellipses-outline', COLORS.primary, 'AI Chat — nagalandai.com', () => Linking.openURL('https://nagalandai.com'))}
        <View style={s.sep} />
        {link('storefront-outline', COLORS.gold, 'Experts Marketplace', () => Linking.openURL('https://experts.nagaland.me'))}
        <View style={s.sep} />
        {link('help-buoy-outline', '#F59E0B', 'Help Nagaland', () => Linking.openURL('https://helpnagaland.com'))}
        <View style={s.sep} />
        {link('person-add-outline', '#8B5CF6', 'Profiles', () => Linking.openURL('https://nagalandprofiles.com'))}
        <View style={s.sep} />
        {link('book-outline', '#06B6D4', 'Naga Dictionary', () => Linking.openURL('https://nagalanddictionary.com'))}
        <View style={s.sep} />
        {link('newspaper-outline', '#EC4899', 'News Today', () => Linking.openURL('https://nagalandnewstoday.com'))}
      </View>

      <Text style={s.sec}>Support</Text>
      <View style={s.secC}>
        {link('mail-outline', COLORS.primary, 'Contact Us', () => Linking.openURL('mailto:info@nagalandai.com'))}
        <View style={s.sep} />
        {link('logo-whatsapp', '#25D366', 'WhatsApp Support', () => Linking.openURL(`https://wa.me/${APP_INFO.whatsapp.replace('+', '')}`))}
      </View>

      <View style={s.ftr}><Text style={s.ftrN}>{APP_INFO.developer}</Text><Text style={s.ftrS}>GST: {APP_INFO.gst}</Text><Text style={s.ftrS}>Dimapur, Nagaland, India</Text></View>
    </ScrollView>
  );
}

const s = StyleSheet.create({
  c: { flex: 1, backgroundColor: COLORS.background },
  hdr: { alignItems: 'center', paddingTop: 24, paddingBottom: 32 },
  appIc: { width: 72, height: 72, borderRadius: 18, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', marginBottom: 12, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 6 },
  appIcT: { fontSize: 28, fontWeight: '800', color: '#FFF' },
  appN: { fontSize: 20, fontWeight: '700', color: '#FFF' },
  appV: { fontSize: 13, color: COLORS.textMuted, marginTop: 4 },
  sec: { fontSize: 13, fontWeight: '600', color: COLORS.textMuted, textTransform: 'uppercase', letterSpacing: 0.5, marginLeft: 20, marginTop: 24, marginBottom: 8 },
  secC: { backgroundColor: COLORS.card, marginHorizontal: 16, borderRadius: 12, overflow: 'hidden' },
  row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14 },
  rl: { flexDirection: 'row', alignItems: 'center', flex: 1 },
  rla: { fontSize: 15, color: '#FFF' },
  sep: { height: StyleSheet.hairlineWidth, backgroundColor: COLORS.border, marginLeft: 48 },
  ftr: { alignItems: 'center', paddingTop: 32, paddingBottom: 16 },
  ftrN: { fontSize: 14, color: COLORS.textMuted, fontWeight: '600' },
  ftrS: { fontSize: 12, color: '#4B5563', marginTop: 2 },
});
