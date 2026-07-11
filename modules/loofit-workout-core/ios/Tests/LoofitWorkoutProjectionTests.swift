import XCTest
@testable import LoofitWorkoutCore

final class LoofitWorkoutProjectionTests: LoofitWorkoutCoreTestCase {
  func testProcessLockWaitIsBoundedToFiveHundredMilliseconds() async throws {
    let first = try await LoofitWorkoutProcessLock.acquire(
      databaseDirectory: databaseDirectory
    )
    defer { first.unlock() }

    let startedAt = Date()
    do {
      _ = try await LoofitWorkoutProcessLock.acquire(
        databaseDirectory: databaseDirectory
      )
      XCTFail("A second process lock should time out while the first is held")
    } catch {
      let elapsed = Date().timeIntervalSince(startedAt)
      XCTAssertGreaterThanOrEqual(elapsed, 0.45)
      XCTAssertLessThan(elapsed, 1.0)
    }
  }

  func testReconcilePublishesDirtyRevisionAndAtomicSnapshot() async throws {
    try seedRoutine()
    let dirty = try database.revisions()
    XCTAssertGreaterThan(dirty.desired, dirty.published)

    let first = try await LoofitWorkoutPipeline.reconcile(
      databaseDirectory: databaseDirectory,
      widgetsEnabled: false
    )
    XCTAssertEqual(first.desiredRevision, first.publishedRevision)
    let firstSnapshot = try XCTUnwrap(
      LoofitWorkoutSnapshotStore.load(from: databaseDirectory)
    )
    XCTAssertEqual(firstSnapshot.revision, first.desiredRevision)
    XCTAssertEqual(firstSnapshot.nextWorkout?.title, "Push")

    let oldRevision = first.publishedRevision
    try database.run(
      "UPDATE body_parts SET name = '푸시', updated_at = ? WHERE id = 1",
      [.text(LoofitWorkoutDate.nowISO8601())]
    )
    let changed = try database.revisions()
    XCTAssertGreaterThan(changed.desired, oldRevision)
    XCTAssertEqual(changed.published, oldRevision)

    let second = try await LoofitWorkoutPipeline.reconcile(
      databaseDirectory: databaseDirectory,
      widgetsEnabled: false
    )
    XCTAssertEqual(second.desiredRevision, second.publishedRevision)
    XCTAssertGreaterThan(second.publishedRevision, oldRevision)
    let secondSnapshot = try XCTUnwrap(
      LoofitWorkoutSnapshotStore.load(from: databaseDirectory)
    )
    XCTAssertEqual(secondSnapshot.revision, second.publishedRevision)
    XCTAssertEqual(secondSnapshot.nextWorkout?.parts.map(\.name), ["푸시"])
  }

  func testProjectionAggregatesCompletedSessionsAndLimitsToSixCalendarMonths() throws {
    let calendar = Calendar.autoupdatingCurrent
    let monthStart = calendar.date(
      from: calendar.dateComponents([.year, .month], from: Date())
    )!
    let included = calendar.date(byAdding: .month, value: -5, to: monthStart)!
      .addingTimeInterval(12 * 60 * 60)
    let excluded = calendar.date(byAdding: .month, value: -6, to: monthStart)!
      .addingTimeInterval(12 * 60 * 60)
    let today = localDate(daysFromToday: 0)

    try insertCompletedSession(startedAt: today, duration: 120)
    try insertCompletedSession(startedAt: today.addingTimeInterval(60), duration: 180)
    try insertCompletedSession(startedAt: included, duration: 60, bodyPartName: "등")
    try insertCompletedSession(startedAt: excluded, duration: 999, bodyPartName: "하체")

    let snapshot = try LoofitWorkoutProjection.makeSnapshot(database: database)
    let todayAggregate = try XCTUnwrap(
      snapshot.dailyCompleted.first { $0.dateKey == localDateKey(today) }
    )
    XCTAssertEqual(todayAggregate.workoutCount, 2)
    XCTAssertEqual(todayAggregate.durationSeconds, 300)
    XCTAssertNotNil(snapshot.dailyCompleted.first {
      $0.dateKey == localDateKey(included)
    })
    XCTAssertNil(snapshot.dailyCompleted.first {
      $0.dateKey == localDateKey(excluded)
    })
  }

  func testSurfaceHashesRespectSevenAndThirtyDayWindows() throws {
    let today = localDate(daysFromToday: 0)
    for offset in 0..<12 {
      try insertCompletedSession(
        startedAt: today.addingTimeInterval(TimeInterval(offset * 60)),
        duration: 30
      )
    }
    let baseline = try LoofitWorkoutProjection.makeSnapshot(database: database)

    try insertCompletedSession(startedAt: localDate(daysFromToday: -7), duration: 70)
    let afterSevenDaysAgo = try LoofitWorkoutProjection.makeSnapshot(database: database)
    XCTAssertEqual(
      baseline.surfaceHashes[LoofitWidgetKinds.heatmapWeek],
      afterSevenDaysAgo.surfaceHashes[LoofitWidgetKinds.heatmapWeek]
    )
    XCTAssertNotEqual(
      baseline.surfaceHashes[LoofitWidgetKinds.heatmapMonth],
      afterSevenDaysAgo.surfaceHashes[LoofitWidgetKinds.heatmapMonth]
    )

    let monthBeforeBoundary = afterSevenDaysAgo.surfaceHashes[LoofitWidgetKinds.heatmapMonth]
    let sixMonthsBeforeBoundary = afterSevenDaysAgo.surfaceHashes[
      LoofitWidgetKinds.heatmapSixMonths
    ]
    try insertCompletedSession(startedAt: localDate(daysFromToday: -30), duration: 80)
    let afterThirtyDaysAgo = try LoofitWorkoutProjection.makeSnapshot(database: database)
    XCTAssertEqual(
      monthBeforeBoundary,
      afterThirtyDaysAgo.surfaceHashes[LoofitWidgetKinds.heatmapMonth]
    )
    XCTAssertNotEqual(
      sixMonthsBeforeBoundary,
      afterThirtyDaysAgo.surfaceHashes[LoofitWidgetKinds.heatmapSixMonths]
    )

    let weekBeforeIncludedDay = afterThirtyDaysAgo.surfaceHashes[
      LoofitWidgetKinds.heatmapWeek
    ]
    try insertCompletedSession(startedAt: localDate(daysFromToday: -6), duration: 90)
    let afterSixDaysAgo = try LoofitWorkoutProjection.makeSnapshot(database: database)
    XCTAssertNotEqual(
      weekBeforeIncludedDay,
      afterSixDaysAgo.surfaceHashes[LoofitWidgetKinds.heatmapWeek]
    )
  }

  func testCompletedTodayUsesDeviceLocalMidnight() throws {
    let calendar = Calendar.autoupdatingCurrent
    let todayStart = calendar.startOfDay(for: Date())
    let previousDay = todayStart.addingTimeInterval(-60)
    let currentDay = todayStart.addingTimeInterval(60)
    let previousId = try insertCompletedSession(startedAt: previousDay, duration: 30)
    let currentId = try insertCompletedSession(startedAt: currentDay, duration: 40)

    let snapshot = try LoofitWorkoutProjection.makeSnapshot(database: database)
    XCTAssertEqual(snapshot.completedToday.map(\.id), [currentId])
    XCTAssertEqual(snapshot.latestCompletedToday?.id, currentId)
    XCTAssertFalse(snapshot.completedToday.map(\.id).contains(previousId))
  }

  func testProjectionReassignsDailyAggregateAfterTimeZoneChange() throws {
    let originalTimeZone = NSTimeZone.default
    defer { NSTimeZone.default = originalTimeZone }

    var utcCalendar = Calendar(identifier: .gregorian)
    utcCalendar.timeZone = try XCTUnwrap(TimeZone(identifier: "UTC"))
    let previousUTCDate = utcCalendar.date(
      byAdding: .day,
      value: -1,
      to: utcCalendar.startOfDay(for: Date())
    )!
    let boundarySession = utcCalendar.date(
      byAdding: .minute,
      value: 23 * 60 + 30,
      to: previousUTCDate
    )!
    try insertCompletedSession(startedAt: boundarySession, duration: 60)

    NSTimeZone.default = try XCTUnwrap(TimeZone(identifier: "UTC"))
    let utcSnapshot = try LoofitWorkoutProjection.makeSnapshot(database: database)
    let utcKey = try XCTUnwrap(utcSnapshot.dailyCompleted.first?.dateKey)

    NSTimeZone.default = try XCTUnwrap(TimeZone(identifier: "Asia/Tokyo"))
    let tokyoSnapshot = try LoofitWorkoutProjection.makeSnapshot(database: database)
    let tokyoKey = try XCTUnwrap(tokyoSnapshot.dailyCompleted.first?.dateKey)

    XCTAssertEqual(utcSnapshot.timeZoneIdentifier, "GMT")
    XCTAssertEqual(tokyoSnapshot.timeZoneIdentifier, "Asia/Tokyo")
    XCTAssertNotEqual(utcKey, tokyoKey)
  }
}
