import XCTest
@testable import LoofitWorkoutCore

final class LoofitSQLiteTests: LoofitWorkoutCoreTestCase {
  func testFreshDatabaseMigratesToCurrentSchema() throws {
    XCTAssertEqual(
      try database.firstInt64("PRAGMA user_version"),
      Int64(LoofitWorkoutSchemaContract.currentVersion)
    )
    XCTAssertEqual(try database.firstInt64(
      "SELECT COUNT(*) FROM sqlite_master WHERE type = 'table' AND name = 'widget_sync_state'"
    ), 1)
    XCTAssertEqual(try database.firstInt64(
      "SELECT COUNT(*) FROM pragma_table_info('workout_sessions') " +
        "WHERE name = 'routine_day_name_snapshot'"
    ), 1)
  }

  func testCurrentSchemaDoesNotReplayCompletedMigrationsOrRepairs() throws {
    try database.run("DELETE FROM widget_sync_state WHERE id = 1")

    try database.migrateSchemaIfNeeded()

    XCTAssertEqual(
      try database.firstInt64("SELECT COUNT(*) FROM widget_sync_state WHERE id = 1"),
      0
    )
  }

  func testNewerDatabaseVersionIsRejected() throws {
    let futureVersion = LoofitWorkoutSchemaContract.currentVersion + 1
    try database.execute("PRAGMA user_version = \(futureVersion)")

    XCTAssertThrowsError(try database.migrateSchemaIfNeeded()) { error in
      guard case LoofitWorkoutCoreError.database(let message) = error else {
        return XCTFail("Expected a database error, got \(error)")
      }
      XCTAssertTrue(message.contains("newer than supported"))
    }
  }
}
