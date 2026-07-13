import XCTest
@testable import LoofitWorkoutCore

final class LoofitHeatmapLayoutTests: XCTestCase {
  func testCurrentMonthIncludesOnlyMonthCellsInACompleteCalendarGrid() throws {
    var calendar = Calendar(identifier: .gregorian)
    calendar.timeZone = try XCTUnwrap(TimeZone(identifier: "Asia/Seoul"))
    let date = try XCTUnwrap(calendar.date(from: DateComponents(
      year: 2026,
      month: 7,
      day: 13,
      hour: 12
    )))
    let days = LoofitHeatmapProjection.currentMonth(
      snapshot: nil,
      containing: date,
      calendar: calendar
    )

    XCTAssertEqual(days.count, 35)
    XCTAssertEqual(days.first?.dateKey, "2026-06-28")
    XCTAssertEqual(days.last?.dateKey, "2026-08-01")
    XCTAssertEqual(days.filter(\.inRange).count, 31)
    XCTAssertFalse(try XCTUnwrap(days.first).inRange)
    XCTAssertTrue(try XCTUnwrap(days.first { $0.dateKey == "2026-07-31" }).inRange)
  }

  func testFiveWeekProjectionStartsFourSundaysAgoAndIncludesBoundaryData() throws {
    let calendar = try seoulCalendar()
    let endingAt = try date(year: 2026, month: 7, day: 11, calendar: calendar)
    let snapshot = makeSnapshot(daily: [
      .init(dateKey: "2026-06-06", workoutCount: 9, durationSeconds: 9_000),
      .init(dateKey: "2026-06-07", workoutCount: 2, durationSeconds: 1_200),
    ])

    let days = LoofitHeatmapProjection.calendarWeeks(
      snapshot: snapshot,
      endingAt: endingAt,
      count: 5,
      calendar: calendar
    )

    XCTAssertEqual(days.count, 35)
    XCTAssertEqual(days.first?.dateKey, "2026-06-07")
    XCTAssertEqual(days.last?.dateKey, "2026-07-11")
    XCTAssertTrue(days.allSatisfy(\.inRange))

    let firstDay = try XCTUnwrap(days.first)
    XCTAssertEqual(firstDay.workoutCount, 2)
    XCTAssertEqual(firstDay.durationSeconds, 1_200)
  }

  func testFiveWeekProjectionUsesTwentyNineToThirtyFiveDatesAcrossTheWeek() throws {
    let calendar = try seoulCalendar()

    for day in 12...18 {
      let endingAt = try date(year: 2026, month: 7, day: day, calendar: calendar)
      let days = LoofitHeatmapProjection.calendarWeeks(
        snapshot: nil,
        endingAt: endingAt,
        count: 5,
        calendar: calendar
      )
      let weekdayOffset = calendar.component(.weekday, from: endingAt) - 1

      XCTAssertEqual(days.count, 29 + weekdayOffset)
      XCTAssertEqual(Int(ceil(Double(days.count) / 7.0)), 5)
      XCTAssertEqual(calendar.component(.weekday, from: try XCTUnwrap(days.first?.date)), 1)
      XCTAssertEqual(days.last?.dateKey, LoofitHeatmapProjection.dateKey(endingAt, calendar: calendar))
      XCTAssertTrue(days.allSatisfy(\.inRange))
    }
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
