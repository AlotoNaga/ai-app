import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, AppState } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import * as Notifications from 'expo-notifications';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';

import ErrorBoundary from './src/components/ErrorBoundary';
import CustomSplash from './src/components/CustomSplash';
import OnboardingScreen from './src/screens/OnboardingScreen';
import MainShell from './src/screens/MainShell';
import { COLORS, STORAGE_KEYS, SITE_BY_KEY, HOME_KEY } from './src/config/constants';

// CRITICAL: Register background GPS task at root level
import './src/services/location';

import {
  setupNotificationChannels,
  registerForPushNotifications,
  refreshTokenIfNeeded,
  getNotificationRoute,
  clearBadge,
} from './src/services/notifications';

SplashScreen.preventAutoHideAsync();

export default function App() {
  const [showSplash, setShowSplash] = useState(true);
  const [showOnboarding, setShowOnboarding] = useState(null);
  const [appReady, setAppReady] = useState(false);
  const [initialKey, setInitialKey] = useState(HOME_KEY);

  const shellRef = useRef(null);
  const notiRef = useRef(null);
  const notiRespRef = useRef(null);
  const appStateRef = useRef(AppState.currentState);

  useEffect(() => {
    (async () => {
      try {
        const done = await AsyncStorage.getItem(STORAGE_KEYS.ONBOARDING_COMPLETE);
        const onboardingNeeded = done !== 'true';
        setShowOnboarding(onboardingNeeded);

        // If app was opened by tapping a notification (cold start), resolve
        // the route BEFORE MainShell mounts so its initial activeKey is right.
        // Falls back to last-visited site otherwise.
        let startKey = null;
        try {
          const lastResp = await Notifications.getLastNotificationResponseAsync();
          if (lastResp) startKey = getNotificationRoute(lastResp.notification);
        } catch (e) {
          console.warn('Init: getLastNotificationResponse failed:', e?.message || e);
        }
        if (!startKey) {
          const last = await AsyncStorage.getItem(STORAGE_KEYS.LAST_SITE);
          if (last && SITE_BY_KEY[last] && !SITE_BY_KEY[last].special) startKey = last;
        }
        if (startKey) setInitialKey(startKey);

        await setupNotificationChannels();
        await clearBadge();
        // Defer push permission prompt until after onboarding so iOS shows
        // the dialog with context, not over the splash screen.
        if (!onboardingNeeded) registerForPushNotifications();
      } catch (e) {
        console.warn('Init error:', e);
        setShowOnboarding(false);
      } finally {
        setAppReady(true);
      }
    })();
  }, []);

  // Triggered when onboarding completes — first place we ask for push perms.
  const handleOnboardingComplete = useCallback(() => {
    setShowOnboarding(false);
    registerForPushNotifications();
  }, []);

  useEffect(() => {
    notiRef.current = Notifications.addNotificationReceivedListener(() => clearBadge());
    notiRespRef.current = Notifications.addNotificationResponseReceivedListener((r) => {
      const key = getNotificationRoute(r.notification);
      if (shellRef.current?.setSite) shellRef.current.setSite(key);
      else setInitialKey(key);
      clearBadge();
    });
    return () => {
      notiRef.current?.remove?.();
      notiRespRef.current?.remove?.();
    };
  }, []);

  useEffect(() => {
    const sub = AppState.addEventListener('change', (next) => {
      const prev = appStateRef.current;
      if ((prev === 'background' || prev === 'inactive') && next === 'active') {
        clearBadge();
        refreshTokenIfNeeded();
      }
      appStateRef.current = next;
    });
    return () => sub.remove();
  }, []);

  const onLayout = useCallback(async () => {
    if (appReady) await SplashScreen.hideAsync();
  }, [appReady]);

  if (!appReady || showOnboarding === null) return null;

  return (
    <ErrorBoundary>
      <SafeAreaProvider>
        <View style={{ flex: 1, backgroundColor: COLORS.background }} onLayout={onLayout}>
          <StatusBar style="light" />
          {showSplash ? (
            <CustomSplash onComplete={() => setShowSplash(false)} />
          ) : showOnboarding ? (
            <OnboardingScreen onComplete={handleOnboardingComplete} />
          ) : (
            <MainShell ref={shellRef} initialKey={initialKey} />
          )}
        </View>
      </SafeAreaProvider>
    </ErrorBoundary>
  );
}
