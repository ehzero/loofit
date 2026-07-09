export const DATABASE_NAME = 'loofit.db';
export const DATABASE_VERSION = 1;

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

CREATE INDEX IF NOT EXISTS idx_sessions_status_started_at
  ON workout_sessions(status, started_at);

CREATE INDEX IF NOT EXISTS idx_session_parts_session_id
  ON workout_session_parts_snapshot(workout_session_id);
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
