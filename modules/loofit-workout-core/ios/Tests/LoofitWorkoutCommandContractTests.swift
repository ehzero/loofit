import Foundation
import XCTest
@testable import LoofitWorkoutCore

final class LoofitWorkoutCommandContractTests: LoofitWorkoutCoreTestCase {
  func testSharedCommandScenariosMatchNativeEngine() throws {
    let fixture = try loadFixture()
    XCTAssertEqual(try requiredInt(fixture["version"], "fixture.version"), 1)
    let seed = try requiredDictionary(fixture["seed"], "fixture.seed")
    let scenarios = try requiredArray(fixture["scenarios"], "fixture.scenarios")

    for rawScenario in scenarios {
      let scenario = try requiredDictionary(rawScenario, "scenario")
      let scenarioId = try requiredString(scenario["id"], "scenario.id")
      try resetScenarioDatabase()
      try seedDatabase(seed)
      var capturedSessions: [String: Int64] = [:]

      let steps = try requiredArray(scenario["steps"], "\(scenarioId).steps")
      for (index, rawStep) in steps.enumerated() {
        let step = try requiredDictionary(rawStep, "\(scenarioId).step")
        let commandJSON = try requiredDictionary(
          step["command"],
          "\(scenarioId).step\(index + 1).command"
        )
        let command = try makeCommand(commandJSON, capturedSessions: capturedSessions)
        let result = try LoofitWorkoutCommandEngine.execute(command, database: database)
        let expected = try requiredDictionary(
          step["expect"],
          "\(scenarioId).step\(index + 1).expect"
        )
        let context = "\(scenarioId) step \(index + 1)"

        XCTAssertEqual(
          result.status.rawValue,
          try requiredString(expected["status"], "\(context).status"),
          context
        )
        try assertExpectedSession(
          actual: result.sessionId,
          expected: expected["sessionId"],
          capturedSessions: capturedSessions,
          context: context
        )

        if let captureName = step["captureSessionAs"] as? String {
          capturedSessions[captureName] = try XCTUnwrap(
            result.sessionId,
            "\(context) must capture a session"
          )
        }
      }

      let expectedState = try requiredDictionary(
        scenario["expectState"],
        "\(scenarioId).expectState"
      )
      try assertExpectedState(
        expectedState,
        capturedSessions: capturedSessions,
        scenarioId: scenarioId
      )
    }
  }

  private func makeCommand(
    _ value: [String: Any],
    capturedSessions: [String: Int64]
  ) throws -> LoofitWorkoutCommand {
    let type = try requiredString(value["type"], "command.type")
    switch type {
    case "startNext":
      return .startNext
    case "startRoutine":
      return .startRoutine(
        routineDayId: try requiredInt64(value["routineDayId"], "command.routineDayId")
      )
    case "startFree":
      return .startFree(
        bodyPartIds: try requiredInt64Array(value["bodyPartIds"], "command.bodyPartIds"),
        label: value["label"] as? String
      )
    case "changeRoutine":
      return .changeRoutine(
        expectedSessionId: try resolveReference(
          value["expectedSessionId"],
          capturedSessions: capturedSessions
        ),
        routineDayId: try requiredInt64(value["routineDayId"], "command.routineDayId")
      )
    case "changeFree":
      return .changeFree(
        expectedSessionId: try resolveReference(
          value["expectedSessionId"],
          capturedSessions: capturedSessions
        ),
        bodyPartIds: try requiredInt64Array(value["bodyPartIds"], "command.bodyPartIds")
      )
    case "complete":
      return .complete(expectedSessionId: try resolveReference(
        value["expectedSessionId"],
        capturedSessions: capturedSessions
      ))
    case "cancel":
      return .cancel(expectedSessionId: try resolveReference(
        value["expectedSessionId"],
        capturedSessions: capturedSessions
      ))
    default:
      throw ContractFixtureError("Unsupported command type: \(type)")
    }
  }

  private func assertExpectedSession(
    actual: Int64?,
    expected: Any?,
    capturedSessions: [String: Int64],
    context: String
  ) throws {
    if expected is NSNull {
      XCTAssertNil(actual, context)
      return
    }
    if let marker = expected as? String, marker == "nonNull" {
      XCTAssertNotNil(actual, context)
      return
    }
    XCTAssertEqual(
      actual,
      try resolveReference(expected, capturedSessions: capturedSessions),
      context
    )
  }

  private func assertExpectedState(
    _ expected: [String: Any],
    capturedSessions: [String: Int64],
    scenarioId: String
  ) throws {
    XCTAssertEqual(
      try database.firstInt64(
        "SELECT COUNT(*) FROM workout_sessions WHERE status = 'active'"
      ),
      try requiredInt64(expected["activeSessionCount"], "\(scenarioId).activeSessionCount"),
      scenarioId
    )
    XCTAssertEqual(
      try database.firstInt64(
        "SELECT next_routine_day_id FROM routine_progress WHERE id = 1"
      ),
      try requiredInt64(expected["nextRoutineDayId"], "\(scenarioId).nextRoutineDayId"),
      scenarioId
    )

    for rawSession in try requiredArray(expected["sessions"], "\(scenarioId).sessions") {
      let expectedSession = try requiredDictionary(rawSession, "\(scenarioId).session")
      let reference = try requiredString(expectedSession["ref"], "\(scenarioId).session.ref")
      let sessionId = try resolveReference(
        ["ref": reference],
        capturedSessions: capturedSessions
      )
      XCTAssertEqual(
        try status(of: sessionId),
        try requiredString(expectedSession["status"], "\(scenarioId).session.status"),
        scenarioId
      )

      let actualRoutineDayId = try database.firstInt64(
        "SELECT routine_day_id FROM workout_sessions WHERE id = ?",
        [.integer(sessionId)]
      )
      if expectedSession["routineDayId"] is NSNull {
        XCTAssertNil(actualRoutineDayId, scenarioId)
      } else {
        XCTAssertEqual(
          actualRoutineDayId,
          try requiredInt64(
            expectedSession["routineDayId"],
            "\(scenarioId).session.routineDayId"
          ),
          scenarioId
        )
      }

      let expectedParts = try requiredArray(
        expectedSession["parts"],
        "\(scenarioId).session.parts"
      ).map { try requiredString($0, "\(scenarioId).session.part") }
      XCTAssertEqual(try partNames(of: sessionId), expectedParts, scenarioId)
    }
  }

  private func seedDatabase(_ seed: [String: Any]) throws {
    let now = LoofitWorkoutDate.nowISO8601()
    let routineId = try requiredInt64(seed["routineId"], "seed.routineId")

    for rawPart in try requiredArray(seed["bodyParts"], "seed.bodyParts") {
      let part = try requiredDictionary(rawPart, "seed.bodyPart")
      try database.run(
        """
        INSERT INTO body_parts
          (id, name, color, sort_order, is_archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        """,
        [
          .integer(try requiredInt64(part["id"], "seed.bodyPart.id")),
          .text(try requiredString(part["name"], "seed.bodyPart.name")),
          .text(try requiredString(part["color"], "seed.bodyPart.color")),
          .integer(try requiredInt64(part["sortOrder"], "seed.bodyPart.sortOrder")),
          .text(now),
          .text(now),
        ]
      )
    }

    try database.run(
      "INSERT INTO routines (id, name, is_active, created_at, updated_at) VALUES (?, 'Contract Routine', 1, ?, ?)",
      [.integer(routineId), .text(now), .text(now)]
    )
    for rawDay in try requiredArray(seed["routineDays"], "seed.routineDays") {
      let day = try requiredDictionary(rawDay, "seed.routineDay")
      let dayId = try requiredInt64(day["id"], "seed.routineDay.id")
      try database.run(
        """
        INSERT INTO routine_days (id, routine_id, name, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """,
        [
          .integer(dayId),
          .integer(routineId),
          .text(try requiredString(day["name"], "seed.routineDay.name")),
          .integer(try requiredInt64(day["sortOrder"], "seed.routineDay.sortOrder")),
          .text(now),
          .text(now),
        ]
      )
      for (sortOrder, bodyPartId) in try requiredInt64Array(
        day["bodyPartIds"],
        "seed.routineDay.bodyPartIds"
      ).enumerated() {
        try database.run(
          "INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order) VALUES (?, ?, ?)",
          [.integer(dayId), .integer(bodyPartId), .integer(Int64(sortOrder))]
        )
      }
    }
    try database.run(
      """
      INSERT INTO routine_progress
        (id, active_routine_id, next_routine_day_id, updated_at)
      VALUES (1, ?, ?, ?)
      """,
      [
        .integer(routineId),
        .integer(try requiredInt64(seed["nextRoutineDayId"], "seed.nextRoutineDayId")),
        .text(now),
      ]
    )
  }

  private func resetScenarioDatabase() throws {
    try database.execute(
      """
      DELETE FROM workout_session_parts_snapshot;
      DELETE FROM workout_sessions;
      DELETE FROM routine_day_parts;
      DELETE FROM routine_days;
      DELETE FROM routines;
      DELETE FROM routine_progress;
      DELETE FROM body_parts;
      UPDATE widget_sync_state
      SET desired_revision = 0, published_revision = 0, last_error = NULL;
      """
    )
  }

  private func resolveReference(
    _ rawValue: Any?,
    capturedSessions: [String: Int64]
  ) throws -> Int64 {
    let reference = try requiredDictionary(rawValue, "session reference")
    let name = try requiredString(reference["ref"], "session reference.ref")
    guard let sessionId = capturedSessions[name] else {
      throw ContractFixtureError("Unknown session reference: \(name)")
    }
    return sessionId + Int64((reference["offset"] as? NSNumber)?.intValue ?? 0)
  }

  private func loadFixture() throws -> [String: Any] {
    let environmentPath = ProcessInfo.processInfo.environment["LOOFIT_COMMAND_SCENARIOS_PATH"]
    let fixtureURL: URL
    if let environmentPath {
      fixtureURL = URL(fileURLWithPath: environmentPath)
    } else {
      let testsDirectory = URL(fileURLWithPath: #filePath).deletingLastPathComponent()
      let repositoryRoot = (0..<4).reduce(testsDirectory) { url, _ in
        url.deletingLastPathComponent()
      }
      fixtureURL = repositoryRoot
        .appendingPathComponent("contracts")
        .appendingPathComponent("workout-command-scenarios.json")
    }
    let data = try Data(contentsOf: fixtureURL)
    return try requiredDictionary(
      JSONSerialization.jsonObject(with: data),
      "workout command fixture"
    )
  }

  private func requiredDictionary(_ value: Any?, _ path: String) throws -> [String: Any] {
    guard let dictionary = value as? [String: Any] else {
      throw ContractFixtureError("Expected object at \(path)")
    }
    return dictionary
  }

  private func requiredArray(_ value: Any?, _ path: String) throws -> [Any] {
    guard let array = value as? [Any] else {
      throw ContractFixtureError("Expected array at \(path)")
    }
    return array
  }

  private func requiredString(_ value: Any?, _ path: String) throws -> String {
    guard let string = value as? String else {
      throw ContractFixtureError("Expected string at \(path)")
    }
    return string
  }

  private func requiredInt(_ value: Any?, _ path: String) throws -> Int {
    guard let number = value as? NSNumber else {
      throw ContractFixtureError("Expected integer at \(path)")
    }
    return number.intValue
  }

  private func requiredInt64(_ value: Any?, _ path: String) throws -> Int64 {
    guard let number = value as? NSNumber else {
      throw ContractFixtureError("Expected integer at \(path)")
    }
    return number.int64Value
  }

  private func requiredInt64Array(_ value: Any?, _ path: String) throws -> [Int64] {
    try requiredArray(value, path).map { try requiredInt64($0, path) }
  }
}

private struct ContractFixtureError: Error, CustomStringConvertible {
  let description: String

  init(_ description: String) {
    self.description = description
  }
}
