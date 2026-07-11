import XCTest
@testable import LoofitWorkoutCore

final class LoofitWorkoutCommandEngineTests: LoofitWorkoutCoreTestCase {
  func testStartNextStartRoutineAndStartFreeUseRequestedTargets() throws {
    try seedRoutine(nextRoutineDayId: 102)

    let next = try LoofitWorkoutCommandEngine.execute(.startNext, database: database)
    XCTAssertEqual(next.status, .applied)
    let nextId = try XCTUnwrap(next.sessionId)
    XCTAssertEqual(try database.firstInt64(
      "SELECT routine_day_id FROM workout_sessions WHERE id = ?",
      [.integer(nextId)]
    ), 102)
    XCTAssertEqual(try partNames(of: nextId), ["등"])
    _ = try LoofitWorkoutCommandEngine.execute(.cancel(expectedSessionId: nextId), database: database)

    let routine = try LoofitWorkoutCommandEngine.execute(
      .startRoutine(routineDayId: 101),
      database: database
    )
    XCTAssertEqual(routine.status, .applied)
    let routineId = try XCTUnwrap(routine.sessionId)
    XCTAssertEqual(try database.firstInt64(
      "SELECT routine_day_id FROM workout_sessions WHERE id = ?",
      [.integer(routineId)]
    ), 101)
    XCTAssertEqual(try partNames(of: routineId), ["가슴"])
    _ = try LoofitWorkoutCommandEngine.execute(.cancel(expectedSessionId: routineId), database: database)

    let free = try LoofitWorkoutCommandEngine.execute(
      .startFree(bodyPartIds: [3], label: nil),
      database: database
    )
    XCTAssertEqual(free.status, .applied)
    let freeId = try XCTUnwrap(free.sessionId)
    XCTAssertNil(try database.firstInt64(
      "SELECT routine_id FROM workout_sessions WHERE id = ?",
      [.integer(freeId)]
    ))
    XCTAssertNil(try database.firstInt64(
      "SELECT routine_day_id FROM workout_sessions WHERE id = ?",
      [.integer(freeId)]
    ))
    XCTAssertEqual(try partNames(of: freeId), ["하체"])
  }

  func testChangeTargetPreservesSessionIdentityAndStartTime() throws {
    try seedRoutine()
    let started = try LoofitWorkoutCommandEngine.execute(
      .startRoutine(routineDayId: 101),
      database: database
    )
    let sessionId = try XCTUnwrap(started.sessionId)
    let originalStartedAt = try startedAt(of: sessionId)

    let routineChange = try LoofitWorkoutCommandEngine.execute(
      .changeRoutine(expectedSessionId: sessionId, routineDayId: 102),
      database: database
    )
    XCTAssertEqual(routineChange.status, .applied)
    XCTAssertEqual(routineChange.sessionId, sessionId)
    XCTAssertEqual(try startedAt(of: sessionId), originalStartedAt)
    XCTAssertEqual(try database.firstInt64(
      "SELECT routine_day_id FROM workout_sessions WHERE id = ?",
      [.integer(sessionId)]
    ), 102)
    XCTAssertEqual(try partNames(of: sessionId), ["등"])

    let freeChange = try LoofitWorkoutCommandEngine.execute(
      .changeFree(expectedSessionId: sessionId, bodyPartIds: [3]),
      database: database
    )
    XCTAssertEqual(freeChange.status, .applied)
    XCTAssertEqual(freeChange.sessionId, sessionId)
    XCTAssertEqual(try startedAt(of: sessionId), originalStartedAt)
    XCTAssertNil(try database.firstInt64(
      "SELECT routine_id FROM workout_sessions WHERE id = ?",
      [.integer(sessionId)]
    ))
    XCTAssertEqual(try partNames(of: sessionId), ["하체"])
  }

  func testCompleteAdvancesRoutineExactlyOnce() throws {
    try seedRoutine(nextRoutineDayId: 101)
    let started = try LoofitWorkoutCommandEngine.execute(
      .startRoutine(routineDayId: 101),
      database: database
    )
    let sessionId = try XCTUnwrap(started.sessionId)

    let completed = try LoofitWorkoutCommandEngine.execute(
      .complete(expectedSessionId: sessionId),
      database: database
    )
    XCTAssertEqual(completed.status, .applied)
    XCTAssertEqual(try status(of: sessionId), "completed")
    XCTAssertEqual(try database.firstInt64(
      "SELECT next_routine_day_id FROM routine_progress WHERE id = 1"
    ), 102)

    let duplicate = try LoofitWorkoutCommandEngine.execute(
      .complete(expectedSessionId: sessionId),
      database: database
    )
    XCTAssertEqual(duplicate.status, .noop)
    XCTAssertEqual(try database.firstInt64(
      "SELECT next_routine_day_id FROM routine_progress WHERE id = 1"
    ), 102)
  }

  func testCompleteRollsBackSessionWhenRoutineProgressCannotAdvance() throws {
    try seedRoutine(nextRoutineDayId: 101)
    let started = try LoofitWorkoutCommandEngine.execute(
      .startRoutine(routineDayId: 101),
      database: database
    )
    let sessionId = try XCTUnwrap(started.sessionId)
    try database.execute("""
      CREATE TRIGGER reject_progress_update
      BEFORE UPDATE ON routine_progress
      BEGIN
        SELECT RAISE(ABORT, 'test progress failure');
      END;
      """)

    XCTAssertThrowsError(try LoofitWorkoutCommandEngine.execute(
      .complete(expectedSessionId: sessionId),
      database: database
    ))
    XCTAssertEqual(try status(of: sessionId), "active")
    XCTAssertEqual(try database.firstInt64(
      "SELECT next_routine_day_id FROM routine_progress WHERE id = 1"
    ), 101)
  }

  func testCancelDoesNotAdvanceRoutine() throws {
    try seedRoutine(nextRoutineDayId: 101)
    let started = try LoofitWorkoutCommandEngine.execute(
      .startRoutine(routineDayId: 101),
      database: database
    )
    let sessionId = try XCTUnwrap(started.sessionId)

    let canceled = try LoofitWorkoutCommandEngine.execute(
      .cancel(expectedSessionId: sessionId),
      database: database
    )
    XCTAssertEqual(canceled.status, .applied)
    XCTAssertEqual(try status(of: sessionId), "canceled")
    XCTAssertEqual(try database.firstInt64(
      "SELECT next_routine_day_id FROM routine_progress WHERE id = 1"
    ), 101)
  }

  func testExpectedSessionIdRejectsStaleActionsAndFinishedActionIsNoop() throws {
    try seedRoutine()
    let started = try LoofitWorkoutCommandEngine.execute(.startNext, database: database)
    let sessionId = try XCTUnwrap(started.sessionId)

    let staleChange = try LoofitWorkoutCommandEngine.execute(
      .changeRoutine(expectedSessionId: sessionId + 999, routineDayId: 102),
      database: database
    )
    XCTAssertEqual(staleChange.status, .stale)
    XCTAssertEqual(staleChange.sessionId, sessionId)
    XCTAssertEqual(try partNames(of: sessionId), ["가슴"])

    let staleComplete = try LoofitWorkoutCommandEngine.execute(
      .complete(expectedSessionId: sessionId + 999),
      database: database
    )
    XCTAssertEqual(staleComplete.status, .stale)
    XCTAssertEqual(try status(of: sessionId), "active")

    _ = try LoofitWorkoutCommandEngine.execute(
      .complete(expectedSessionId: sessionId),
      database: database
    )
    let duplicate = try LoofitWorkoutCommandEngine.execute(
      .complete(expectedSessionId: sessionId),
      database: database
    )
    XCTAssertEqual(duplicate.status, .noop)
  }

  func testSingleActiveConstraintReturnsExistingSessionAndRejectsDuplicateRow() throws {
    try seedRoutine()
    let first = try LoofitWorkoutCommandEngine.execute(.startNext, database: database)
    let firstId = try XCTUnwrap(first.sessionId)
    let second = try LoofitWorkoutCommandEngine.execute(
      .startFree(bodyPartIds: [3], label: nil),
      database: database
    )
    XCTAssertEqual(second.status, .noop)
    XCTAssertEqual(second.sessionId, firstId)
    XCTAssertEqual(try database.firstInt64(
      "SELECT COUNT(*) FROM workout_sessions WHERE status = 'active'"
    ), 1)

    let now = LoofitWorkoutDate.nowISO8601()
    XCTAssertThrowsError(try database.run(
      """
      INSERT INTO workout_sessions
        (routine_id, routine_day_id, started_at, ended_at, duration_seconds,
         status, note, created_at, updated_at)
      VALUES (NULL, NULL, ?, NULL, 0, 'active', NULL, ?, ?)
      """,
      [.text(now), .text(now), .text(now)]
    ))
    XCTAssertEqual(try database.firstInt64(
      "SELECT COUNT(*) FROM workout_sessions WHERE status = 'active'"
    ), 1)
  }

  func testStartRollsBackSessionWhenPartSnapshotInsertFails() throws {
    try seedRoutine()
    try database.execute("""
      CREATE TRIGGER reject_part_snapshot
      BEFORE INSERT ON workout_session_parts_snapshot
      BEGIN
        SELECT RAISE(ABORT, 'test snapshot failure');
      END;
      """)

    XCTAssertThrowsError(
      try LoofitWorkoutCommandEngine.execute(.startNext, database: database)
    )
    XCTAssertEqual(try database.firstInt64("SELECT COUNT(*) FROM workout_sessions"), 0)
    XCTAssertEqual(try database.firstInt64(
      "SELECT COUNT(*) FROM workout_session_parts_snapshot"
    ), 0)
  }
}
