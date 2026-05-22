import React, { useState, useCallback, useEffect, useImperativeHandle, forwardRef } from 'react';
import { View, StyleSheet } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

import AppHeader from '../components/AppHeader';
import AppSwitcher from '../components/AppSwitcher';
import WebViewScreen from '../components/WebViewScreen';
import DriverScreen from './DriverScreen';
import SettingsScreen from './SettingsScreen';
import AttendanceScreen from './AttendanceScreen';
import { COLORS, SITE_BY_KEY, HOME_KEY, STORAGE_KEYS } from '../config/constants';

// Root in-app screen.
//   - Holds activeKey (which site is showing)
//   - Renders header + active content (WebView | DriverScreen | SettingsScreen)
//   - Owns the AppSwitcher modal
//   - Exposes an imperative `setSite(key)` so App.js can route push notifications
const MainShell = forwardRef(function MainShell({ initialKey }, ref) {
  const [activeKey, setActiveKey] = useState(initialKey || HOME_KEY);
  const [switcherOpen, setSwitcherOpen] = useState(false);

  useImperativeHandle(ref, () => ({
    setSite: (key) => {
      if (SITE_BY_KEY[key]) setActiveKey(key);
    },
  }), []);

  // Persist last-viewed site so re-launch returns to it (except special tools)
  useEffect(() => {
    const site = SITE_BY_KEY[activeKey];
    if (site && !site.special) {
      AsyncStorage.setItem(STORAGE_KEYS.LAST_SITE, activeKey).catch(() => {});
    }
  }, [activeKey]);

  const openSwitcher = useCallback(() => setSwitcherOpen(true), []);
  const closeSwitcher = useCallback(() => setSwitcherOpen(false), []);

  const handlePick = useCallback((site) => {
    setActiveKey(site.key);
    setSwitcherOpen(false);
  }, []);

  const goHome = useCallback(() => setActiveKey(HOME_KEY), []);

  const site = SITE_BY_KEY[activeKey] || SITE_BY_KEY[HOME_KEY];
  const isHome = activeKey === HOME_KEY;

  // Keyed by site so switching forces a fresh WebView per site rather
  // than navigating one shared instance — keeps each site's history isolated.
  const renderBody = () => {
    if (site.special === 'driver') return <DriverScreen />;
    if (site.special === 'settings') return <SettingsScreen />;
    if (site.special === 'attendance') return <AttendanceScreen />;
    return <WebViewScreen key={site.key} url={site.url} />;
  };

  return (
    <View style={s.root}>
      <AppHeader
        site={site}
        isHome={isHome}
        onHome={goHome}
        onOpenSwitcher={openSwitcher}
      />
      <View style={s.body}>{renderBody()}</View>

      <AppSwitcher
        visible={switcherOpen}
        activeKey={activeKey}
        onClose={closeSwitcher}
        onSelect={handlePick}
      />
    </View>
  );
});

export default MainShell;

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: COLORS.background },
  body: { flex: 1 },
});
