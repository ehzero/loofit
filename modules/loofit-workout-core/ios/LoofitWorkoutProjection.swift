import CryptoKit
import Foundation
import SQLite3

private struct LoofitSessionBuilder {
  let id: Int64
  let routineId: Int64?
  let routineDayId: Int64?
  let alias: String
  let startedAt: String
  let endedAt: String?
  let durationSeconds: Int
  var parts: [LoofitWorkoutPartSnapshot]

  var snapshot: LoofitWorkoutSessionSnapshot {
    let partNames = parts.map(\.name).joined(separator: " · ")
    let trimmedAlias = alias.trimmingCharacters(in: .whitespacesAndNewlines)
    let title = trimmedAlias.isEmpty ? (partNames.isEmpty ? "자유 운동" : partNames) : trimmedAlias
    let detail = trimmedAlias.isEmpty || trimmedAlias == partNames ? "" : partNames
    return .init(
      id: id,
      routineId: routineId,
      routineDayId: routineDayId,
      title: title,
      detail: detail,
      startedAt: startedAt,
      endedAt: endedAt,
      durationSeconds: durationSeconds,
      parts: parts
    )
  }
}

private struct LoofitControlHashPayload: Encodable {
  let theme: LoofitWidgetTheme
  let active: LoofitWorkoutSessionSnapshot?
  let next: LoofitWorkoutTargetSnapshot?
  let today: [LoofitWorkoutSessionSnapshot]
}

private struct LoofitHeatmapHashPayload: Encodable {
  let theme: LoofitWidgetTheme
  let daily: [LoofitWorkoutDailyAggregate]
  let recent: [LoofitWorkoutSessionSnapshot]
}

enum LoofitWorkoutProjection {
  static func makeSnapshot(database: LoofitSQLiteDatabase) throws -> LoofitWorkoutSnapshot {
    try database.withReadTransaction {
      let revisions = try database.revisions()
      let theme = try loadTheme(database)
      let active = try loadActiveSession(database)
      let next = try loadNextWorkout(database)
      let completed = try loadCompletedSessions(database)
      let todayKey = localDateKey(Date())
      let completedToday = completed.filter { localDateKey($0.startedDate ?? .distantPast) == todayKey }
      let daily = dailyAggregates(completed)
      let recent = Array(completed.prefix(12))
      let hashes = surfaceHashes(
        theme: theme,
        active: active,
        next: next,
        completedToday: completedToday,
        daily: daily,
        recent: recent
      )
      return .init(
        revision: revisions.desired,
        generatedAt: LoofitWorkoutDate.nowISO8601(),
        timeZoneIdentifier: Calendar.autoupdatingCurrent.timeZone.identifier,
        theme: theme,
        activeSession: active,
        nextWorkout: next,
        latestCompletedToday: completedToday.first,
        completedToday: completedToday,
        dailyCompleted: daily,
        recentCompleted: recent,
        surfaceHashes: hashes
      )
    }
  }

  private static func loadTheme(_ database: LoofitSQLiteDatabase) throws -> LoofitWidgetTheme {
    guard let raw = try database.firstString(
      "SELECT value FROM app_settings WHERE key = 'widget_theme_snapshot' LIMIT 1"
    ), let data = raw.data(using: .utf8),
      let dictionary = try? JSONDecoder().decode([String: String].self, from: data) else {
      return LoofitWidgetTheme()
    }
    return LoofitWidgetTheme(dictionary: dictionary)
  }

  private static func loadActiveSession(
    _ database: LoofitSQLiteDatabase
  ) throws -> LoofitWorkoutSessionSnapshot? {
    let sql = """
      SELECT ws.id, ws.routine_id, ws.routine_day_id,
             COALESCE(ws.routine_day_name_snapshot, ''),
             ws.started_at, ws.ended_at, ws.duration_seconds,
             sp.body_part_id, sp.body_part_name, sp.body_part_color, sp.sort_order
      FROM workout_sessions ws
      LEFT JOIN workout_session_parts_snapshot sp ON sp.workout_session_id = ws.id
      WHERE ws.id = (
        SELECT id FROM workout_sessions WHERE status = 'active'
        ORDER BY started_at DESC, id DESC LIMIT 1
      )
      ORDER BY sp.sort_order ASC, sp.id ASC
      """
    var builder: LoofitSessionBuilder?
    try database.query(sql) { statement in
      if builder == nil {
        builder = sessionBuilder(statement)
      }
      appendPart(statement, to: &builder)
    }
    return builder?.snapshot
  }

  private static func loadCompletedSessions(
    _ database: LoofitSQLiteDatabase
  ) throws -> [LoofitWorkoutSessionSnapshot] {
    let calendar = Calendar.autoupdatingCurrent
    let today = calendar.startOfDay(for: Date())
    let monthStart = calendar.date(from: calendar.dateComponents([.year, .month], from: today)) ?? today
    let rangeStart = calendar.date(
      byAdding: .month,
      value: -(LoofitWidgetLayoutContract.Heatmap.sixMonthRangeMonths - 1),
      to: monthStart
    ) ?? monthStart
    let sql = """
      SELECT ws.id, ws.routine_id, ws.routine_day_id,
             COALESCE(ws.routine_day_name_snapshot, ''),
             ws.started_at, ws.ended_at, ws.duration_seconds,
             sp.body_part_id, sp.body_part_name, sp.body_part_color, sp.sort_order
      FROM workout_sessions ws
      LEFT JOIN workout_session_parts_snapshot sp ON sp.workout_session_id = ws.id
      WHERE ws.status = 'completed' AND ws.started_at >= ?
      ORDER BY ws.started_at DESC, ws.id DESC, sp.sort_order ASC, sp.id ASC
      """

    var order: [Int64] = []
    var builders: [Int64: LoofitSessionBuilder] = [:]
    try database.query(sql, [.text(LoofitWorkoutDate.nowISO8601(rangeStart))]) { statement in
      let id = sqlite3_column_int64(statement, 0)
      if builders[id] == nil {
        order.append(id)
        builders[id] = sessionBuilder(statement)
      }
      var builder = builders[id]
      appendPart(statement, to: &builder)
      builders[id] = builder
    }
    return order.compactMap { builders[$0]?.snapshot }
  }

  private static func loadNextWorkout(
    _ database: LoofitSQLiteDatabase
  ) throws -> LoofitWorkoutTargetSnapshot? {
    var selectedDayId: Int64?
    var routineId: Int64 = 0
    var alias = ""
    var parts: [LoofitWorkoutPartSnapshot] = []
    try database.query(
      """
      SELECT rd.id, rd.routine_id, rd.name,
             bp.id, bp.name, bp.color, rdp.sort_order
      FROM routines r
      JOIN routine_days rd ON rd.routine_id = r.id
      LEFT JOIN routine_day_parts rdp ON rdp.routine_day_id = rd.id
      LEFT JOIN body_parts bp ON bp.id = rdp.body_part_id AND bp.is_archived = 0
      WHERE r.is_active = 1
      ORDER BY CASE WHEN rd.id = (
        SELECT next_routine_day_id FROM routine_progress WHERE id = 1
      ) THEN 0 ELSE 1 END, rd.sort_order ASC, rd.id ASC, rdp.sort_order ASC
      """
    ) { statement in
      let rowDayId = sqlite3_column_int64(statement, 0)
      if selectedDayId == nil {
        selectedDayId = rowDayId
        routineId = sqlite3_column_int64(statement, 1)
        alias = LoofitSQLiteDatabase.string(statement, 2) ?? ""
      }
      guard selectedDayId == rowDayId,
            let name = LoofitSQLiteDatabase.string(statement, 4),
            let color = LoofitSQLiteDatabase.string(statement, 5) else {
        return
      }
      parts.append(.init(
        id: LoofitSQLiteDatabase.optionalInt64(statement, 3),
        name: name,
        color: color,
        sortOrder: Int(sqlite3_column_int64(statement, 6))
      ))
    }
    guard let dayId = selectedDayId, !parts.isEmpty else {
      return nil
    }
    let partNames = parts.map(\.name).joined(separator: " · ")
    let trimmedAlias = alias.trimmingCharacters(in: .whitespacesAndNewlines)
    return .init(
      routineId: routineId,
      routineDayId: dayId,
      title: trimmedAlias.isEmpty ? partNames : trimmedAlias,
      detail: trimmedAlias.isEmpty || trimmedAlias == partNames ? "" : partNames,
      parts: parts
    )
  }

  private static func sessionBuilder(_ statement: OpaquePointer) -> LoofitSessionBuilder {
    .init(
      id: sqlite3_column_int64(statement, 0),
      routineId: LoofitSQLiteDatabase.optionalInt64(statement, 1),
      routineDayId: LoofitSQLiteDatabase.optionalInt64(statement, 2),
      alias: LoofitSQLiteDatabase.string(statement, 3) ?? "",
      startedAt: LoofitSQLiteDatabase.string(statement, 4) ?? "",
      endedAt: LoofitSQLiteDatabase.string(statement, 5),
      durationSeconds: Int(sqlite3_column_int64(statement, 6)),
      parts: []
    )
  }

  private static func appendPart(
    _ statement: OpaquePointer,
    to builder: inout LoofitSessionBuilder?
  ) {
    guard var value = builder,
          let name = LoofitSQLiteDatabase.string(statement, 8),
          let color = LoofitSQLiteDatabase.string(statement, 9) else {
      return
    }
    value.parts.append(.init(
      id: LoofitSQLiteDatabase.optionalInt64(statement, 7),
      name: name,
      color: color,
      sortOrder: Int(sqlite3_column_int64(statement, 10))
    ))
    builder = value
  }

  private static func dailyAggregates(
    _ sessions: [LoofitWorkoutSessionSnapshot]
  ) -> [LoofitWorkoutDailyAggregate] {
    var aggregates: [String: (count: Int, duration: Int)] = [:]
    for session in sessions {
      guard let date = session.startedDate else { continue }
      let key = localDateKey(date)
      let current = aggregates[key] ?? (0, 0)
      aggregates[key] = (current.count + 1, current.duration + session.durationSeconds)
    }
    return aggregates.keys.sorted().map { key in
      let value = aggregates[key] ?? (0, 0)
      return .init(
        dateKey: key,
        workoutCount: value.count,
        durationSeconds: value.duration
      )
    }
  }

  private static func surfaceHashes(
    theme: LoofitWidgetTheme,
    active: LoofitWorkoutSessionSnapshot?,
    next: LoofitWorkoutTargetSnapshot?,
    completedToday: [LoofitWorkoutSessionSnapshot],
    daily: [LoofitWorkoutDailyAggregate],
    recent: [LoofitWorkoutSessionSnapshot]
  ) -> [String: String] {
    let control = stableHash(LoofitControlHashPayload(
      theme: theme,
      active: active,
      next: next,
      today: completedToday
    ))
    let today = Calendar.autoupdatingCurrent.startOfDay(for: Date())
    let weekStart = Calendar.autoupdatingCurrent.date(
      byAdding: .day,
      value: -(LoofitWidgetLayoutContract.Heatmap.weekRangeDays - 1),
      to: today
    ) ?? today
    let monthStart = LoofitHeatmapProjection.calendarWeekRangeStart(
      endingAt: today,
      count: LoofitWidgetLayoutContract.Heatmap.monthRangeWeeks
    )
    let week = daily.filter { $0.dateKey >= localDateKey(weekStart) }
    let month = daily.filter { $0.dateKey >= localDateKey(monthStart) }
    let weekHash = stableHash(LoofitHeatmapHashPayload(theme: theme, daily: week, recent: recent))
    let monthHash = stableHash(LoofitHeatmapHashPayload(theme: theme, daily: month, recent: []))
    let sixMonthHash = stableHash(LoofitHeatmapHashPayload(theme: theme, daily: daily, recent: []))

    return [
      LoofitWidgetKinds.control: control,
      LoofitWidgetKinds.heatmapWeek: weekHash,
      LoofitWidgetKinds.heatmapMonth: monthHash,
      LoofitWidgetKinds.heatmapSixMonths: sixMonthHash,
      LoofitWidgetKinds.lockScreenWorkout: control,
      LoofitWidgetKinds.lockScreenSummary: weekHash,
    ]
  }

  private static func stableHash<T: Encodable>(_ value: T) -> String {
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    guard let data = try? encoder.encode(value) else { return "" }
    return SHA256.hash(data: data).map { String(format: "%02x", $0) }.joined()
  }

  private static func localDateKey(_ date: Date) -> String {
    let components = Calendar.autoupdatingCurrent.dateComponents([.year, .month, .day], from: date)
    return String(
      format: "%04d-%02d-%02d",
      components.year ?? 0,
      components.month ?? 0,
      components.day ?? 0
    )
  }
}
