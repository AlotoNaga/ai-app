// ============================================================
// ATTENDANCE — local SQLite store
//
// Durability requirement: a teacher who marks attendance offline must
// never lose the entry, even if the phone reboots or the app crashes.
// SQLite (via expo-sqlite) gives us that, where AsyncStorage does not.
//
// Tables
//   classes              — teacher's roster of classes (cached from server)
//   subjects             — subject list per class (optional; only if the class
//                          marks per-period attendance)
//   students             — students per class (cached from server)
//   attendance_records   — local entries, unsynced or synced, keyed by a
//                          client-generated UUID for idempotent retries
//
// Sync model
//   Every record is INSERTED locally with synced=0. The sync worker drains
//   unsynced rows, POSTs them, and on success sets synced=1 and stores the
//   server_id. On failure it bumps sync_attempts and stores last_sync_error.
//   Re-submission of the same client_id is safe because the server treats it
//   as an idempotency key (server contract — see ATTENDANCE_API in constants).
// ============================================================

import * as SQLite from 'expo-sqlite';
import * as Crypto from 'expo-crypto';

const DB_NAME = 'nai_attendance.db';
const SCHEMA_VERSION = 1;

let dbPromise = null;

// Single shared handle. expo-sqlite's openDatabaseAsync returns a connection
// that is safe to use from anywhere; serialised inside the native module.
function getDb() {
  if (!dbPromise) dbPromise = SQLite.openDatabaseAsync(DB_NAME);
  return dbPromise;
}

const SCHEMA = [
  `CREATE TABLE IF NOT EXISTS meta (
     key TEXT PRIMARY KEY NOT NULL,
     value TEXT
   )`,
  `CREATE TABLE IF NOT EXISTS classes (
     server_id INTEGER PRIMARY KEY NOT NULL,
     name TEXT NOT NULL,
     section TEXT,
     school_name TEXT,
     has_subjects INTEGER NOT NULL DEFAULT 0,
     fetched_at INTEGER NOT NULL
   )`,
  `CREATE TABLE IF NOT EXISTS subjects (
     server_id INTEGER NOT NULL,
     class_server_id INTEGER NOT NULL,
     name TEXT NOT NULL,
     fetched_at INTEGER NOT NULL,
     PRIMARY KEY (class_server_id, server_id)
   )`,
  `CREATE TABLE IF NOT EXISTS students (
     server_id INTEGER NOT NULL,
     class_server_id INTEGER NOT NULL,
     name TEXT NOT NULL,
     roll_no TEXT,
     fetched_at INTEGER NOT NULL,
     PRIMARY KEY (class_server_id, server_id)
   )`,
  `CREATE TABLE IF NOT EXISTS attendance_records (
     id INTEGER PRIMARY KEY AUTOINCREMENT,
     client_id TEXT NOT NULL UNIQUE,
     class_server_id INTEGER NOT NULL,
     subject_server_id INTEGER,
     date TEXT NOT NULL,
     student_server_id INTEGER NOT NULL,
     status TEXT NOT NULL,
     remarks TEXT,
     marked_at INTEGER NOT NULL,
     synced INTEGER NOT NULL DEFAULT 0,
     sync_attempts INTEGER NOT NULL DEFAULT 0,
     last_sync_error TEXT,
     server_id INTEGER
   )`,
  `CREATE INDEX IF NOT EXISTS idx_att_unsynced
     ON attendance_records(synced, sync_attempts)`,
  `CREATE INDEX IF NOT EXISTS idx_att_lookup
     ON attendance_records(class_server_id, subject_server_id, date)`,
];

// Run once on first use. Multiple parallel callers all await the same setup.
let initPromise = null;
export function initDb() {
  if (!initPromise) initPromise = (async () => {
    const db = await getDb();
    await db.execAsync('PRAGMA journal_mode = WAL;');
    await db.execAsync('PRAGMA foreign_keys = ON;');
    for (const stmt of SCHEMA) await db.execAsync(stmt);
    await db.runAsync(
      `INSERT OR REPLACE INTO meta(key, value) VALUES ('schema_version', ?)`,
      [String(SCHEMA_VERSION)],
    );
  })();
  return initPromise;
}

// ---------- UUID v4 ---------------------------------------------------------
// Uses expo-crypto's CSPRNG-backed randomUUID() so client_ids cannot be guessed
// or accidentally collide via Math.random PRNG state on cold-started devices.
// Falls back to a Math.random implementation only if expo-crypto is missing
// (e.g. running in a stripped test environment) — the server's
// UNIQUE(client_id) constraint catches any weird duplicate.
function uuidFallback() {
  const hex = (n) => Math.floor(Math.random() * 16 ** n).toString(16).padStart(n, '0');
  return `${hex(8)}-${hex(4)}-4${hex(3)}-${(8 + Math.floor(Math.random() * 4)).toString(16)}${hex(3)}-${hex(12)}`;
}

export function uuid() {
  try {
    if (typeof Crypto?.randomUUID === 'function') return Crypto.randomUUID();
  } catch {}
  return uuidFallback();
}

// ============================================================
// CLASSES + STUDENTS — bulk replace pattern
// Server is the source of truth for rosters. Whenever we successfully fetch
// the teacher's class list, we replace the local copy in one transaction so
// removed students disappear cleanly.
// ============================================================
export async function replaceClassesAndStudents(payload) {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM students');
    await db.runAsync('DELETE FROM subjects');
    await db.runAsync('DELETE FROM classes');
    for (const c of payload.classes || []) {
      await db.runAsync(
        `INSERT INTO classes(server_id, name, section, school_name, has_subjects, fetched_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [c.id, c.name || '', c.section || null, c.school_name || null,
         c.has_subjects ? 1 : 0, now],
      );
      for (const s of c.subjects || []) {
        await db.runAsync(
          `INSERT INTO subjects(server_id, class_server_id, name, fetched_at)
           VALUES (?, ?, ?, ?)`,
          [s.id, c.id, s.name || '', now],
        );
      }
      for (const st of c.students || []) {
        await db.runAsync(
          `INSERT INTO students(server_id, class_server_id, name, roll_no, fetched_at)
           VALUES (?, ?, ?, ?, ?)`,
          [st.id, c.id, st.name || '', st.roll_no || null, now],
        );
      }
    }
  });
}

export async function listClasses() {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT server_id AS id, name, section, school_name, has_subjects, fetched_at
     FROM classes ORDER BY name`,
  );
}

export async function listSubjects(classServerId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT server_id AS id, name FROM subjects
     WHERE class_server_id = ? ORDER BY name`,
    [classServerId],
  );
}

export async function listStudents(classServerId) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT server_id AS id, name, roll_no FROM students
     WHERE class_server_id = ?
     ORDER BY CASE WHEN roll_no IS NULL THEN 1 ELSE 0 END,
              CAST(roll_no AS INTEGER), name`,
    [classServerId],
  );
}

export async function rosterFreshness() {
  const db = await getDb();
  const row = await db.getFirstAsync(`SELECT MAX(fetched_at) AS t FROM classes`);
  return row?.t || 0;
}

// ============================================================
// ATTENDANCE — record CRUD
// ============================================================
export async function todayString(d = new Date()) {
  // Local date YYYY-MM-DD (avoid UTC drift — teachers in IST are +5:30).
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

// Save a full set of records for a class+subject+date in one transaction.
// If a record for the same (class, subject, date, student) already exists
// locally and is still unsynced, we OVERWRITE it (teacher correcting a typo
// before it ever left the device). Already-synced records get a NEW row so
// the server sees an explicit edit and can audit it.
export async function saveAttendanceBatch({ classId, subjectId, date, records }) {
  const db = await getDb();
  const now = Date.now();
  await db.withTransactionAsync(async () => {
    for (const r of records) {
      const existing = await db.getFirstAsync(
        `SELECT id, synced FROM attendance_records
         WHERE class_server_id = ? AND IFNULL(subject_server_id, -1) = IFNULL(?, -1)
           AND date = ? AND student_server_id = ?
         ORDER BY id DESC LIMIT 1`,
        [classId, subjectId ?? null, date, r.student_id],
      );
      if (existing && !existing.synced) {
        await db.runAsync(
          `UPDATE attendance_records
             SET status = ?, remarks = ?, marked_at = ?,
                 sync_attempts = 0, last_sync_error = NULL
           WHERE id = ?`,
          [r.status, r.remarks || null, now, existing.id],
        );
      } else {
        await db.runAsync(
          `INSERT INTO attendance_records
             (client_id, class_server_id, subject_server_id, date,
              student_server_id, status, remarks, marked_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
          [uuid(), classId, subjectId ?? null, date,
           r.student_id, r.status, r.remarks || null, now],
        );
      }
    }
  });
}

// Returns the latest local status per student for a given class+subject+date,
// merging unsynced edits over synced records. Used to pre-fill the roster UI.
export async function getAttendanceFor({ classId, subjectId, date }) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT student_server_id AS student_id, status, remarks, synced, marked_at
       FROM attendance_records
      WHERE class_server_id = ?
        AND IFNULL(subject_server_id, -1) = IFNULL(?, -1)
        AND date = ?
      AND id IN (
        SELECT MAX(id) FROM attendance_records
         WHERE class_server_id = ?
           AND IFNULL(subject_server_id, -1) = IFNULL(?, -1)
           AND date = ?
         GROUP BY student_server_id
      )`,
    [classId, subjectId ?? null, date, classId, subjectId ?? null, date],
  );
}

export async function pendingSyncCount() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM attendance_records WHERE synced = 0`,
  );
  return row?.n || 0;
}

// Records the auto-sync worker has given up on (sync_attempts >= 10).
// Surfaced to the UI so a teacher can see that some entries need a manual
// retry instead of silently believing everything synced.
export async function deadLetteredSyncCount() {
  const db = await getDb();
  const row = await db.getFirstAsync(
    `SELECT COUNT(*) AS n FROM attendance_records
      WHERE synced = 0 AND sync_attempts >= 10`,
  );
  return row?.n || 0;
}

// Reset attempt counters for dead-lettered rows so the next syncNow() picks
// them up again. Called from the SyncStatusBar's manual "Retry stuck" tap.
export async function resetDeadLetteredAttempts() {
  const db = await getDb();
  const r = await db.runAsync(
    `UPDATE attendance_records
        SET sync_attempts = 0, last_sync_error = NULL
      WHERE synced = 0 AND sync_attempts >= 10`,
  );
  return r?.changes || 0;
}

export async function nextUnsyncedBatch(limit = 50) {
  const db = await getDb();
  return db.getAllAsync(
    `SELECT id, client_id, class_server_id, subject_server_id, date,
            student_server_id, status, remarks, marked_at, sync_attempts
       FROM attendance_records
      WHERE synced = 0
        AND sync_attempts < 10
      ORDER BY id ASC
      LIMIT ?`,
    [limit],
  );
}

export async function markSynced(localId, serverId) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE attendance_records
        SET synced = 1, server_id = ?, last_sync_error = NULL
      WHERE id = ?`,
    [serverId ?? null, localId],
  );
}

export async function markSyncFailure(localId, errorMessage) {
  const db = await getDb();
  await db.runAsync(
    `UPDATE attendance_records
        SET sync_attempts = sync_attempts + 1, last_sync_error = ?
      WHERE id = ?`,
    [String(errorMessage || '').slice(0, 500), localId],
  );
}

// Hard reset — exposed only via Settings, not used in normal flow.
export async function clearAll() {
  const db = await getDb();
  await db.withTransactionAsync(async () => {
    await db.runAsync('DELETE FROM attendance_records');
    await db.runAsync('DELETE FROM students');
    await db.runAsync('DELETE FROM subjects');
    await db.runAsync('DELETE FROM classes');
  });
}
