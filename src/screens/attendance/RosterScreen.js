// ============================================================
// RosterScreen — the actual attendance-marking surface.
//
// Per student: three statuses cycle on tap of the row, or you can tap a
// specific badge (P / A / L) directly. "Mark all present" sets every row
// to Present in one shot — the common case — then the teacher only
// flips the absentees.
//
// Save:
//   1. Persist the batch to SQLite locally (saveAttendanceBatch).
//   2. Fire syncNow() so an online teacher sees "All synced" within
//      a second; an offline teacher's records are queued.
//   3. Pop back to the previous screen via onSaved().
//
// Pre-fill: getAttendanceFor() returns the latest local status per student
// (unsynced edits beat synced ones). On first open of a class+subject+date
// we default to no selection — the teacher must mark someone before save
// is enabled. That avoids accidentally submitting an all-absent batch.
//
// Props:
//   classRow             { id, name, ... }
//   subject              { id, name } | null  (null = whole-day)
//   onBack()             go back without saving
//   onSaved(summary)     after a successful local save
//   onSessionExpired()   bubbled up if a sync attempt 401s
// ============================================================

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import {
  View, Text, TouchableOpacity, FlatList, Alert, ActivityIndicator,
  TextInput,
} from 'react-native';
import Ionicons from '@expo/vector-icons/Ionicons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { COLORS } from '../../config/constants';
import s from './styles';
import SyncStatusBar from './SyncStatusBar';
import {
  listStudents, getAttendanceFor, saveAttendanceBatch, todayString,
} from '../../services/attendanceDb';
import { syncNow } from '../../services/attendanceSync';

const STATUSES = [
  { key: 'present', label: 'P', name: 'Present', color: COLORS.primary },
  { key: 'absent',  label: 'A', name: 'Absent',  color: COLORS.danger },
  { key: 'late',    label: 'L', name: 'Late',    color: COLORS.warning },
];
const STATUS_BY_KEY = STATUSES.reduce((a, x) => (a[x.key] = x, a), {});
function nextStatus(current) {
  const idx = STATUSES.findIndex((x) => x.key === current);
  return STATUSES[(idx + 1) % STATUSES.length].key;
}

export default function RosterScreen({ classRow, subject, onBack, onSaved, onSessionExpired }) {
  const insets = useSafeAreaInsets();
  const [students, setStudents]   = useState(null);  // null = loading
  const [loadError, setLoadError] = useState(null);  // non-null = roster load failed
  // marks: { [studentId]: 'present' | 'absent' | 'late' }
  const [marks, setMarks]         = useState({});
  const [remarks, setRemarks]     = useState({}); // { [studentId]: string }
  const [saving, setSaving]       = useState(false);
  const [showRemarkFor, setShowRemarkFor] = useState(null);
  const date = useMemo(() => todayString(), []);
  const subjectId = subject?.id ?? null;

  const loadRoster = useCallback(async () => {
    setStudents(null);
    setLoadError(null);
    try {
      const [stud, existing] = await Promise.all([
        listStudents(classRow.id),
        getAttendanceFor({ classId: classRow.id, subjectId, date }),
      ]);
      const mk = {}, rm = {};
      for (const r of existing) {
        mk[r.student_id] = r.status;
        if (r.remarks) rm[r.student_id] = r.remarks;
      }
      setMarks(mk);
      setRemarks(rm);
      setStudents(stud);
    } catch (e) {
      // Surface the error rather than pretending the class is empty. A
      // silent setStudents([]) used to render the "no students" empty
      // state, leading teachers to assume admin had removed the roster.
      setLoadError(e?.message || 'Could not load students.');
      setStudents([]);
    }
  }, [classRow.id, subjectId, date]);

  // subjectId / classRow.id / date are scalars so the effect re-fires only
  // on real changes — not on every parent re-render the way the previous
  // `subject` (object) dep did.
  useEffect(() => { loadRoster(); }, [loadRoster]);

  const setMark = useCallback((studentId, status) => {
    setMarks((prev) => ({ ...prev, [studentId]: status }));
  }, []);

  const cycleMark = useCallback((studentId) => {
    setMarks((prev) => {
      const cur = prev[studentId];
      return { ...prev, [studentId]: cur ? nextStatus(cur) : 'present' };
    });
  }, []);

  const markAllPresent = () => {
    if (!students) return;
    const next = {};
    for (const st of students) next[st.id] = 'present';
    setMarks(next);
  };

  const counts = useMemo(() => {
    const c = { present: 0, absent: 0, late: 0, unmarked: 0 };
    if (!students) return c;
    for (const st of students) {
      const k = marks[st.id];
      if (k && c[k] != null) c[k] += 1;
      else c.unmarked += 1;
    }
    return c;
  }, [students, marks]);

  const markedCount = students ? students.length - counts.unmarked : 0;

  const onSave = async () => {
    if (!students || markedCount === 0) {
      Alert.alert('Nothing to save', 'Mark at least one student before saving.');
      return;
    }
    if (counts.unmarked > 0) {
      // Confirm once when some students aren't marked — common cause is the
      // teacher forgetting to flip absentees after "Mark all present".
      const ok = await new Promise((resolve) => {
        Alert.alert(
          'Some students are unmarked',
          `${counts.unmarked} student(s) have no status. Save anyway? They will not be submitted.`,
          [
            { text: 'Cancel', style: 'cancel', onPress: () => resolve(false) },
            { text: 'Save', onPress: () => resolve(true) },
          ],
        );
      });
      if (!ok) return;
    }

    setSaving(true);
    try {
      const records = students
        .filter((st) => marks[st.id])
        .map((st) => ({
          student_id: st.id,
          status: marks[st.id],
          remarks: remarks[st.id] || '',
        }));
      await saveAttendanceBatch({
        classId: classRow.id,
        subjectId: subject?.id ?? null,
        date,
        records,
      });

      // Best-effort immediate sync. Offline failure is fine — the queue keeps
      // the records and NetInfo will retry. Session expiry bubbles up so the
      // orchestrator can drop us back to login.
      const result = await syncNow();
      if (result?.error) {
        const code = result.error.code;
        if (code === 'expired' || code === 'no_session') {
          onSessionExpired?.();
          return;
        }
      }

      onSaved?.({
        savedCount: records.length,
        synced: result?.failedCount === 0 && !result?.error,
      });
    } catch (e) {
      Alert.alert('Could not save', e.message || 'Something went wrong saving locally.');
    } finally {
      // Always release the button — otherwise the success path would leave it
      // disabled forever if the parent doesn't unmount us (e.g. RosterScreen
      // is reused for a follow-up batch on the same class+subject+date).
      setSaving(false);
    }
  };

  // --------------------------------------------------------------------------
  const renderStudent = ({ item }) => {
    const cur = marks[item.id];
    const showRemark = showRemarkFor === item.id;
    return (
      <View>
        <TouchableOpacity
          style={s.studentRow}
          onPress={() => cycleMark(item.id)}
          onLongPress={() => setShowRemarkFor(showRemark ? null : item.id)}
          activeOpacity={0.7}
          accessibilityLabel={`${item.name}, current status ${cur || 'unmarked'}`}
        >
          {item.roll_no ? (
            <Text style={s.studentRoll}>{item.roll_no}</Text>
          ) : <View style={{ width: 40 }} />}
          <Text style={s.studentName} numberOfLines={1}>{item.name}</Text>
          <View style={s.segGroup}>
            {STATUSES.map((st) => {
              const active = cur === st.key;
              return (
                <TouchableOpacity
                  key={st.key}
                  style={[
                    s.segBtn,
                    active && { backgroundColor: st.color, borderColor: st.color },
                  ]}
                  onPress={() => setMark(item.id, st.key)}
                  hitSlop={6}
                  accessibilityLabel={`${st.name} ${item.name}`}
                >
                  <Text style={[s.segBtnText, active && { color: '#FFF' }]}>{st.label}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </TouchableOpacity>

        {showRemark && (
          <View style={[s.inputWrap, { marginHorizontal: 0, marginTop: -4, marginBottom: 12 }]}>
            <Ionicons name="create-outline" size={16} color={COLORS.textMuted} style={{ marginRight: 8 }} />
            <TextInput
              style={s.input}
              placeholder="Optional remark (e.g. medical leave)"
              placeholderTextColor={COLORS.textMuted}
              value={remarks[item.id] || ''}
              onChangeText={(t) => setRemarks((p) => ({ ...p, [item.id]: t }))}
              maxLength={200}
            />
          </View>
        )}
      </View>
    );
  };

  // --------------------------------------------------------------------------
  return (
    <View style={[s.root, { paddingTop: insets.top + 8 }]}>
      {/* Top bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 8, marginBottom: 4 }}>
        <TouchableOpacity onPress={onBack} hitSlop={10} style={{ padding: 8 }} accessibilityLabel="Back">
          <Ionicons name="chevron-back" size={24} color="#FFF" />
        </TouchableOpacity>
        <View style={{ flex: 1 }}>
          <Text style={[s.pageTitle, { marginTop: 4, marginBottom: 2, marginHorizontal: 4 }]}>
            {classRow.name}
          </Text>
          <Text style={[s.pageSub, { marginHorizontal: 4 }]}>
            {(subject?.name || 'Whole day') + ' · ' + date}
          </Text>
        </View>
      </View>

      <View style={{ paddingHorizontal: 16, marginBottom: 12 }}>
        <SyncStatusBar />
      </View>

      {/* Counts strip + bulk action ----------------------------------------*/}
      {students && students.length > 0 && (
        <View style={{
          flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
          paddingHorizontal: 16, marginBottom: 8,
        }}>
          <Text style={{ color: COLORS.textSecondary, fontSize: 13 }}>
            <Text style={{ color: COLORS.primary, fontWeight: '700' }}>{counts.present}</Text>
            {' P · '}
            <Text style={{ color: COLORS.danger, fontWeight: '700' }}>{counts.absent}</Text>
            {' A · '}
            <Text style={{ color: COLORS.warning, fontWeight: '700' }}>{counts.late}</Text>
            {' L · '}
            <Text style={{ color: COLORS.textMuted }}>{counts.unmarked} unmarked</Text>
          </Text>
          <TouchableOpacity onPress={markAllPresent} hitSlop={8}>
            <Text style={{ color: COLORS.primary, fontSize: 12, fontWeight: '700' }}>MARK ALL P</Text>
          </TouchableOpacity>
        </View>
      )}

      {students === null ? (
        <View style={s.centered}>
          <ActivityIndicator color={COLORS.primary} />
          <Text style={s.loadingLabel}>Loading students…</Text>
        </View>
      ) : loadError ? (
        <View style={s.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={COLORS.danger} />
          <Text style={[s.emptyText, { marginTop: 12 }]}>Could not load students.</Text>
          <Text style={[s.emptyText, { marginTop: 6, fontSize: 13 }]}>{loadError}</Text>
          <TouchableOpacity
            onPress={loadRoster}
            style={{ marginTop: 16, paddingHorizontal: 20, paddingVertical: 10, borderRadius: 10, backgroundColor: COLORS.primary }}
            accessibilityLabel="Retry loading students"
          >
            <Text style={{ color: '#FFF', fontWeight: '700' }}>Retry</Text>
          </TouchableOpacity>
        </View>
      ) : students.length === 0 ? (
        <View style={s.centered}>
          <Ionicons name="people-outline" size={48} color={COLORS.textMuted} />
          <Text style={[s.emptyText, { marginTop: 12 }]}>
            No students in this class yet.
          </Text>
          <Text style={[s.emptyText, { marginTop: 6, fontSize: 13 }]}>
            Pull-to-refresh on the previous screen to update the roster.
          </Text>
        </View>
      ) : (
        <FlatList
          data={students}
          keyExtractor={(st) => String(st.id)}
          renderItem={renderStudent}
          contentContainerStyle={[s.scrollPad, { paddingBottom: 96 + insets.bottom }]}
          keyboardShouldPersistTaps="handled"
          ListFooterComponent={
            <Text style={s.hint}>Tap a row to cycle P → A → L. Long-press to add an optional remark.</Text>
          }
        />
      )}

      {/* Save bar fixed to bottom ----------------------------------------- */}
      {students && students.length > 0 && (
        <View style={{
          position: 'absolute', left: 0, right: 0,
          bottom: Math.max(insets.bottom, 12),
          paddingHorizontal: 16,
        }}>
          <TouchableOpacity
            style={[s.primaryBtn, (saving || markedCount === 0) && s.primaryBtnDisabled]}
            onPress={onSave}
            disabled={saving || markedCount === 0}
            activeOpacity={0.8}
          >
            {saving ? (
              <ActivityIndicator color="#FFF" />
            ) : (
              <>
                <Ionicons name="save" size={20} color="#FFF" style={{ marginRight: 8 }} />
                <Text style={s.primaryBtnText}>
                  {markedCount === 0 ? 'Mark students to save'
                    : `Save Attendance (${markedCount}/${students.length})`}
                </Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
