// ============================================================
// SubjectPicker — second signed-in view, shown only for classes that
// mark per-period (has_subjects = 1). Reads subjects straight from the
// local SQLite cache; no network needed.
//
// Props:
//   classRow            { id, name, section, school_name, ... }
//   onPick(subject)     tapped subject row { id, name }, or null to mark
//                       attendance for the whole day instead of a subject
//   onBack()            return to ClassPicker
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, ActivityIndicator,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../config/constants';
import s from './styles';
import SyncStatusBar from './SyncStatusBar';
import { listSubjects } from '../../services/attendanceDb';

export default function SubjectPicker({ classRow, onPick, onBack }) {
  const insets = useSafeAreaInsets();
  const [subjects, setSubjects] = useState(null);

  const reload = useCallback(async () => {
    try { setSubjects(await listSubjects(classRow.id)); }
    catch { setSubjects([]); }
  }, [classRow.id]);

  useEffect(() => { reload(); }, [reload]);

  const renderItem = ({ item }) => (
    <TouchableOpacity
      style={s.card}
      onPress={() => onPick(item)}
      activeOpacity={0.75}
      accessibilityLabel={`Open subject ${item.name}`}
    >
      <View style={s.cardRow}>
        <View style={{
          width: 40, height: 40, borderRadius: 10,
          backgroundColor: 'rgba(212,168,67,0.15)',
          alignItems: 'center', justifyContent: 'center', marginRight: 12,
        }}>
          <Ionicons name="book" size={20} color={COLORS.gold} />
        </View>
        <Text style={[s.cardTitle, { flex: 1 }]} numberOfLines={1}>{item.name}</Text>
        <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      {/* Top bar with back ----------------------------------------------- */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 4 }}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={{ padding: 8 }} accessibilityLabel="Back to classes">
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.pageTitle, { marginTop: 4, marginBottom: 2, marginHorizontal: 4 }]}>
            {classRow.name}
          </Text>
          <Text style={[s.pageSub, { marginHorizontal: 4 }]}>Pick a subject</Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <SyncStatusBar />
      </View>

      {subjects === null ? (
        <View style={s.centered}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={s.loadingLabel}>Loading subjects…</Text>
        </View>
      ) : (
        <FlatList
          data={subjects}
          keyExtractor={(it) => String(it.id)}
          renderItem={renderItem}
          contentContainerStyle={[s.scrollPad, subjects.length === 0 && { flexGrow: 1, justifyContent: 'center' }]}
          ListHeaderComponent={
            // Whole-day attendance shortcut — useful when a teacher just wants
            // to mark daily presence and skip the per-subject loop.
            <TouchableOpacity
              style={[s.card, { borderColor: COLORS.primary + '55' }]}
              onPress={() => onPick(null)}
              activeOpacity={0.75}
              accessibilityLabel="Mark whole-day attendance"
            >
              <View style={s.cardRow}>
                <View style={{
                  width: 40, height: 40, borderRadius: 10,
                  backgroundColor: 'rgba(16,185,129,0.18)',
                  alignItems: 'center', justifyContent: 'center', marginRight: 12,
                }}>
                  <Ionicons name="sunny" size={20} color={COLORS.primary} />
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.cardTitle}>Whole day</Text>
                  <Text style={s.cardSub}>Mark daily presence (no subject)</Text>
                </View>
                <Ionicons name="chevron-forward" size={20} color={COLORS.textMuted} />
              </View>
            </TouchableOpacity>
          }
          ListEmptyComponent={
            <View style={{ alignItems: 'center', padding: 40 }}>
              <Ionicons name="folder-open-outline" size={48} color={COLORS.textMuted} style={{ marginBottom: 12 }} />
              <Text style={s.emptyText}>No subjects configured for this class.</Text>
              <Text style={[s.emptyText, { marginTop: 6, fontSize: 13 }]}>
                Tap “Whole day” above to mark daily attendance instead.
              </Text>
            </View>
          }
        />
      )}
    </View>
  );
}
