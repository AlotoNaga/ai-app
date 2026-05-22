// ============================================================
// ATTENDANCE — sync queue
//
// Job: drain attendance_records WHERE synced=0 to the server, in batches
// grouped by (class, subject, date) so the server gets a coherent set per
// call. Idempotency keys (client_id) make every retry safe.
//
// Triggers (in order of preference):
//   1. Explicit user tap ("Sync now" button on the AttendanceScreen).
//   2. NetInfo: connection comes back online.
//   3. App returns to foreground (handled in App.js's AppState listener).
//   4. After a successful local save (immediate first attempt).
//
// Concurrency: a single in-flight worker, gated by `running` flag. Callers
// can fire and forget; if a sync is already running the call resolves to
// the in-flight promise.
//
// Backoff: per-record sync_attempts are bumped on failure, and after 10
// failed attempts we stop retrying that record automatically. The user can
// still trigger an explicit retry via the UI.
// ============================================================

import NetInfo from '@react-native-community/netinfo';
import {
  nextUnsyncedBatch, markSynced, markSyncFailure, pendingSyncCount,
} from './attendanceDb';
import { submitAttendanceBatch, AttendanceApiError } from './attendanceApi';

const MAX_BATCH = 50;
let running = null;     // in-flight Promise, or null
let lastResult = null;  // { syncedCount, failedCount, error? }
const listeners = new Set();

function emit() {
  for (const l of listeners) {
    try { l(lastResult); } catch {}
  }
}

export function onSyncChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getLastResult() { return lastResult; }
export function isRunning() { return !!running; }

// ---- group rows by (class, subject, date) so we send coherent batches ------
function groupBatches(rows) {
  const map = new Map();
  for (const r of rows) {
    const key = `${r.class_server_id}|${r.subject_server_id ?? ''}|${r.date}`;
    if (!map.has(key)) {
      map.set(key, {
        classId: r.class_server_id,
        subjectId: r.subject_server_id,
        date: r.date,
        rows: [],
      });
    }
    map.get(key).rows.push(r);
  }
  return Array.from(map.values());
}

async function syncOnce() {
  // Don't even pull rows from SQLite if we know we have no connectivity —
  // the previous behaviour bumped sync_attempts on every network failure,
  // which silently dead-lettered records after roughly 10 offline saves.
  // For schools without internet this matters: a teacher could mark a
  // week's attendance offline and find half of it stuck on retry-needed.
  let netState = null;
  try { netState = await NetInfo.fetch(); } catch {}
  const offline = netState && (netState.isConnected === false || netState.isInternetReachable === false);
  if (offline) {
    return { syncedCount: 0, failedCount: 0, exhausted: true, deferred: true };
  }

  const rows = await nextUnsyncedBatch(MAX_BATCH);
  if (!rows.length) return { syncedCount: 0, failedCount: 0, exhausted: true };

  let syncedCount = 0, failedCount = 0;
  const batches = groupBatches(rows);

  for (const batch of batches) {
    const payload = batch.rows.map((r) => ({
      client_id: r.client_id,
      student_id: r.student_server_id,
      status: r.status,
      remarks: r.remarks || '',
    }));

    let serverIdMap;
    try {
      serverIdMap = await submitAttendanceBatch({
        classId: batch.classId,
        subjectId: batch.subjectId,
        date: batch.date,
        records: payload,
      });
    } catch (e) {
      // Network failures (no DNS, captive portal, server unreachable) are
      // transient. We do NOT bump sync_attempts for them — otherwise
      // multi-day offline use would burn the 10-retry budget on conditions
      // the device can't do anything about. Just stop the worker; the
      // NetInfo listener will trigger another drain when connectivity
      // actually comes back.
      if (e instanceof AttendanceApiError && e.code === 'network') {
        return { syncedCount, failedCount, error: e, deferred: true };
      }

      // Real server-side rejection (HTTP 4xx/5xx, parse error, etc.):
      // bump attempts so a record that's permanently bad eventually gets
      // dead-lettered and surfaces in the SyncStatusBar for manual retry.
      const msg = e instanceof AttendanceApiError ? e.message : (e.message || 'Sync failed');
      for (const r of batch.rows) {
        try { await markSyncFailure(r.id, msg); } catch {}
        failedCount += 1;
      }
      // Session-expiry stops the whole worker — the user has to log in again
      // before any further sync makes sense.
      if (e instanceof AttendanceApiError && (e.code === 'expired' || e.code === 'no_session')) {
        return { syncedCount, failedCount, error: e };
      }
      continue;
    }

    for (const r of batch.rows) {
      const serverId = serverIdMap[r.client_id];
      try {
        await markSynced(r.id, serverId);
        syncedCount += 1;
      } catch (err) {
        await markSyncFailure(r.id, err.message || 'local update failed');
        failedCount += 1;
      }
    }
  }
  return { syncedCount, failedCount };
}

// ============================================================
// PUBLIC: syncNow — fire-and-forget. Returns a Promise that resolves to a
// summary { syncedCount, failedCount, error? }. Safe to call repeatedly.
// ============================================================
export function syncNow() {
  if (running) return running;
  running = (async () => {
    let totalSynced = 0, totalFailed = 0, error = null, deferred = false;
    // Drain repeatedly so a single call works through more than MAX_BATCH rows.
    for (let i = 0; i < 20; i++) {
      try {
        const r = await syncOnce();
        totalSynced += r.syncedCount;
        totalFailed += r.failedCount;
        if (r.deferred) { deferred = true; if (r.error) error = r.error; break; }
        if (r.error)    { error = r.error; break; }
        if (r.exhausted || r.syncedCount === 0) break;
      } catch (e) {
        error = e;
        break;
      }
    }
    lastResult = {
      syncedCount: totalSynced,
      failedCount: totalFailed,
      pendingAfter: await pendingSyncCount().catch(() => null),
      error,
      deferred,
      at: Date.now(),
    };
    emit();
    return lastResult;
  })().finally(() => { running = null; });
  return running;
}

// ============================================================
// NETWORK LISTENER — kick off a sync when connectivity is restored.
// Safe to call multiple times; subsequent calls are no-ops.
// ============================================================
let netUnsub = null;
export function startNetworkAutoSync() {
  if (netUnsub) return;
  let prevOnline = null;
  netUnsub = NetInfo.addEventListener((state) => {
    const online = !!state.isConnected && state.isInternetReachable !== false;
    if (online && prevOnline === false) syncNow().catch(() => {});
    prevOnline = online;
  });
}

export function stopNetworkAutoSync() {
  if (netUnsub) { netUnsub(); netUnsub = null; }
}
