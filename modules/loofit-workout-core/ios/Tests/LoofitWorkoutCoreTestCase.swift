import Foundation
import SQLite3
import XCTest
@testable import LoofitWorkoutCore

class LoofitWorkoutCoreTestCase: XCTestCase {
  var databaseDirectory: String!
  var database: LoofitSQLiteDatabase!

  override func setUpWithError() throws {
    try super.setUpWithError()
    let directory = FileManager.default.temporaryDirectory
      .appendingPathComponent("LoofitWorkoutCoreTests-\(UUID().uuidString)", isDirectory: true)
    try FileManager.default.createDirectory(at: directory, withIntermediateDirectories: true)
    databaseDirectory = directory.path
    database = try LoofitSQLiteDatabase(databaseDirectory: directory.path)
    try database.migrateSchemaIfNeeded()
  }

  override func tearDownWithError() throws {
    database = nil
    if let databaseDirectory {
      try? FileManager.default.removeItem(atPath: databaseDirectory)
    }
    databaseDirectory = nil
    try super.tearDownWithError()
  }

  func seedRoutine(nextRoutineDayId: Int64 = 101) throws {
    let now = LoofitWorkoutDate.nowISO8601()
    try database.run(
      "INSERT INTO body_parts (id, name, color, sort_order, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      [.integer(1), .text("가슴"), .text("#E84A5F"), .integer(0), .text(now), .text(now)]
    )
    try database.run(
      "INSERT INTO body_parts (id, name, color, sort_order, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      [.integer(2), .text("등"), .text("#2A9D8F"), .integer(1), .text(now), .text(now)]
    )
    try database.run(
      "INSERT INTO body_parts (id, name, color, sort_order, is_archived, created_at, updated_at) VALUES (?, ?, ?, ?, 0, ?, ?)",
      [.integer(3), .text("하체"), .text("#F4A261"), .integer(2), .text(now), .text(now)]
    )
    try database.run(
      "INSERT INTO routines (id, name, is_active, created_at, updated_at) VALUES (10, 'PPL', 1, ?, ?)",
      [.text(now), .text(now)]
    )
    try database.run(
      "INSERT INTO routine_days (id, routine_id, name, sort_order, created_at, updated_at) VALUES (101, 10, 'Push', 0, ?, ?)",
      [.text(now), .text(now)]
    )
    try database.run(
      "INSERT INTO routine_days (id, routine_id, name, sort_order, created_at, updated_at) VALUES (102, 10, 'Pull', 1, ?, ?)",
      [.text(now), .text(now)]
    )
    try database.run(
      "INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order) VALUES (101, 1, 0)"
    )
    try database.run(
      "INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order) VALUES (102, 2, 0)"
    )
    try database.run(
      "INSERT INTO routine_progress (id, active_routine_id, next_routine_day_id, updated_at) VALUES (1, 10, ?, ?)",
      [.integer(nextRoutineDayId), .text(now)]
    )
  }

  @discardableResult
  func insertCompletedSession(
    startedAt: Date,
    duration: Int,
    bodyPartName: String = "가슴"
  ) throws -> Int64 {
    let start = LoofitWorkoutDate.nowISO8601(startedAt)
    let end = LoofitWorkoutDate.nowISO8601(startedAt.addingTimeInterval(TimeInterval(duration)))
    try database.run(
      """
      INSERT INTO workout_sessions
        (routine_id, routine_day_id, routine_day_name_snapshot, started_at, ended_at, duration_seconds,
         status, note, created_at, updated_at)
      VALUES (10, 101, 'Push', ?, ?, ?, 'completed', NULL, ?, ?)
      """,
      [.text(start), .text(end), .integer(Int64(duration)), .text(start), .text(end)]
    )
    let id = database.lastInsertRowId
    try database.run(
      """
      INSERT INTO workout_session_parts_snapshot
        (workout_session_id, body_part_id, body_part_name, body_part_color, sort_order)
      VALUES (?, 1, ?, '#E84A5F', 0)
      """,
      [.integer(id), .text(bodyPartName)]
    )
    return id
  }

  func status(of sessionId: Int64) throws -> String? {
    try database.firstString(
      "SELECT status FROM workout_sessions WHERE id = ?",
      [.integer(sessionId)]
    )
  }

  func startedAt(of sessionId: Int64) throws -> String? {
    try database.firstString(
      "SELECT started_at FROM workout_sessions WHERE id = ?",
      [.integer(sessionId)]
    )
  }

  func routineDayNameSnapshot(of sessionId: Int64) throws -> String? {
    try database.firstString(
      "SELECT routine_day_name_snapshot FROM workout_sessions WHERE id = ?",
      [.integer(sessionId)]
    )
  }

  func partNames(of sessionId: Int64) throws -> [String] {
    var names: [String] = []
    try database.query(
      "SELECT body_part_name FROM workout_session_parts_snapshot WHERE workout_session_id = ? ORDER BY sort_order, id",
      [.integer(sessionId)]
    ) { statement in
      if let name = LoofitSQLiteDatabase.string(statement, 0) {
        names.append(name)
      }
    }
    return names
  }

  func localDate(daysFromToday: Int, hour: Int = 12, minute: Int = 0) -> Date {
    let calendar = Calendar.autoupdatingCurrent
    let today = calendar.startOfDay(for: Date())
    let day = calendar.date(byAdding: .day, value: daysFromToday, to: today)!
    return calendar.date(byAdding: .minute, value: hour * 60 + minute, to: day)!
  }

  func localDateKey(_ date: Date) -> String {
    let components = Calendar.autoupdatingCurrent.dateComponents([.year, .month, .day], from: date)
    return String(
      format: "%04d-%02d-%02d",
      components.year ?? 0,
      components.month ?? 0,
      components.day ?? 0
    )
  }

}
