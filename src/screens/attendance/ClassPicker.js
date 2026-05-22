// ============================================================
// ClassPicker — first signed-in view.
//
// Reads the teacher's classes straight from SQLite so it loads instantly
// and works completely offline. Pull-to-refresh re-fetches from the server
// and replaces the cached roster (replaceClassesAndStudents is a single
// transaction, so a failed network call leaves local state untouched).
//
// Props:
//   teacher       { name, email? } — header label
//   onPick(class) tapped class row { id, name, section, school_name, has_subjects }
//   onSignOut()   sign-out tap target in the header
//   onRefreshError(message)  optional — surface refresh failures upstream
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, RefreshControl,
  ActivityIndicator, Alert,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../config/constants';
import s from './styles';
import SyncStatusBar from './SyncStatusBar';
import { listClasses, replaceClassesAndStudents, rosterFreshness } from '../../services/attendanceDb';
import { fetchClasses, AttendanceApiError } from '../../services/attendanceApi';

export default function ClassPicker({ teacher, onPick, onSignOut, onSessionExpired }) {
  const insets = useSafeAreaInsets();
  const [classes, setClasses] = useState(null);   // null = loading from disk
  const [refreshing, setRefreshing] = useState(false);
  const [refreshError, setRefreshError] = useState('');
  const [freshness, setFreshness] = useState(0);

  const loadFromDisk = useCallback(async () => {
    try {
      const [rows, ts] = await Promise.all([listClasses(), rosterFreshness()]);
      setClasses(rows);
      setFreshness(ts);
    } catch (e) {
      setClasses([]);
    }
  }, []);

  const refreshFromServer = useCallback(async () => {
    setRefreshing(true);
    setRefreshError('');
    try {
      const payload = await fetchClasses();
      await replaceClassesAndStudents({ classes: payload.classes });
      await loadFromDisk();
    } catch (e) {
      if (e instanceof AttendanceApiError && (e.code === 'expired' || e.code === 'no_session')) {
        onSessionExpired?.();
        return;
      }
      const msg = e?.message || 'Could not refresh classes';
      setRefreshError(msg);
    } finally {
      setRefreshing(false);
    }
  }, [loadFromDisk, onSessionExpired]);

  useEffect(() => {
    loadFromDisk();
    // First-load auto refresh — only if the cache is stale (older than 12h)
    // or empty. Avoids a needless network call on every sign-in.
    (async () => {
      const ts = await rosterFreshness();
      const stale = !ts || (Date.now() - ts) > 12 * 60 * 60 * 1000;
      if (stale) refreshFromServer();
    })();
  }, [loadFromDisk, refreshFromServer]);

  const confirmSignOut = () => {
    Alert.alert(
      'Sign Out?',
      'Unsynced attendance will stay on this phone until the next sign-in. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Sign Out', style: 'destructive', onPress: onSignOut },
      ],
    );
  };

  // ----- render --------------------------------------------------------------
  const renderItem = ({ item }) => {
    const subtitle = [item.section, item.school_name].filter(Boolean).join(' · ');
    return (
      <TouchableOpacity
        style={s.card}
        onPress={() => onPick(item)}
        activeOpacity={0.75}
        accessibilityLabel={`Open class ${item.name}`}
      >
        <View style={s.cardRow}>
          <View style={{
            width: 44, height: 44, borderRadius: 12,
            backgroundColor: 'rgba(16,185,129,0.12)',
            alignItems: 'center', justifyContent: 'center', marginRight: 12,
          }}>
            <Ionicons name="people" size={22} color={COLORS.primary} />
          </View>
          <View style={{ flex: 1 }}>
            <Text style={s.cardTitle} numberOfLines={1}>{item.name}</Text>
            {subtitle ? <Text style={s.cardSub} numberOfLines={1}>{subtitle}</Text> : null}
          </View>
          <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      {/* Top header — teacher name + sign-out + status pill ------------------ */}
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', paddingHorizontal: 16, marginBottom: 4 }}>
        <View style={{ flex: 1 }}>
          <Text style={s.pageTitle}>Attendance</Text>
          <Text style={s.pageSub}>
            {teacher?.name ? `Signed in as ${teacher.name}` : 'Pick a class to begin'}
          </Text>
        </View>
        <TouchableOpacity
          onPress={confirmSignOut}
          hitSlop={10}
          style={{ padding: 8, marginTop: 16 }}
          accessibilityLabel="Sign out"
        >
          <Ionicons name="log-out-outline" size={22} color={COLORS.textMuted} />
        </TouchableOpacity>
      </View>

      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <SyncStatusBar />
      </View>

      {refreshError ? (
        <View style={{ paddingHorizontal: 16, marginBottom: 8 }}>
          <Text style={s.errText}>{refreshError}</Text>
        </View>
      ) : null}

      {classes === null ? (
        <View style={s.centered}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={s.loadingLabel}>Loading classes…</Text>
        </View>
      ) : (
        <FlatList
          data={classes}
          keyExtractor={(c) => String(c.id)}
          renderItem={renderItem}
          contentContainerStyle={[s.scrollPad, classes.length === 0 && { flexGrow: 1, justifyContent: 'center' }]}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={refreshFromServer}
              tintColor={COLORS.primary}
              colors={[COLORS.primary]}
            />
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Ionicons name="folder-open-outline" size={48} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
              <Text style={s.emptyText}>No classes assigned to your account yet.</Text>
              <Text style={[s.emptyText, { marginTop: 6, fontSize: 13 }]}>
                Pull down to refresh, or contact your school admin.
              </Text>
            </View>
          }
          ListFooterComponent={
            freshness ? (
              <Text style={[s.hint, { marginTop: 20 }]}>
                Roster last updated {new Date(freshness).toLocaleString()}.{'\n'}
                Pull down to refresh.
              </Text>
            ) : null
          }
        />
      )}
    </View>
  );
}
