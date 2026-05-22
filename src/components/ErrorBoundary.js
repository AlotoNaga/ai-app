import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { COLORS, STORAGE_KEYS } from '../config/constants';

// Volatile keys that commonly carry partial / corrupted state across crashes.
// Persistent identity (push token, sessions, onboarding flag, prefs) is left
// alone so the user does not have to log in again after a restart.
const RESET_KEYS = [
  STORAGE_KEYS.LAST_SITE,
  STORAGE_KEYS.PING_COUNT,
  STORAGE_KEYS.TRIP_ACTIVE,
  STORAGE_KEYS.TRIP_ID,
  STORAGE_KEYS.LAST_PING_ERROR,
];

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, isRecovering: false, recoveryCount: 0 };
  }

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error, info) {
    console.error('ErrorBoundary:', error, info?.componentStack || info);
  }

  handleRestart = async () => {
    this.setState({ isRecovering: true });
    try {
      // Clear volatile transient state so a corrupted entry does not crash
      // the app again immediately after the user taps Restart.
      await AsyncStorage.multiRemove(RESET_KEYS);
    } catch (e) {
      console.warn('ErrorBoundary recovery cleanup failed:', e?.message || e);
    }
    this.setState((prev) => ({
      hasError: false,
      isRecovering: false,
      recoveryCount: prev.recoveryCount + 1,
    }));
    if (typeof this.props.onRecover === 'function') {
      try { this.props.onRecover(); } catch {}
    }
  };

  render() {
    if (this.state.hasError) {
      return (
        <View style={styles.container}>
          <View style={styles.iconContainer}>
            <Ionicons name="bug-outline" size={56} color={COLORS.warning} />
          </View>
          <Text style={styles.title}>Something Went Wrong</Text>
          <Text style={styles.message}>
            {this.state.recoveryCount > 0
              ? 'The app crashed again after restart. If this keeps happening, please reinstall the app or contact support.'
              : 'The app ran into an unexpected error. Tap below to clear temporary state and restart.'}
          </Text>
          <TouchableOpacity
            style={[styles.button, this.state.isRecovering && { opacity: 0.6 }]}
            onPress={this.handleRestart}
            disabled={this.state.isRecovering}
            activeOpacity={0.7}
          >
            <Ionicons name="refresh-outline" size={20} color="#FFF" style={{ marginRight: 8 }} />
            <Text style={styles.buttonText}>{this.state.isRecovering ? 'Restarting...' : 'Restart App'}</Text>
          </TouchableOpacity>
        </View>
      );
    }
    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.background, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconContainer: { width: 100, height: 100, borderRadius: 50, backgroundColor: 'rgba(245,158,11,0.1)', alignItems: 'center', justifyContent: 'center', marginBottom: 24 },
  title: { fontSize: 22, fontWeight: '700', color: '#FFF', marginBottom: 12, textAlign: 'center' },
  message: { fontSize: 15, color: COLORS.textSecondary, textAlign: 'center', lineHeight: 22, marginBottom: 32 },
  button: { flexDirection: 'row', alignItems: 'center', backgroundColor: COLORS.primary, paddingHorizontal: 28, paddingVertical: 14, borderRadius: 12 },
  buttonText: { fontSize: 16, fontWeight: '600', color: '#FFF' },
});
