import React, { useRef, useState } from 'react';
import { View, Text, StyleSheet, Dimensions, TouchableOpacity, FlatList, Animated } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, STORAGE_KEYS } from '../config/constants';

const { width } = Dimensions.get('window');

const SLIDES = [
  {
    id: '1', icon: 'apps', iconColor: COLORS.primary,
    title: 'One App, Seven Services',
    description: 'AI Chat, Experts, Help Nagaland, Profiles, Dictionary, News Today, and Schools — all in a single app. Tap the 9-dot icon any time to switch.',
    highlight: 'Apps grid · top-right',
  },
  {
    id: '2', icon: 'chatbubble-ellipses', iconColor: COLORS.primary,
    title: 'Your AI for Nagaland',
    description: 'Live news, district weather, scholarships, and answers in 18+ Naga languages. AI Teacher covers Class 1 to PhD across NBSE / CBSE / ICSE.',
    highlight: 'AI Chat opens by default',
  },
  {
    id: '3', icon: 'people', iconColor: COLORS.gold,
    title: 'Experts, Help & Profiles',
    description: 'Hire vetted Naga creators. Find community help. Browse the Naga dictionary. Read local news. Look up profiles. Everything one tap away.',
    highlight: 'Six websites at your fingertips',
  },
  {
    id: '4', icon: 'school', iconColor: '#0A7558',
    title: 'Schools & Bus Tracking',
    description: 'Parents get attendance alerts and watch the bus live. Authorized drivers can switch to Driver Mode and start a tracked trip.',
    highlight: 'Live GPS, even when locked',
  },
  {
    id: '5', icon: 'notifications', iconColor: COLORS.danger,
    title: 'Alerts That Matter',
    description: 'Push notifications for attendance, orders, messages, news, and emergencies. Toggle each category in Settings — emergencies always come through.',
    highlight: 'Tunable in Settings',
  },
];

export default function OnboardingScreen({ onComplete }) {
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(0);
  const flatListRef = useRef(null);
  const scrollX = useRef(new Animated.Value(0)).current;

  const handleNext = () => {
    if (currentIndex < SLIDES.length - 1) flatListRef.current?.scrollToIndex({ index: currentIndex + 1 });
    else handleDone();
  };

  const handleDone = async () => {
    try { await AsyncStorage.setItem(STORAGE_KEYS.ONBOARDING_COMPLETE, 'true'); } catch {}
    onComplete();
  };

  const onViewableItemsChanged = useRef(({ viewableItems }) => {
    if (viewableItems.length > 0) setCurrentIndex(viewableItems[0].index ?? 0);
  }).current;

  const renderSlide = ({ item }) => (
    <View style={styles.slide}>
      <View style={[styles.iconCircle, { shadowColor: item.iconColor }]}>
        <Ionicons name={item.icon} size={56} color={item.iconColor} />
      </View>
      <Text style={styles.title}>{item.title}</Text>
      <Text style={styles.description}>{item.description}</Text>
      <View style={[styles.highlightBadge, { borderColor: item.iconColor }]}>
        <Text style={[styles.highlightText, { color: item.iconColor }]}>{item.highlight}</Text>
      </View>
    </View>
  );

  const isLast = currentIndex === SLIDES.length - 1;

  return (
    <View style={styles.container}>
      {!isLast && (
        <TouchableOpacity style={[styles.skipButton, { top: insets.top + 12 }]} onPress={handleDone} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
          <Text style={styles.skipText}>Skip</Text>
        </TouchableOpacity>
      )}
      <FlatList ref={flatListRef} data={SLIDES} renderItem={renderSlide} keyExtractor={(i) => i.id}
        horizontal pagingEnabled showsHorizontalScrollIndicator={false} bounces={false}
        onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: false })}
        onViewableItemsChanged={onViewableItemsChanged} viewabilityConfig={{ viewAreaCoveragePercentThreshold: 50 }}
        getItemLayout={(_, index) => ({ length: width, offset: width * index, index })} />

      <View style={[styles.bottom, { bottom: Math.max(insets.bottom, 20) + 16 }]}>
        <View style={styles.dots}>
          {SLIDES.map((_, i) => {
            const range = [(i - 1) * width, i * width, (i + 1) * width];
            return <Animated.View key={i} style={[styles.dot, {
              width: scrollX.interpolate({ inputRange: range, outputRange: [8, 24, 8], extrapolate: 'clamp' }),
              opacity: scrollX.interpolate({ inputRange: range, outputRange: [0.3, 1, 0.3], extrapolate: 'clamp' }),
            }]} />;
          })}
        </View>
        <TouchableOpacity style={[styles.nextBtn, isLast && styles.startBtn]} onPress={handleNext} activeOpacity={0.7}>
          {isLast ? <Text style={styles.startText}>Get Started</Text> : <Ionicons name="arrow-forward" size={24} color="#FFF" />}
        </TouchableOpacity>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background },
  skipButton: { position: 'absolute', right: 24, zIndex: 10, padding: 8 },
  skipText: { fontSize: 16, color: COLORS.textMuted, fontWeight: '500' },
  slide: { width, alignItems: 'center', justifyContent: 'center', paddingHorizontal: 40, paddingBottom: 120 },
  iconCircle: { width: 120, height: 120, borderRadius: 60, backgroundColor: 'rgba(16,185,129,0.08)', alignItems: 'center', justifyContent: 'center', marginBottom: 40, shadowOffset: { width: 0, height: 0 }, shadowOpacity: 0.3, shadowRadius: 20, elevation: 8 },
  title: { fontSize: 28, fontWeight: '700', color: '#FFF', textAlign: 'center', marginBottom: 16 },
  description: { fontSize: 16, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 24, marginBottom: 24 },
  highlightBadge: { borderWidth: 1, borderRadius: 20, paddingHorizontal: 16, paddingVertical: 8 },
  highlightText: { fontSize: 13, fontWeight: '600', letterSpacing: 0.3 },
  bottom: { position: 'absolute', left: 0, right: 0, flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 32 },
  dots: { flexDirection: 'row', alignItems: 'center' },
  dot: { height: 8, borderRadius: 4, backgroundColor: COLORS.primary, marginHorizontal: 4 },
  nextBtn: { width: 56, height: 56, borderRadius: 28, backgroundColor: COLORS.primary, alignItems: 'center', justifyContent: 'center', elevation: 4, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8 },
  startBtn: { width: 'auto', paddingHorizontal: 28, borderRadius: 28 },
  startText: { fontSize: 16, fontWeight: '700', color: '#FFF', letterSpacing: 0.3 },
});
