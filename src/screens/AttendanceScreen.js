// ============================================================
// AttendanceScreen — orchestrator for the offline attendance feature.
//
// Owns navigation between the four sub-views and the small amount of
// session-level state. The sub-views themselves are dumb leaves: they
// take props, fire callbacks, and never know about each other.
//
// View flow:
//   boot           checking SecureStore for an existing session
//   login          AttendanceLogin            (no session)
//   classes        ClassPicker                (signed in)
//   subjects       SubjectPicker              (class has subjects)
//   roster         RosterScreen               (marking attendance)
//
// Side effects on mount:
//   - initDb()                ensure SQLite schema exists
//   - startNetworkAutoSync()  drain the queue when network returns
//   - syncNow() (best-effort) on entry, in case the screen reopens
//                             while there are pending records
// ============================================================

import React, { useEffect, useState, useCallback } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { COLORS } from '../config/constants';
import { initDb, replaceClassesAndStudents } from '../services/attendanceDb';
import { loadSession, clearSession } from '../services/attendanceApi';
import { syncNow, startNetworkAutoSync, stopNetworkAutoSync } from '../services/attendanceSync';

import AttendanceLogin from './attendance/AttendanceLogin';
import ClassPicker     from './attendance/ClassPicker';
import SubjectPicker   from './attendance/SubjectPicker';
import RosterScreen    from './attendance/RosterScreen';

const VIEW = {
  BOOT: 'boot', LOGIN: 'login', CLASSES: 'classes',
  SUBJECTS: 'subjects', ROSTER: 'roster',
};

export default function AttendanceScreen() {
  const [view, setView]       = useState(VIEW.BOOT);
  const [teacher, setTeacher] = useState(null);
  const [classRow, setClass]  = useState(null);
  const [subject, setSubject] = useState(null); // null = whole-day
  const [bootError, setBootError] = useState('');

  // ---- mount: init SQLite, restore session, start auto-sync --------------
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        await initDb();
        startNetworkAutoSync();
        // Best-effort drain — failures are surfaced via SyncStatusBar.
        syncNow().catch(() => {});

        const s = await loadSession();
        if (!alive) return;
        if (s?.teacher && s?.cookie) {
          setTeacher(s.teacher);
          setView(VIEW.CLASSES);
        } else {
          setView(VIEW.LOGIN);
        }
      } catch (e) {
        if (!alive) return;
        setBootError(e?.message || 'Could not initialise attendance storage.');
        setView(VIEW.LOGIN);
      }
    })();
    return () => {
      alive = false;
      stopNetworkAutoSync();
    };
  }, []);

  // ---- callbacks --------------------------------------------------------
  const handleSignedIn = useCallback(async ({ teacher: t, classes }) => {
    // Login already returned the class list — write it to SQLite right
    // away so ClassPicker can render from the cache without a second
    // network call. Failure here is logged but not fatal: the picker
    // will pull-to-refresh.
    try { await replaceClassesAndStudents({ classes }); }
    catch (e) { console.warn('Cache classes failed:', e?.message); }
    setTeacher(t);
    setView(VIEW.CLASSES);
  }, []);

  const handleSessionExpired = useCallback(async () => {
    await clearSession();
    setTeacher(null); setClass(null); setSubject(null);
    setView(VIEW.LOGIN);
    Alert.alert('Session Expired', 'Please sign in again to continue.');
  }, []);

  const handleSignOut = useCallback(async () => {
    await clearSession();
    setTeacher(null); setClass(null); setSubject(null);
    setView(VIEW.LOGIN);
  }, []);

  const handlePickClass = useCallback((c) => {
    setClass(c);
    setSubject(null);
    setView(c.has_subjects ? VIEW.SUBJECTS : VIEW.ROSTER);
  }, []);

  const handlePickSubject = useCallback((subj) => {
    setSubject(subj);                 // null when "Whole day" is tapped
    setView(VIEW.ROSTER);
  }, []);

  const handleBackToClasses = useCallback(() => {
    setClass(null); setSubject(null);
    setView(VIEW.CLASSES);
  }, []);

  const handleBackToSubjects = useCallback(() => {
    if (classRow?.has_subjects) {
      setSubject(null);
      setView(VIEW.SUBJECTS);
    } else {
      handleBackToClasses();
    }
  }, [classRow, handleBackToClasses]);

  const handleSaved = useCallback(({ savedCount, synced }) => {
    Alert.alert(
      'Attendance Saved',
      synced
        ? `Marked ${savedCount} student(s). Synced to server.`
        : `Marked ${savedCount} student(s). Will sync when online.`,
    );
    handleBackToClasses();
  }, [handleBackToClasses]);

  // ---- render -----------------------------------------------------------
  if (view === VIEW.BOOT) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={COLORS.primary} />
        <Text style={styles.bootText}>Preparing attendance…</Text>
        {bootError ? <Text style={styles.bootErr}>{bootError}</Text> : null}
      </View>
    );
  }

  if (view === VIEW.LOGIN) {
    return <AttendanceLogin onSignedIn={handleSignedIn} />;
  }

  if (view === VIEW.CLASSES) {
    return (
      <ClassPicker
        teacher={teacher}
        onPick={handlePickClass}
        onSignOut={handleSignOut}
        onSessionExpired={handleSessionExpired}
      />
    );
  }

  if (view === VIEW.SUBJECTS && classRow) {
    return (
      <SubjectPicker
        classRow={classRow}
        onPick={handlePickSubject}
        onBack={handleBackToClasses}
      />
    );
  }

  if (view === VIEW.ROSTER && classRow) {
    return (
      <RosterScreen
        classRow={classRow}
        subject={subject}
        onBack={handleBackToSubjects}
        onSaved={handleSaved}
        onSessionExpired={handleSessionExpired}
      />
    );
  }

  // Defensive fallback — should never hit this, but if state ever desyncs
  // (e.g. classRow cleared while view is still ROSTER) we drop the user
  // back to a known-good place rather than rendering nothing.
  return (
    <View style={styles.boot}>
      <ActivityIndicator color={COLORS.primary} />
    </View>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1, backgroundColor: COLORS.background,
    alignItems: 'center', justifyContent: 'center', padding: 24,
  },
  bootText: { color: COLORS.textSecondary, fontSize: 14, marginTop: 12 },
  bootErr:  { color: COLORS.danger, fontSize: 13, marginTop: 12, textAlign: 'center' },
});
