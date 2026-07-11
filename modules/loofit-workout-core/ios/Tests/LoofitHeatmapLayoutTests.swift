import XCTest
@testable import LoofitWorkoutCore

final class LoofitHeatmapLayoutTests: XCTestCase {
  func testThirtyDayProjectionKeepsLeadingCalendarCellsEmptyAndOutOfStats() throws {
    let calendar = try seoulCalendar()
    let endingAt = try date(year: 2026, month: 7, day: 11, calendar: calendar)
    let snapshot = makeSnapshot(daily: [
      .init(dateKey: "2026-06-10", workoutCount: 9, durationSeconds: 9_000),
      .init(dateKey: "2026-06-12", workoutCount: 2, durationSeconds: 1_200),
    ])

    let days = LoofitHeatmapProjection.month(
      snapshot: snapshot,
      endingAt: endingAt,
      calendar: calendar
    )

    XCTAssertEqual(days.count, 35)
    XCTAssertEqual(days.first?.dateKey, "2026-06-07")
    XCTAssertEqual(days.last?.dateKey, "2026-07-11")
    XCTAssertEqual(days.filter(\.inRange).count, 30)
    XCTAssertEqual(days.prefix(5).map(\.dateKey), [
      "2026-06-07",
      "2026-06-08",
      "2026-06-09",
      "2026-06-10",
      "2026-06-11",
    ])
    XCTAssertTrue(days.prefix(5).allSatisfy { !$0.inRange })
    XCTAssertTrue(days.prefix(5).allSatisfy {
      $0.workoutCount == 0 && $0.durationSeconds == 0
    })

    let firstInRange = try XCTUnwrap(days.first { $0.dateKey == "2026-06-12" })
    XCTAssertTrue(firstInRange.inRange)
    XCTAssertEqual(firstInRange.workoutCount, 2)
    XCTAssertEqual(firstInRange.durationSeconds, 1_200)
  }

  func testSixMonthLayoutInsertsMonthBoundaryStepsAndLabelsEveryMonth() throws {
    let calendar = try seoulCalendar()
    let endingAt = try date(year: 2026, month: 7, day: 11, calendar: calendar)
    let days = LoofitHeatmapProjection.sixMonths(
      snapshot: nil,
      endingAt: endingAt,
      calendar: calendar
    )
    let columns = LoofitHeatmapProjection.sixMonthColumns(
      from: days,
      calendar: calendar
    )
    let slots = columns.flatMap(\.slots)

    XCTAssertEqual(days.count, 161)
    XCTAssertEqual(columns.count, 28)
    XCTAssertEqual(slots.filter(\.isGap).count, 35)
    XCTAssertEqual(columns.map(\.monthLabel).filter { !$0.isEmpty }, [
      "2월",
      "3월",
      "4월",
      "5월",
      "6월",
      "7월",
    ])

    for (monthOffset, month) in Array(2...7).enumerated() {
      let key = String(format: "2026-%02d-01", month)
      let sourceIndex = try XCTUnwrap(days.firstIndex { $0.dateKey == key })
      let layoutIndex = try XCTUnwrap(slots.firstIndex { $0.day?.dateKey == key })
      XCTAssertEqual(layoutIndex, sourceIndex + monthOffset * 7)

      let monthStart = try date(year: 2026, month: month, day: 1, calendar: calendar)
      let expectedWeekdayRow = calendar.component(.weekday, from: monthStart) - 1
      XCTAssertEqual(layoutIndex % 7, expectedWeekdayRow)
    }
  }

  private func seoulCalendar() throws -> Calendar {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Asia/Seoul"))
    calendar.locale = Locale(identifier: "ko_KR")
    calendar.firstWeekday = 1
    return calendar
  }

  private func date(
    year: Int,
    month: Int,
    day: Int,
    calendar: Calendar
  ) throws -> Date {
    try XCTUnwrap(calendar.date(from: DateComponents(
      calendar: calendar,
      timeZone: calendar.timeZone,
      year: year,
      month: month,
      day: day,
      hour: 12
    )))
  }

  private func makeSnapshot(
    daily: [LoofitWorkoutDailyAggregate]
  ) -> LoofitWorkoutSnapshot {
    LoofitWorkoutSnapshot(
      revision: 1,
      generatedAt: "2026-07-11T00:00:00.000Z",
      theme: LoofitWidgetTheme(),
      activeSession: nil,
      nextWorkout: nil,
      latestCompletedToday: nil,
      completedToday: [],
      dailyCompleted: daily,
      recentCompleted: [],
      surfaceHashes: [:]
    )
  }
}
