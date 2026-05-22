// ============================================================
// Sync status pill shown at the top of every signed-in attendance view.
//
// Self-sufficient: subscribes to NetInfo and the sync queue's own change
// stream, polls the local pending count on mount and after every sync.
// Parent just renders <SyncStatusBar /> — no props required.
//
// States (in priority order):
//   • Syncing                 — a drain is in flight
//   • Offline + pending > 0   — we can't sync now; show the pending count
//   • Offline                 — no pending work
//   • Pending > 0 (online)    — show count + "Sync now" tap target
//   • All synced              — soft confirmation
// ============================================================

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { View, Text, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import NetInfo from '@react-native-community/netinfo';
import { COLORS } from '../../config/constants';
import s from './styles';
import {
  pendingSyncCount, deadLetteredSyncCount, resetDeadLetteredAttempts,
} from '../../services/attendanceDb';
import { syncNow, onSyncChange, isRunning } from '../../services/attendanceSync';

function formatRelative(ts) {
  if (!ts) return null;
  const diffSec = Math.floor((Date.now() - ts) / 1000);
  if (diffSec < 60) return 'just now';
  if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
  if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
  return `${Math.floor(diffSec / 86400)}d ago`;
}

export default function SyncStatusBar() {
  const [online, setOnline] = useState(true);
  const [pending, setPending] = useState(0);
  const [stuck, setStuck] = useState(0);
  const [running, setRunning] = useState(isRunning());
  const [lastSyncAt, setLastSyncAt] = useState(null);

  // Guard against setState-after-unmount. The teacher can back out of the
  // attendance screen while an in-flight pendingSyncCount() query or the
  // onSyncChange listener is mid-callback — without this, RN logs the
  // 'can't update an unmounted component' warning.
  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  const refreshPending = useCallback(async () => {
    try {
      const [p, d] = await Promise.all([pendingSyncCount(), deadLetteredSyncCount()]);
      if (!mountedRef.current) return;
      setPending(p);
      setStuck(d);
    } catch {}
  }, []);

  const onPressRetryStuck = useCallback(() => {
    Alert.alert(
      'Retry stuck records?',
      'Some attendance entries failed to sync 10 times in a row. Retry now?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Retry',
          onPress: async () => {
            try {
              await resetDeadLetteredAttempts();
              await refreshPending();
              syncNow().catch(() => {});
            } catch (e) {
              Alert.alert('Retry failed', e?.message || 'Could not reset stuck records.');
            }
          },
        },
      ],
    );
  }, [refreshPending]);

  useEffect(() => {
    refreshPending();
    const unsubNet = NetInfo.addEventListener((state) => {
      if (!mountedRef.current) return;
      setOnline(!!state.isConnected && state.isInternetReachable !== false);
    });
    const unsubSync = onSyncChange((result) => {
      if (!mountedRef.current) return;
      setRunning(isRunning());
      if (result?.at) setLastSyncAt(result.at);
      refreshPending();
    });
    // Bumps "running" while a drain is in progress; the change listener
    // covers transitions but not the in-flight start, so poll briefly.
    const tick = setInterval(() => {
      if (mountedRef.current) setRunning(isRunning());
    }, 1000);
    return () => { unsubNet(); unsubSync(); clearInterval(tick); };
  }, [refreshPending]);

  const onPressSync = useCallback(() => {
    if (!online || running) return;
    syncNow().catch(() => {});
  }, [online, running]);

  // ----- Composition -------------------------------------------------------
  let icon, color, label, action = null;

  if (running) {
    color = COLORS.primary;
    icon = <ActivityIndicator size="small" color={color} />;
    label = pending > 0 ? `Syncing… ${pending} left` : 'Syncing…';
  } else if (stuck > 0) {
    // Surface stuck records before any other "happy" state. The auto-sync
    // worker has given up on these — the teacher needs an explicit retry.
    color = COLORS.danger;
    icon = <Ionicons name="warning" size={14} color={color} />;
    label = `${stuck} stuck — needs retry`;
    action = (
      <TouchableOpacity onPress={onPressRetryStuck} hitSlop={8} style={{ marginLeft: 10 }} accessibilityLabel="Retry stuck records">
        <Text style={{ color: COLORS.danger, fontSize: 12, fontWeight: '700' }}>RETRY</Text>
      </TouchableOpacity>
    );
  } else if (!online) {
    color = COLORS.warning;
    icon = <Ionicons name="cloud-offline" size={14} color={color} />;
    label = pending > 0 ? `Offline · ${pending} pending` : 'Offline';
  } else if (pending > 0) {
    color = COLORS.gold;
    icon = <Ionicons name="cloud-upload-outline" size={14} color={color} />;
    label = `${pending} to sync`;
    action = (
      <TouchableOpacity onPress={onPressSync} hitSlop={8} style={{ marginLeft: 10 }} accessibilityLabel="Sync now">
        <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '700' }}>SYNC NOW</Text>
      </TouchableOpacity>
    );
  } else {
    color = COLORS.primary;
    icon = <Ionicons name="checkmark-circle" size={14} color={color} />;
    const rel = formatRelative(lastSyncAt);
    label = rel ? `All synced · ${rel}` : 'All synced';
  }

  return (
    <View style={[s.pill, { borderColor: color + '55', backgroundColor: color + '15' }]}>
      {icon}
      <Text style={[s.pillText, { color }]}>{label}</Text>
      {action}
    </View>
  );
}
