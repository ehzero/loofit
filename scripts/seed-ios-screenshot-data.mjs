#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { DatabaseSync } from 'node:sqlite';

const APP_IDENTIFIER = 'com.loofit.app';
const APP_GROUP_IDENTIFIER = 'group.com.loofit.app';
const DATABASE_VERSION = 1;
const VALID_STATES = new Set(['pre', 'active', 'post']);

const options = parseArguments(process.argv.slice(2));
const device = options.device;
const state = options.state ?? 'pre';

if (!device) {
  fail('Usage: node scripts/seed-ios-screenshot-data.mjs --device <UDID> --state <pre|active|post>');
}
if (!VALID_STATES.has(state)) {
  fail(`Unknown screenshot state: ${state}`);
}

try {
  execFileSync('xcrun', ['simctl', 'terminate', device, APP_IDENTIFIER], {
    stdio: 'ignore',
  });
} catch {
  // The app may not be running yet.
}

const groupDirectory = execFileSync(
  'xcrun',
  ['simctl', 'get_app_container', device, APP_IDENTIFIER, APP_GROUP_IDENTIFIER],
  { encoding: 'utf8' }
).trim();
const databasePath = path.join(groupDirectory, 'LoofitWidgets', 'loofit.db');

if (!groupDirectory.includes('/Library/Developer/CoreSimulator/Devices/')) {
  fail(`Refusing to seed a non-simulator container: ${groupDirectory}`);
}
if (!fs.existsSync(databasePath)) {
  fail(`Screenshot database does not exist. Launch the app once first: ${databasePath}`);
}

const database = new DatabaseSync(databasePath);
database.exec('PRAGMA busy_timeout = 5000');

const schemaVersion = database.prepare('PRAGMA user_version').get().user_version;
if (schemaVersion !== DATABASE_VERSION) {
  database.close();
  fail(`Expected schema version ${DATABASE_VERSION}, found ${schemaVersion}`);
}

const syncState = database
  .prepare('SELECT id FROM widget_sync_state WHERE id = 1')
  .get();
if (!syncState) {
  database.close();
  fail('widget_sync_state singleton is missing; launch a clean app build before seeding');
}

database.exec('BEGIN IMMEDIATE');
try {
  replaceScreenshotFixtures(database, state);
  database.exec('COMMIT');
} catch (error) {
  database.exec('ROLLBACK');
  database.close();
  throw error;
}

const integrity = database.prepare('PRAGMA integrity_check').get().integrity_check;
const activeCount = database
  .prepare("SELECT COUNT(*) AS count FROM workout_sessions WHERE status = 'active'")
  .get().count;
const orphanParts = database
  .prepare(
    `SELECT COUNT(*) AS count
     FROM workout_session_parts_snapshot snapshot
     LEFT JOIN workout_sessions session ON session.id = snapshot.workout_session_id
     WHERE session.id IS NULL`
  )
  .get().count;
const summary = database
  .prepare(
    `SELECT
       (SELECT COUNT(*) FROM workout_sessions WHERE status = 'completed') AS completed,
       (SELECT COUNT(*) FROM workout_sessions WHERE status = 'active') AS active,
       (SELECT rd.name
          FROM routine_progress rp
          JOIN routine_days rd ON rd.id = rp.next_routine_day_id
         WHERE rp.id = 1) AS next_day,
       (SELECT desired_revision FROM widget_sync_state WHERE id = 1) AS desired_revision,
       (SELECT published_revision FROM widget_sync_state WHERE id = 1) AS published_revision`
  )
  .get();

database.close();

if (integrity !== 'ok' || orphanParts !== 0 || activeCount !== (state === 'active' ? 1 : 0)) {
  fail(
    `Fixture validation failed: integrity=${integrity}, active=${activeCount}, orphanParts=${orphanParts}`
  );
}

console.log(
  JSON.stringify(
    {
      device,
      state,
      databasePath,
      ...summary,
    },
    null,
    2
  )
);

function replaceScreenshotFixtures(database, screenshotState) {
  const now = new Date();
  const nowIso = now.toISOString();

  database.exec(`
    DELETE FROM workout_session_parts_snapshot;
    DELETE FROM workout_sessions;
    DELETE FROM routine_day_parts;
    DELETE FROM routine_days;
    DELETE FROM routines;
    DELETE FROM routine_progress;
  `);

  const requiredParts = ['가슴', '등', '하체', '어깨', '삼두', '이두'];
  const partRows = database
    .prepare(
      `SELECT id, name, color
       FROM body_parts
       WHERE is_archived = 0
       ORDER BY sort_order, id`
    )
    .all();
  const partsByName = new Map(partRows.map((part) => [part.name, part]));

  for (const partName of requiredParts) {
    if (!partsByName.has(partName)) {
      throw new Error(`Required body part is missing: ${partName}`);
    }
  }

  const insertRoutine = database.prepare(
    `INSERT INTO routines (name, is_active, created_at, updated_at)
     VALUES (?, 1, ?, ?)`
  );
  const routineId = Number(insertRoutine.run('PPL', nowIso, nowIso).lastInsertRowid);

  const insertDay = database.prepare(
    `INSERT INTO routine_days (routine_id, name, sort_order, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?)`
  );
  const insertDayPart = database.prepare(
    `INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order)
     VALUES (?, ?, ?)`
  );

  const routineDefinitions = [
    { name: 'Push', parts: ['가슴', '어깨', '삼두'] },
    { name: 'Pull', parts: ['등', '이두'] },
    { name: 'Legs', parts: ['하체'] },
  ];
  const routineDays = new Map();

  for (const [dayIndex, definition] of routineDefinitions.entries()) {
    const dayId = Number(
      insertDay.run(routineId, definition.name, dayIndex, nowIso, nowIso).lastInsertRowid
    );
    const day = {
      id: dayId,
      name: definition.name,
      parts: definition.parts.map((partName) => partsByName.get(partName)),
    };
    routineDays.set(definition.name, day);
    day.parts.forEach((part, partIndex) => {
      insertDayPart.run(dayId, part.id, partIndex);
    });
  }

  const insertSession = database.prepare(
    `INSERT INTO workout_sessions
     (routine_id, routine_day_id, routine_day_name_snapshot, started_at, ended_at,
      duration_seconds, status, note, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  );
  const insertSessionPart = database.prepare(
    `INSERT INTO workout_session_parts_snapshot
     (workout_session_id, body_part_id, body_part_name, body_part_color, sort_order)
     VALUES (?, ?, ?, ?, ?)`
  );

  function addRoutineSession({
    dayName,
    startedAt,
    durationMinutes,
    status = 'completed',
    note = null,
  }) {
    const day = routineDays.get(dayName);
    const endedAt =
      status === 'active'
        ? null
        : new Date(startedAt.getTime() + durationMinutes * 60_000);
    const sessionId = Number(
      insertSession.run(
        routineId,
        day.id,
        day.name,
        startedAt.toISOString(),
        endedAt?.toISOString() ?? null,
        status === 'active' ? 0 : durationMinutes * 60,
        status,
        note,
        startedAt.toISOString(),
        (endedAt ?? startedAt).toISOString()
      ).lastInsertRowid
    );
    day.parts.forEach((part, partIndex) => {
      insertSessionPart.run(sessionId, part.id, part.name, part.color, partIndex);
    });
    return sessionId;
  }

  const durationPattern = [
    68, 76, 84, 62, 89, 73, 81, 66, 87, 79,
    94, 58, 112, 71, 85, 43, 138, 64, 78, 90,
  ];
  const weeklyWorkoutDayPatterns = [
    [1, 2, 3, 5, 6],
    [0, 1, 3, 4, 5, 6],
    [1, 2, 4, 5],
    [0, 2, 3, 4, 6],
    [1, 2, 3, 4, 5, 6],
    [0, 1, 3, 5, 6],
  ];
  let historyIndex = 0;

  // Most weeks contain five or six workouts, with an occasional four-day
  // recovery week. Rotating weekday patterns avoids an artificial fixed-day
  // streak while keeping the PPL split in completion order.
  for (let daysAgo = 330; daysAgo >= 15; daysAgo -= 1) {
    const date = localDateDaysAgo(now, daysAgo, 18 + (historyIndex % 2), (historyIndex * 7) % 50);
    const patternIndex = calendarWeekIndex(date) % weeklyWorkoutDayPatterns.length;
    if (!weeklyWorkoutDayPatterns[patternIndex].includes(date.getDay())) {
      continue;
    }
    const definition = routineDefinitions[historyIndex % routineDefinitions.length];
    addRoutineSession({
      dayName: definition.name,
      startedAt: date,
      durationMinutes: durationPattern[historyIndex % durationPattern.length],
      note: historyIndex % 11 === 0 ? '좋은 흐름으로 마무리' : null,
    });
    historyIndex += 1;
  }

  const recentHistory = [
    { daysAgo: 14, dayName: 'Push', duration: 74 },
    { daysAgo: 12, dayName: 'Pull', duration: 68 },
    { daysAgo: 11, dayName: 'Legs', duration: 92 },
    { daysAgo: 9, dayName: 'Push', duration: 81 },
    { daysAgo: 8, dayName: 'Pull', duration: 64 },
    { daysAgo: 6, dayName: 'Legs', duration: 88 },
    { daysAgo: 5, dayName: 'Push', duration: 72 },
    { daysAgo: 3, dayName: 'Pull', duration: 79 },
    { daysAgo: 2, dayName: 'Legs', duration: 96 },
    { daysAgo: 1, dayName: 'Push', duration: 66 },
  ];

  recentHistory.forEach((fixture, index) => {
    addRoutineSession({
      dayName: fixture.dayName,
      startedAt: localDateDaysAgo(now, fixture.daysAgo, 19, 10 + index * 3),
      durationMinutes: fixture.duration,
      note: index === recentHistory.length - 1 ? '컨디션 좋게 마무리' : null,
    });
  });

  if (screenshotState === 'active') {
    addRoutineSession({
      dayName: 'Pull',
      startedAt: new Date(now.getTime() - (42 * 60 + 8) * 1_000),
      durationMinutes: 0,
      status: 'active',
    });
  }

  if (screenshotState === 'post') {
    const endedAt = new Date(now.getTime() - 12 * 60_000);
    const startedAt = new Date(endedAt.getTime() - 48 * 60_000);
    addRoutineSession({
      dayName: 'Pull',
      startedAt,
      durationMinutes: 48,
      note: '등에 집중한 좋은 운동',
    });
  }

  const nextDay = routineDays.get(screenshotState === 'post' ? 'Legs' : 'Pull');
  database
    .prepare(
      `INSERT INTO routine_progress
       (id, active_routine_id, next_routine_day_id, updated_at)
       VALUES (1, ?, ?, ?)`
    )
    .run(routineId, nextDay.id, nowIso);

  const widgetTheme = {
    accent: '#CFF56A',
    accentText: '#0B0B0B',
    background: '#141416',
    brandColor: '#5C5C62',
    brandName: '루핏',
    detailColor: '#8A8A90',
    heatmapBackground: '#141416',
    heatmapBaseColor: '#16161A',
    heatmapBrandColor: '#5C5C62',
    heatmapDayLabelColor: '#8A8A90',
    heatmapEmptyColor: '#1B1B1F',
    heatmapFooterValueColor: '#C9C9CE',
    heatmapGapColor: '#00000000',
    heatmapTitleColor: '#8A8A90',
    heatmapWeekdayLabelColor: '#7C7C82',
    labelColor: '#8A8A90',
    secondaryButtonBackground: '#1B1B1F',
    secondaryButtonText: '#F4F4F2',
    titleColor: '#F4F4F2',
  };
  const upsertSetting = database.prepare(
    `INSERT INTO app_settings (key, value, updated_at)
     VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET
       value = excluded.value,
       updated_at = excluded.updated_at`
  );
  upsertSetting.run('theme_mode', 'dark', nowIso);
  upsertSetting.run('theme_accent', '#CFF56A', nowIso);
  upsertSetting.run('widget_theme_snapshot', JSON.stringify(widgetTheme), nowIso);
}

function localDateDaysAgo(now, daysAgo, hour, minute) {
  const date = new Date(now);
  date.setDate(date.getDate() - daysAgo);
  date.setHours(hour, minute, 0, 0);
  return date;
}

function calendarWeekIndex(date) {
  const sunday = date.getDate() - date.getDay();
  return Math.floor(
    Date.UTC(date.getFullYear(), date.getMonth(), sunday) / (7 * 24 * 60 * 60 * 1_000)
  );
}

function parseArguments(argumentsList) {
  const parsed = {};
  for (let index = 0; index < argumentsList.length; index += 1) {
    const argument = argumentsList[index];
    if (!argument.startsWith('--')) {
      continue;
    }
    const key = argument.slice(2);
    const value = argumentsList[index + 1];
    if (!value || value.startsWith('--')) {
      parsed[key] = true;
      continue;
    }
    parsed[key] = value;
    index += 1;
  }
  return parsed;
}

function fail(message) {
  console.error(message);
  process.exit(1);
}
