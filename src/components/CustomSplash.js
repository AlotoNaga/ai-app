import React, { useEffect, useRef } from 'react';
import { View, Text, Animated, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';

export default function CustomSplash({ onComplete }) {
  const insets = useSafeAreaInsets();
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const scaleAnim = useRef(new Animated.Value(0.8)).current;
  const textFade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, { toValue: 1, duration: 600, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, tension: 50, friction: 7, useNativeDriver: true }),
    ]).start(() => {
      Animated.timing(textFade, { toValue: 1, duration: 400, useNativeDriver: true }).start(() => {
        setTimeout(() => {
          Animated.timing(fadeAnim, { toValue: 0, duration: 300, useNativeDriver: true }).start(() => onComplete());
        }, 800);
      });
    });
  }, []);

  return (
    <View style={styles.container}>
      <Animated.View style={[styles.logoContainer, { opacity: fadeAnim, transform: [{ scale: scaleAnim }] }]}>
        <View style={styles.logoPlaceholder}><Text style={styles.logoIcon}>NM</Text></View>
      </Animated.View>
      <Animated.Text style={[styles.appName, { opacity: textFade }]}>Nagaland AI</Animated.Text>
      <Animated.Text style={[styles.tagline, { opacity: textFade }]}>One app. Seven services.</Animated.Text>
      <Text style={[styles.companyName, { bottom: Math.max(insets.bottom, 20) + 16 }]}>nagaland.me</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center' },
  logoContainer: { marginBottom: 24 },
  logoPlaceholder: { width: 120, height: 120, borderRadius: 30, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.4, shadowRadius: 20, elevation: 10 },
  logoIcon: { fontSize: 44, fontWeight: '800', color: '#FFF', letterSpacing: 2 },
  appName: { fontSize: 32, fontWeight: '700', color: '#FFF', letterSpacing: 1 },
  tagline: { fontSize: 16, color: COLORS.primary, marginTop: 8, letterSpacing: 0.5 },
  companyName: { position: 'absolute', fontSize: 13, color: COLORS.textMuted, letterSpacing: 0.5 },
});
