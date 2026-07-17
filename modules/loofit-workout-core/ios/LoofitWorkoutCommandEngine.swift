import Foundation
import SQLite3

struct LoofitWorkoutMutationOutcome {
  let status: LoofitWorkoutCommandStatus
  let sessionId: Int64?
}

private struct LoofitActiveSessionRecord {
  let id: Int64
  let routineId: Int64?
  let routineDayId: Int64?
  let routineDayNameSnapshot: String?
  let startedAt: String
}

enum LoofitWorkoutCommandEngine {
  static func execute(
    _ command: LoofitWorkoutCommand,
    database: LoofitSQLiteDatabase
  ) throws -> LoofitWorkoutMutationOutcome {
    try database.withImmediateTransaction {
      switch command {
      case .startNext:
        return try startNext(database)
      case .startRoutine(let routineDayId):
        return try startRoutine(routineDayId: routineDayId, database: database)
      case .changeParts(let expectedSessionId, let bodyPartIds, let updateRoutine):
        return try changeParts(
          expectedSessionId: expectedSessionId,
          bodyPartIds: bodyPartIds,
          updateRoutine: updateRoutine,
          database: database
        )
      case .complete(let expectedSessionId):
        return try finish(
          expectedSessionId: expectedSessionId,
          status: "completed",
          database: database
        )
      case .cancel(let expectedSessionId):
        return try finish(
          expectedSessionId: expectedSessionId,
          status: "canceled",
          database: database
        )
      }
    }
  }

  private static func startNext(
    _ database: LoofitSQLiteDatabase
  ) throws -> LoofitWorkoutMutationOutcome {
    if let active = try activeSession(database) {
      return .init(status: .noop, sessionId: active.id)
    }
    guard let target = try nextRoutineTarget(database) else {
      return .init(status: .rejected, sessionId: nil)
    }
    return try insertSession(target: target, database: database)
  }

  private static func startRoutine(
    routineDayId: Int64,
    database: LoofitSQLiteDatabase
  ) throws -> LoofitWorkoutMutationOutcome {
    if let active = try activeSession(database) {
      return .init(status: .noop, sessionId: active.id)
    }
    guard let target = try routineTarget(id: routineDayId, database: database) else {
      return .init(status: .rejected, sessionId: nil)
    }
    return try insertSession(target: target, database: database)
  }

  private static func changeParts(
    expectedSessionId: Int64,
    bodyPartIds: [Int64],
    updateRoutine: Bool,
    database: LoofitSQLiteDatabase
  ) throws -> LoofitWorkoutMutationOutcome {
    guard let active = try activeSession(database) else {
      return .init(status: .stale, sessionId: nil)
    }
    guard active.id == expectedSessionId else {
      return .init(status: .stale, sessionId: active.id)
    }
    let parts = try bodyParts(ids: bodyPartIds, database: database)
    guard !parts.isEmpty else {
      return .init(status: .rejected, sessionId: active.id)
    }

    guard
      let routineId = active.routineId,
      let routineDayId = active.routineDayId,
      let routineMetadata = try activeRoutineDayMetadata(id: routineDayId, database: database)
    else {
      return .init(status: .rejected, sessionId: active.id)
    }
    if updateRoutine {
      try replaceRoutineDayParts(
        routineDayId: routineDayId,
        parts: parts,
        database: database
      )
    }

    let routineDayNameSnapshot = workoutTitle(alias: routineMetadata.alias, parts: parts)
    try replaceTarget(
      activeSessionId: active.id,
      routineId: routineId,
      routineDayId: routineDayId,
      routineDayNameSnapshot: routineDayNameSnapshot,
      parts: parts,
      database: database
    )
    return .init(status: .applied, sessionId: active.id)
  }

  private static func finish(
    expectedSessionId: Int64,
    status: String,
    database: LoofitSQLiteDatabase
  ) throws -> LoofitWorkoutMutationOutcome {
    guard let active = try activeSession(database) else {
      let priorStatus = try database.firstString(
        "SELECT status FROM workout_sessions WHERE id = ? LIMIT 1",
        [.integer(expectedSessionId)]
      )
      let isAlreadyFinished = priorStatus == "completed" || priorStatus == "canceled"
      return .init(status: isAlreadyFinished ? .noop : .stale, sessionId: nil)
    }
    guard active.id == expectedSessionId else {
      return .init(status: .stale, sessionId: active.id)
    }
    let completedDayId: Int64?
    if status == "completed" {
      guard let routineDayId = active.routineDayId else {
        return .init(status: .rejected, sessionId: active.id)
      }
      completedDayId = routineDayId
    } else {
      completedDayId = nil
    }

    let now = Date()
    let duration = max(
      0,
      Int(now.timeIntervalSince(LoofitWorkoutDate.parseISO8601(active.startedAt) ?? now))
    )
    let nowString = LoofitWorkoutDate.nowISO8601(now)
    let changed = try database.run(
      """
      UPDATE workout_sessions
      SET status = ?, ended_at = ?, duration_seconds = ?, updated_at = ?
      WHERE id = ? AND status = 'active'
      """,
      [
        .text(status),
        .text(nowString),
        .integer(Int64(duration)),
        .text(nowString),
        .integer(active.id),
      ]
    )
    guard changed == 1 else {
      return .init(status: .stale, sessionId: active.id)
    }

    if let completedDayId {
      try advanceRoutineProgress(after: completedDayId, database: database)
    }
    return .init(status: .applied, sessionId: active.id)
  }

  private static func advanceRoutineProgress(
    after completedDayId: Int64,
    database: LoofitSQLiteDatabase
  ) throws {
    guard let activeRoutineId = try database.firstInt64(
      "SELECT id FROM routines WHERE is_active = 1 ORDER BY id DESC LIMIT 1"
    ) else {
      let now = LoofitWorkoutDate.nowISO8601()
      try database.run(
        """
        INSERT INTO routine_progress (id, active_routine_id, next_routine_day_id, updated_at)
        VALUES (1, NULL, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET active_routine_id = NULL,
          next_routine_day_id = NULL, updated_at = excluded.updated_at
        """,
        [.text(now)]
      )
      return
    }

    var dayIds: [Int64] = []
    try database.query(
      "SELECT id FROM routine_days WHERE routine_id = ? ORDER BY sort_order ASC, id ASC",
      [.integer(activeRoutineId)]
    ) { statement in
      dayIds.append(sqlite3_column_int64(statement, 0))
    }
    let nextDayId: Int64?
    if let index = dayIds.firstIndex(of: completedDayId), !dayIds.isEmpty {
      nextDayId = dayIds[(index + 1) % dayIds.count]
    } else {
      nextDayId = dayIds.first
    }
    let now = LoofitWorkoutDate.nowISO8601()
    try database.run(
      """
      INSERT INTO routine_progress (id, active_routine_id, next_routine_day_id, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET active_routine_id = excluded.active_routine_id,
        next_routine_day_id = excluded.next_routine_day_id,
        updated_at = excluded.updated_at
      """,
      [
        .integer(activeRoutineId),
        nextDayId.map(LoofitSQLiteValue.integer) ?? .null,
        .text(now),
      ]
    )
  }

  private static func insertSession(
    target: LoofitWorkoutTargetSnapshot,
    database: LoofitSQLiteDatabase
  ) throws -> LoofitWorkoutMutationOutcome {
    let now = LoofitWorkoutDate.nowISO8601()
    try database.run(
      """
      INSERT INTO workout_sessions
        (routine_id, routine_day_id, routine_day_name_snapshot, started_at, ended_at,
         duration_seconds, status, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, 0, 'active', NULL, ?, ?)
      """,
      [
        .integer(target.routineId),
        .integer(target.routineDayId),
        .text(target.title),
        .text(now),
        .text(now),
        .text(now),
      ]
    )
    let sessionId = database.lastInsertRowId
    try insertParts(target.parts, sessionId: sessionId, database: database)
    return .init(status: .applied, sessionId: sessionId)
  }

  private static func replaceTarget(
    activeSessionId: Int64,
    routineId: Int64,
    routineDayId: Int64,
    routineDayNameSnapshot: String,
    parts: [LoofitWorkoutPartSnapshot],
    database: LoofitSQLiteDatabase
  ) throws {
    try database.run(
      """
      UPDATE workout_sessions
      SET routine_id = ?, routine_day_id = ?, routine_day_name_snapshot = ?, updated_at = ?
      WHERE id = ? AND status = 'active'
      """,
      [
        .integer(routineId),
        .integer(routineDayId),
        .text(routineDayNameSnapshot),
        .text(LoofitWorkoutDate.nowISO8601()),
        .integer(activeSessionId),
      ]
    )
    try database.run(
      "DELETE FROM workout_session_parts_snapshot WHERE workout_session_id = ?",
      [.integer(activeSessionId)]
    )
    try insertParts(parts, sessionId: activeSessionId, database: database)
  }

  private static func insertParts(
    _ parts: [LoofitWorkoutPartSnapshot],
    sessionId: Int64,
    database: LoofitSQLiteDatabase
  ) throws {
    for (index, part) in parts.enumerated() {
      try database.run(
        """
        INSERT INTO workout_session_parts_snapshot
          (workout_session_id, body_part_id, body_part_name, body_part_color, sort_order)
        VALUES (?, ?, ?, ?, ?)
        """,
        [
          .integer(sessionId),
          part.id.map(LoofitSQLiteValue.integer) ?? .null,
          .text(part.name),
          .text(part.color),
          .integer(Int64(index)),
        ]
      )
    }
  }

  private static func activeSession(
    _ database: LoofitSQLiteDatabase
  ) throws -> LoofitActiveSessionRecord? {
    var record: LoofitActiveSessionRecord?
    try database.query(
      """
      SELECT id, routine_id, routine_day_id, routine_day_name_snapshot, started_at
      FROM workout_sessions WHERE status = 'active'
      ORDER BY started_at DESC, id DESC LIMIT 1
      """
    ) { statement in
      record = .init(
        id: sqlite3_column_int64(statement, 0),
        routineId: LoofitSQLiteDatabase.optionalInt64(statement, 1),
        routineDayId: LoofitSQLiteDatabase.optionalInt64(statement, 2),
        routineDayNameSnapshot: LoofitSQLiteDatabase.string(statement, 3),
        startedAt: LoofitSQLiteDatabase.string(statement, 4) ?? ""
      )
    }
    return record
  }

  private static func nextRoutineTarget(
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
            let partName = LoofitSQLiteDatabase.string(statement, 4),
            let partColor = LoofitSQLiteDatabase.string(statement, 5) else {
        return
      }
      parts.append(.init(
        id: LoofitSQLiteDatabase.optionalInt64(statement, 3),
        name: partName,
        color: partColor,
        sortOrder: Int(sqlite3_column_int64(statement, 6))
      ))
    }
    guard let dayId = selectedDayId, !parts.isEmpty else {
      return nil
    }
    return makeTarget(routineId: routineId, dayId: dayId, alias: alias, parts: parts)
  }

  private static func routineTarget(
    id: Int64,
    database: LoofitSQLiteDatabase
  ) throws -> LoofitWorkoutTargetSnapshot? {
    var routineId: Int64?
    var alias = ""
    var parts: [LoofitWorkoutPartSnapshot] = []
    try database.query(
      """
      SELECT rd.routine_id, rd.name, bp.id, bp.name, bp.color, rdp.sort_order
      FROM routine_days rd
      JOIN routines r ON r.id = rd.routine_id AND r.is_active = 1
      LEFT JOIN routine_day_parts rdp ON rdp.routine_day_id = rd.id
      LEFT JOIN body_parts bp ON bp.id = rdp.body_part_id AND bp.is_archived = 0
      WHERE rd.id = ? ORDER BY rdp.sort_order ASC
      """,
      [.integer(id)]
    ) { statement in
      routineId = sqlite3_column_int64(statement, 0)
      alias = LoofitSQLiteDatabase.string(statement, 1) ?? ""
      guard let name = LoofitSQLiteDatabase.string(statement, 3),
            let color = LoofitSQLiteDatabase.string(statement, 4) else {
        return
      }
      parts.append(.init(
        id: LoofitSQLiteDatabase.optionalInt64(statement, 2),
        name: name,
        color: color,
        sortOrder: Int(sqlite3_column_int64(statement, 5))
      ))
    }
    guard let routineId, !parts.isEmpty else {
      return nil
    }
    return makeTarget(routineId: routineId, dayId: id, alias: alias, parts: parts)
  }

  private static func makeTarget(
    routineId: Int64,
    dayId: Int64,
    alias: String,
    parts: [LoofitWorkoutPartSnapshot]
  ) -> LoofitWorkoutTargetSnapshot {
    let partNames = parts.map(\.name).joined(separator: " · ")
    let title = workoutTitle(alias: alias, parts: parts)
    let trimmedAlias = alias.trimmingCharacters(in: .whitespacesAndNewlines)
    let detail = trimmedAlias.isEmpty || trimmedAlias == partNames ? "" : partNames
    return .init(
      routineId: routineId,
      routineDayId: dayId,
      title: title,
      detail: detail,
      parts: parts
    )
  }

  private struct RoutineDayMetadata {
    let alias: String
  }

  private static func activeRoutineDayMetadata(
    id: Int64,
    database: LoofitSQLiteDatabase
  ) throws -> RoutineDayMetadata? {
    var metadata: RoutineDayMetadata?
    try database.query(
      """
      SELECT rd.name
      FROM routine_days rd
      JOIN routines r ON r.id = rd.routine_id AND r.is_active = 1
      WHERE rd.id = ? LIMIT 1
      """,
      [.integer(id)]
    ) { statement in
      metadata = .init(alias: LoofitSQLiteDatabase.string(statement, 0) ?? "")
    }
    return metadata
  }

  private static func replaceRoutineDayParts(
    routineDayId: Int64,
    parts: [LoofitWorkoutPartSnapshot],
    database: LoofitSQLiteDatabase
  ) throws {
    try database.run(
      "DELETE FROM routine_day_parts WHERE routine_day_id = ?",
      [.integer(routineDayId)]
    )
    for (index, part) in parts.enumerated() {
      guard let bodyPartId = part.id else { continue }
      try database.run(
        """
        INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order)
        VALUES (?, ?, ?)
        """,
        [.integer(routineDayId), .integer(bodyPartId), .integer(Int64(index))]
      )
    }
    try database.run(
      "UPDATE routine_days SET updated_at = ? WHERE id = ?",
      [.text(LoofitWorkoutDate.nowISO8601()), .integer(routineDayId)]
    )
  }

  private static func workoutTitle(
    alias: String,
    parts: [LoofitWorkoutPartSnapshot]
  ) -> String {
    let trimmedAlias = alias.trimmingCharacters(in: .whitespacesAndNewlines)
    return trimmedAlias.isEmpty ? parts.map(\.name).joined(separator: " · ") : trimmedAlias
  }

  private static func bodyParts(
    ids: [Int64],
    database: LoofitSQLiteDatabase
  ) throws -> [LoofitWorkoutPartSnapshot] {
    let uniqueIds = Array(Set(ids))
    guard !uniqueIds.isEmpty else { return [] }
    let placeholders = uniqueIds.map { _ in "?" }.joined(separator: ",")
    var parts: [LoofitWorkoutPartSnapshot] = []
    try database.query(
      """
      SELECT id, name, color, sort_order FROM body_parts
      WHERE is_archived = 0 AND id IN (\(placeholders))
      ORDER BY sort_order ASC, id ASC
      """,
      uniqueIds.map(LoofitSQLiteValue.integer)
    ) { statement in
      parts.append(.init(
        id: sqlite3_column_int64(statement, 0),
        name: LoofitSQLiteDatabase.string(statement, 1) ?? "",
        color: LoofitSQLiteDatabase.string(statement, 2) ?? "#6C757D",
        sortOrder: Int(sqlite3_column_int64(statement, 3))
      ))
    }
    return parts
  }
}
