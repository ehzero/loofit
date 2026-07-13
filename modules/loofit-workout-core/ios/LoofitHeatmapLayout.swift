import Foundation

public struct LoofitHeatmapDay: Identifiable, Equatable, Sendable {
  public let date: Date
  public let dateKey: String
  public let workoutCount: Int
  public let durationSeconds: Int
  public let inRange: Bool

  public var id: String { dateKey }

  public init(
    date: Date,
    dateKey: String,
    workoutCount: Int,
    durationSeconds: Int,
    inRange: Bool
  ) {
    self.date = date
    self.dateKey = dateKey
    self.workoutCount = workoutCount
    self.durationSeconds = durationSeconds
    self.inRange = inRange
  }
}

public enum LoofitHeatmapSlot: Identifiable, Equatable, Sendable {
  case day(LoofitHeatmapDay)
  case gap(id: String)

  public var id: String {
    switch self {
    case .day(let day):
      return "day-\(day.dateKey)"
    case .gap(let id):
      return id
    }
  }

  public var day: LoofitHeatmapDay? {
    guard case .day(let day) = self else { return nil }
    return day
  }

  public var isGap: Bool {
    if case .gap = self { return true }
    return false
  }
}

public struct LoofitHeatmapColumn: Identifiable, Equatable, Sendable {
  public let id: String
  public let slots: [LoofitHeatmapSlot]
  public let monthLabel: String

  public init(id: String, slots: [LoofitHeatmapSlot], monthLabel: String) {
    self.id = id
    self.slots = slots
    self.monthLabel = monthLabel
  }
}

public enum LoofitHeatmapProjection {
  public static func days(
    snapshot: LoofitWorkoutSnapshot?,
    endingAt date: Date,
    count: Int,
    calendar: Calendar = .autoupdatingCurrent
  ) -> [LoofitHeatmapDay] {
    let end = calendar.startOfDay(for: date)
    let start = calendar.date(byAdding: .day, value: -(count - 1), to: end) ?? end
    return range(
      snapshot: snapshot,
      start: start,
      end: end,
      inRangeStart: start,
      calendar: calendar
    )
  }

  public static func calendarWeeks(
    snapshot: LoofitWorkoutSnapshot?,
    endingAt date: Date,
    count: Int,
    calendar: Calendar = .autoupdatingCurrent
  ) -> [LoofitHeatmapDay] {
    let end = calendar.startOfDay(for: date)
    let start = calendarWeekRangeStart(endingAt: end, count: count, calendar: calendar)
    return range(
      snapshot: snapshot,
      start: start,
      end: end,
      inRangeStart: start,
      calendar: calendar
    )
  }

  public static func currentMonth(
    snapshot: LoofitWorkoutSnapshot?,
    containing date: Date,
    calendar: Calendar = .autoupdatingCurrent
  ) -> [LoofitHeatmapDay] {
    let today = calendar.startOfDay(for: date)
    let monthStart = calendar.date(
      from: calendar.dateComponents([.year, .month], from: today)
    ) ?? today
    let nextMonth = calendar.date(byAdding: .month, value: 1, to: monthStart) ?? monthStart
    let monthEnd = calendar.date(byAdding: .day, value: -1, to: nextMonth) ?? today
    let gridStart = calendar.date(
      byAdding: .day,
      value: -(calendar.component(.weekday, from: monthStart) - 1),
      to: monthStart
    ) ?? monthStart
    let gridEnd = calendar.date(
      byAdding: .day,
      value: 7 - calendar.component(.weekday, from: monthEnd),
      to: monthEnd
    ) ?? monthEnd
    return range(
      snapshot: snapshot,
      start: gridStart,
      end: gridEnd,
      inRangeStart: monthStart,
      inRangeEnd: monthEnd,
      calendar: calendar
    )
  }

  public static func calendarWeekRangeStart(
    endingAt date: Date,
    count: Int,
    calendar: Calendar = .autoupdatingCurrent
  ) -> Date {
    let end = calendar.startOfDay(for: date)
    let daysSinceSunday = calendar.component(.weekday, from: end) - 1
    let currentWeekStart = calendar.date(
      byAdding: .day,
      value: -daysSinceSunday,
      to: end
    ) ?? end
    return calendar.date(
      byAdding: .weekOfYear,
      value: -(max(count, 1) - 1),
      to: currentWeekStart
    ) ?? currentWeekStart
  }

  public static func sixMonths(
    snapshot: LoofitWorkoutSnapshot?,
    endingAt date: Date,
    calendar: Calendar = .autoupdatingCurrent
  ) -> [LoofitHeatmapDay] {
    let end = calendar.startOfDay(for: date)
    let currentMonth = calendar.date(
      from: calendar.dateComponents([.year, .month], from: end)
    ) ?? end
    let rangeStart = calendar.date(
      byAdding: .month,
      value: -(LoofitWidgetLayoutContract.Heatmap.sixMonthRangeMonths - 1),
      to: currentMonth
    ) ?? currentMonth
    let weekday = calendar.component(.weekday, from: rangeStart)
    let daysSinceSunday = weekday - 1
    let gridStart = calendar.date(
      byAdding: .day,
      value: -daysSinceSunday,
      to: rangeStart
    ) ?? rangeStart
    return range(
      snapshot: snapshot,
      start: gridStart,
      end: end,
      inRangeStart: rangeStart,
      calendar: calendar
    )
  }

  public static func sixMonthColumns(
    from days: [LoofitHeatmapDay],
    calendar: Calendar = .autoupdatingCurrent
  ) -> [LoofitHeatmapColumn] {
    var slots: [LoofitHeatmapSlot] = []
    var hasSeenFirstMonth = false

    for day in days {
      let isMonthStart = day.inRange && calendar.component(.day, from: day.date) == 1
      if isMonthStart {
        if hasSeenFirstMonth {
          for offset in 0..<LoofitWidgetLayoutContract.Heatmap.monthBoundaryGapSlots {
            slots.append(.gap(id: "month-gap-\(day.dateKey)-\(offset)"))
          }
        } else {
          hasSeenFirstMonth = true
        }
      }
      slots.append(.day(day))
    }

    let rows = LoofitWidgetLayoutContract.calendarRows
    let slotColumns: [[LoofitHeatmapSlot]] = stride(from: 0, to: slots.count, by: rows).map {
      Array(slots[$0..<Swift.min($0 + rows, slots.count)])
    }
    var labels = Array(repeating: "", count: slotColumns.count)

    for columnIndex in slotColumns.indices {
      guard let monthStartIndex = slotColumns[columnIndex].firstIndex(where: { slot in
        guard let day = slot.day else { return false }
        return day.inRange && calendar.component(.day, from: day.date) == 1
      }), let monthStart = slotColumns[columnIndex][monthStartIndex].day else {
        continue
      }

      let labelColumn = monthStartIndex == 0 || columnIndex + 1 >= slotColumns.count
        ? columnIndex
        : columnIndex + 1
      labels[labelColumn] = "\(calendar.component(.month, from: monthStart.date))월"
    }

    return slotColumns.enumerated().map { index, columnSlots in
      LoofitHeatmapColumn(
        id: "six-month-column-\(index)-\(columnSlots.first?.id ?? "empty")",
        slots: columnSlots,
        monthLabel: labels[index]
      )
    }
  }

  public static func dateKey(
    _ date: Date,
    calendar: Calendar = .autoupdatingCurrent
  ) -> String {
    let components = calendar.dateComponents([.year, .month, .day], from: date)
    return String(
      format: "%04d-%02d-%02d",
      components.year ?? 0,
      components.month ?? 0,
      components.day ?? 0
    )
  }

  private static func range(
    snapshot: LoofitWorkoutSnapshot?,
    start: Date,
    end: Date,
    inRangeStart: Date,
    inRangeEnd: Date? = nil,
    calendar: Calendar
  ) -> [LoofitHeatmapDay] {
    let values = Dictionary(
      uniqueKeysWithValues: (snapshot?.dailyCompleted ?? []).map { ($0.dateKey, $0) }
    )
    var result: [LoofitHeatmapDay] = []
    var cursor = start

    while calendar.compare(cursor, to: end, toGranularity: .day) != .orderedDescending {
      let key = dateKey(cursor, calendar: calendar)
      let isAfterStart = calendar.compare(
        cursor,
        to: inRangeStart,
        toGranularity: .day
      ) != .orderedAscending
      let isBeforeEnd = inRangeEnd.map {
        calendar.compare(cursor, to: $0, toGranularity: .day) != .orderedDescending
      } ?? true
      let isInRange = isAfterStart && isBeforeEnd
      let aggregate = isInRange ? values[key] : nil
      result.append(
        LoofitHeatmapDay(
          date: cursor,
          dateKey: key,
          workoutCount: aggregate?.workoutCount ?? 0,
          durationSeconds: aggregate?.durationSeconds ?? 0,
          inRange: isInRange
        )
      )
      guard let next = calendar.date(byAdding: .day, value: 1, to: cursor) else {
        break
      }
      cursor = next
    }
    return result
  }
}
