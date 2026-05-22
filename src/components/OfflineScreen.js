import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../config/constants';

export default function OfflineScreen({ onRetry, message }) {
  const insets = useSafeAreaInsets();
  return (
    <View style={styles.container}>
      <View style={styles.content}>
        <View style={styles.iconContainer}>
          <Ionicons name="cloud-offline-outline" size={64} color={COLORS.textMuted} />
        </View>
        <Text style={styles.title}>No Connection</Text>
        <Text style={styles.message}>{message || 'Check your network and try again.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.7}>
          <Ionicons name="refresh-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
          <Text style={styles.retryText}>Try Again</Text>
        </TouchableOpacity>
      </View>
      <Text style={[styles.footer, { bottom: Math.max(insets.bottom, 20) + 12 }]}>Nagaland AI</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  content: { alignItems: 'center', maxWidth: 300 },
  iconContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(107,114,128,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontSize: 24, fontWeight: '700', color: '#FFF', marginBottom: 12 },
  message: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  retryButton: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12, shadowColor: COLORS.primary, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 8, elevation: 4 },
  retryText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
  footer: { position: 'absolute', fontSize: 13, color: '#4B5563' },
});
