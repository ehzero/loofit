export const DATABASE_NAME = 'loofit.db';
export const DATABASE_VERSION = 2;

const WIDGET_SYNC_TRACKED_TABLES = [
  'body_parts',
  'routines',
  'routine_days',
  'routine_day_parts',
  'workout_sessions',
  'workout_session_parts_snapshot',
  'routine_progress',
  'app_settings',
] as const;

const WIDGET_SYNC_TRIGGER_SQL = WIDGET_SYNC_TRACKED_TABLES.flatMap((table) =>
  (['INSERT', 'UPDATE', 'DELETE'] as const).map(
    (operation) => `
CREATE TRIGGER IF NOT EXISTS widget_sync_${table}_${operation.toLowerCase()}
AFTER ${operation} ON ${table}
BEGIN
  UPDATE widget_sync_state
  SET desired_revision = desired_revision + 1,
      updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
  WHERE id = 1;
END;`
  )
).join('\n');

export const MIGRATION_SQL = `
CREATE TABLE IF NOT EXISTS body_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  color TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  is_archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routines (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  is_active INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_days (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id INTEGER NOT NULL,
  name TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_day_parts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_day_id INTEGER NOT NULL,
  body_part_id INTEGER NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  routine_id INTEGER,
  routine_day_id INTEGER,
  started_at TEXT NOT NULL,
  ended_at TEXT,
  duration_seconds INTEGER NOT NULL DEFAULT 0,
  status TEXT NOT NULL CHECK (status IN ('active', 'completed', 'canceled')),
  note TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS workout_session_parts_snapshot (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  workout_session_id INTEGER NOT NULL,
  body_part_id INTEGER,
  body_part_name TEXT NOT NULL,
  body_part_color TEXT NOT NULL,
  sort_order INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS routine_progress (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  active_routine_id INTEGER,
  next_routine_day_id INTEGER,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS widget_sync_state (
  id INTEGER PRIMARY KEY CHECK (id = 1),
  desired_revision INTEGER NOT NULL DEFAULT 1,
  published_revision INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  updated_at TEXT NOT NULL
);

INSERT OR IGNORE INTO widget_sync_state
  (id, desired_revision, published_revision, last_error, updated_at)
VALUES
  (1, 1, 0, NULL, strftime('%Y-%m-%dT%H:%M:%fZ', 'now'));

CREATE INDEX IF NOT EXISTS idx_sessions_status_started_at
  ON workout_sessions(status, started_at);

CREATE INDEX IF NOT EXISTS idx_session_parts_session_id
  ON workout_session_parts_snapshot(workout_session_id);

-- Older experimental builds could create more than one active row because
-- the single-active rule only lived in application code. Preserve the newest
-- session and turn the rest into canceled history before adding the invariant.
UPDATE workout_sessions
SET status = 'canceled',
    ended_at = COALESCE(ended_at, strftime('%Y-%m-%dT%H:%M:%fZ', 'now')),
    duration_seconds = CAST(MAX(
      0,
      (julianday('now') - COALESCE(julianday(started_at), julianday('now'))) * 86400
    ) AS INTEGER),
    updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
WHERE status = 'active'
  AND id NOT IN (
    SELECT id
    FROM workout_sessions
    WHERE status = 'active'
    ORDER BY started_at DESC, id DESC
    LIMIT 1
  );

CREATE UNIQUE INDEX IF NOT EXISTS idx_sessions_single_active
  ON workout_sessions(status)
  WHERE status = 'active';

${WIDGET_SYNC_TRIGGER_SQL}
`;

export const DEFAULT_BODY_PARTS = [
  { name: '가슴', color: '#E84A5F' },
  { name: '등', color: '#2A9D8F' },
  { name: '하체', color: '#F4A261' },
  { name: '어깨', color: '#6C63FF' },
  { name: '팔', color: '#457B9D' },
  { name: '삼두', color: '#F77F00' },
  { name: '이두', color: '#0077B6' },
  { name: '유산소', color: '#43AA8B' },
  { name: '상체', color: '#D62828' },
  { name: '푸시', color: '#9B5DE5' },
  { name: '풀', color: '#00A6FB' },
  { name: '코어', color: '#FFB703' },
  { name: '기타', color: '#6C757D' },
] as const;
