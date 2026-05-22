import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet, Platform, StatusBar } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';

// Compact top bar shown above the WebView.
//   left:   Home button (returns to AI Chat) — hidden when already home
//   center: current site icon + name
//   right:  9-dot grid icon → opens AppSwitcher
export default function AppHeader({ site, isHome, onHome, onOpenSwitcher }) {
  const insets = useSafeAreaInsets();
  const topPad = Platform.OS === 'android' ? (StatusBar.currentHeight || 0) : insets.top;

  return (
    <View style={[s.wrap, { paddingTop: topPad }]}>
      <View style={s.bar}>
        <View style={s.left}>
          {!isHome ? (
            <TouchableOpacity onPress={onHome} hitSlop={10} style={s.iconBtn} accessibilityLabel="Go to AI Chat home">
              <Ionicons name="home" size={20} color="#FFF" />
            </TouchableOpacity>
          ) : (
            <View style={s.iconBtn} />
          )}
        </View>

        <View style={s.center}>
          <View style={[s.dot, { backgroundColor: site.color }]} />
          <Text style={s.title} numberOfLines={1}>{site.name}</Text>
        </View>

        <View style={s.right}>
          <TouchableOpacity
            onPress={onOpenSwitcher}
            hitSlop={10}
            style={s.iconBtn}
            accessibilityLabel="Open app switcher"
          >
            <Ionicons name="apps" size={22} color="#FFF" />
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: {
    backgroundColor: COLORS.background,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
  },
  bar: {
    height: 48,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 8,
  },
  left:   { width: 56, flexDirection: 'row', alignItems: 'center' },
  right:  { width: 56, alignItems: 'flex-end' },
  center: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center' },
  iconBtn: {
    width: 40, height: 40, borderRadius: 20,
    alignItems: 'center', justifyContent: 'center',
  },
  dot: { width: 8, height: 8, borderRadius: 4, marginRight: 8 },
  title: { color: '#FFF', fontSize: 16, fontWeight: '600', maxWidth: 220 },
});
