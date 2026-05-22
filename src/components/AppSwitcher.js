import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ScrollView,
  Animated,
  Easing,
  Pressable,
  Platform,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS, SITES, TOOLS, APP_INFO } from '../config/constants';

const CARD_GAP = 12;

function Card({ site, active, onPress }) {
  return (
    <TouchableOpacity
      style={[s.card, active && s.cardActive]}
      onPress={() => onPress(site)}
      activeOpacity={0.75}
    >
      <View style={[s.iconWrap, { backgroundColor: site.color + '22', borderColor: site.color + '55' }]}>
        <Ionicons name={site.icon} size={26} color={site.color} />
      </View>
      <Text style={s.cardName} numberOfLines={1}>{site.name}</Text>
      <Text style={s.cardTag} numberOfLines={2}>{site.tagline}</Text>
      {active && (
        <View style={[s.activeDot, { backgroundColor: site.color }]} />
      )}
    </TouchableOpacity>
  );
}

export default function AppSwitcher({ visible, activeKey, onClose, onSelect }) {
  const insets = useSafeAreaInsets();
  const slide = useRef(new Animated.Value(0)).current;
  const fade = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(slide, { toValue: 1, duration: 260, easing: Easing.out(Easing.cubic), useNativeDriver: true }),
        Animated.timing(fade, { toValue: 1, duration: 220, useNativeDriver: true }),
      ]).start();
    } else {
      slide.setValue(0);
      fade.setValue(0);
    }
  }, [visible, slide, fade]);

  const translateY = slide.interpolate({ inputRange: [0, 1], outputRange: [60, 0] });

  const handlePick = (site) => {
    onSelect(site);
  };

  return (
    <Modal
      visible={visible}
      transparent
      animationType="none"
      onRequestClose={onClose}
      statusBarTranslucent
    >
      <Animated.View style={[s.backdrop, { opacity: fade }]}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
      </Animated.View>

      <Animated.View
        style={[
          s.sheet,
          {
            paddingBottom: Math.max(insets.bottom, 16) + 16,
            paddingTop: 16,
            transform: [{ translateY }],
            opacity: fade,
          },
        ]}
      >
        <View style={s.handle} />

        <View style={s.header}>
          <View>
            <Text style={s.title}>All Apps</Text>
            <Text style={s.subtitle}>Tap any service to open it</Text>
          </View>
          <TouchableOpacity onPress={onClose} hitSlop={12} style={s.closeBtn}>
            <Ionicons name="close" size={22} color={COLORS.textSecondary} />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={s.scroll}
          contentContainerStyle={s.scrollInner}
          showsVerticalScrollIndicator={false}
        >
          <Text style={s.sectionLabel}>Websites</Text>
          <View style={s.grid}>
            {SITES.map((site) => (
              <Card
                key={site.key}
                site={site}
                active={site.key === activeKey}
                onPress={handlePick}
              />
            ))}
          </View>

          <Text style={[s.sectionLabel, { marginTop: 22 }]}>App Tools</Text>
          <View style={s.grid}>
            {TOOLS.map((site) => (
              <Card
                key={site.key}
                site={site}
                active={site.key === activeKey}
                onPress={handlePick}
              />
            ))}
          </View>

          <Text style={s.versionLine}>{APP_INFO.name} · v{APP_INFO.version}</Text>
        </ScrollView>
      </Animated.View>
    </Modal>
  );
}

const s = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  sheet: {
    position: 'absolute',
    left: 0, right: 0, bottom: 0,
    maxHeight: '88%',
    backgroundColor: COLORS.background,
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderColor: COLORS.border,
    ...Platform.select({
      ios: { shadowColor: '#000', shadowOpacity: 0.4, shadowRadius: 20, shadowOffset: { width: 0, height: -4 } },
      android: { elevation: 24 },
    }),
  },
  handle: {
    alignSelf: 'center',
    width: 38, height: 4,
    borderRadius: 2,
    backgroundColor: COLORS.border,
    marginBottom: 8,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingBottom: 8,
  },
  title: { color: '#FFF', fontSize: 20, fontWeight: '700' },
  subtitle: { color: COLORS.textMuted, fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 36, height: 36, borderRadius: 18,
    backgroundColor: COLORS.card,
    alignItems: 'center', justifyContent: 'center',
  },
  scroll: { flexGrow: 0 },
  scrollInner: { paddingHorizontal: 16, paddingTop: 8 },
  sectionLabel: {
    color: COLORS.textMuted, fontSize: 11, fontWeight: '700',
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: 10, marginLeft: 4,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginHorizontal: -CARD_GAP / 2,
  },
  card: {
    width: '33.3333%',
    paddingHorizontal: CARD_GAP / 2,
    paddingVertical: 8,
    alignItems: 'center',
  },
  cardActive: { opacity: 1 },
  iconWrap: {
    width: 56, height: 56, borderRadius: 16,
    alignItems: 'center', justifyContent: 'center',
    borderWidth: 1,
    marginBottom: 8,
  },
  cardName: { color: '#FFF', fontSize: 13, fontWeight: '600', textAlign: 'center' },
  cardTag: { color: COLORS.textMuted, fontSize: 10, textAlign: 'center', marginTop: 2, lineHeight: 13 },
  activeDot: {
    position: 'absolute',
    top: 8, right: '20%',
    width: 8, height: 8, borderRadius: 4,
  },
  versionLine: {
    textAlign: 'center',
    color: COLORS.textMuted,
    fontSize: 11,
    marginTop: 24,
  },
});
