import ActivityKit
import AppIntents
import Foundation
import SwiftUI
import WidgetKit
import LoofitWorkoutCore

// MARK: - Shared timeline

struct LoofitWidgetEntry: TimelineEntry {
  let date: Date
  let snapshot: LoofitWorkoutSnapshot?

  var palette: LoofitWidgetPalette {
    LoofitWidgetPalette(theme: snapshot?.theme)
  }
}

struct LoofitSnapshotTimelineProvider: TimelineProvider {
  func placeholder(in context: Context) -> LoofitWidgetEntry {
    LoofitWidgetEntry(date: Date(), snapshot: nil)
  }

  func getSnapshot(in context: Context, completion: @escaping (LoofitWidgetEntry) -> Void) {
    Task {
      completion(LoofitWidgetEntry(date: Date(), snapshot: await loadCurrentSnapshot()))
    }
  }

  func getTimeline(in context: Context, completion: @escaping (Timeline<LoofitWidgetEntry>) -> Void) {
    Task {
      let now = Date()
      let nextMidnight = Calendar.current.nextDate(
        after: now,
        matching: DateComponents(hour: 0, minute: 0, second: 0),
        matchingPolicy: .nextTime
      ) ?? now.addingTimeInterval(24 * 60 * 60)
      let snapshot = await loadCurrentSnapshot()
      let entries = [
        LoofitWidgetEntry(date: now, snapshot: snapshot),
        LoofitWidgetEntry(date: nextMidnight, snapshot: snapshot),
      ]
      completion(Timeline(entries: entries, policy: .after(nextMidnight.addingTimeInterval(1))))
    }
  }

  private func loadCurrentSnapshot() async -> LoofitWorkoutSnapshot? {
    guard let directory = LoofitWorkoutIntentEnvironment.databaseDirectory() else {
      return nil
    }
    let snapshot = try? LoofitWorkoutSnapshotStore.load(from: directory)
    let currentTimeZone = Calendar.autoupdatingCurrent.timeZone.identifier
    guard snapshot?.timeZoneIdentifier != currentTimeZone else {
      return snapshot
    }
    _ = try? await LoofitWorkoutPipeline.reconcileWidgetTimeline(
      databaseDirectory: directory
    )
    return (try? LoofitWorkoutSnapshotStore.load(from: directory)) ?? snapshot
  }
}

// MARK: - Shared presentation

enum LoofitWorkoutDisplayState: Equatable {
  case idle
  case active
  case completed
}

struct LoofitWorkoutPresentation {
  let state: LoofitWorkoutDisplayState
  let sessionId: Int64?
  let title: String
  let detail: String
  let startedAt: Date?
  let durationSeconds: Int
  let timeRange: String
  let canStart: Bool

  init(snapshot: LoofitWorkoutSnapshot?, date: Date) {
    if let active = snapshot?.activeSession {
      state = .active
      sessionId = active.id
      title = active.title.isEmpty ? LoofitFormat.parts(active.parts) : active.title
      detail = active.detail
      startedAt = active.startedDate
      durationSeconds = 0
      timeRange = ""
      canStart = false
      return
    }

    let completed = (snapshot?.completedToday ?? [])
      .filter { session in
        guard let started = session.startedDate else { return false }
        return Calendar.current.isDate(started, inSameDayAs: date)
      }
      .sorted { ($0.startedDate ?? .distantPast) < ($1.startedDate ?? .distantPast) }

    if !completed.isEmpty {
      state = .completed
      sessionId = nil
      title = LoofitFormat.uniqueJoined(completed.map(\.title))
      let partNames = completed.flatMap(\.parts).map(\.name)
      let parts = LoofitFormat.uniqueJoined(partNames)
      detail = parts == title ? "" : parts
      startedAt = nil
      durationSeconds = completed.reduce(0) { $0 + $1.durationSeconds }
      if let first = completed.first?.startedDate,
        let last = completed.last.flatMap({ $0.endedDate ?? $0.startedDate })
      {
        timeRange = "\(LoofitFormat.clock(first)) – \(LoofitFormat.clock(last))"
      } else {
        timeRange = ""
      }
      canStart = false
      return
    }

    let next = snapshot?.nextWorkout
    state = .idle
    sessionId = nil
    title = next?.title.isEmpty == false
      ? next!.title
      : LoofitWidgetRendererContract.LockScreen.routineRequired
    detail = next?.detail ?? ""
    startedAt = nil
    durationSeconds = 0
    timeRange = ""
    canStart = next != nil
  }
}

enum LoofitFormat {
  static let koreanLocale = Locale(identifier: "ko_KR")

  static func duration(_ totalSeconds: Int) -> String {
    let seconds = max(0, totalSeconds)
    let hours = seconds / 3_600
    let minutes = (seconds % 3_600) / 60
    if hours > 0 { return "\(hours)시간 \(minutes)분" }
    if minutes > 0 { return "\(minutes)분" }
    return seconds == 0 ? "0분" : "\(seconds)초"
  }

  static func clock(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.locale = koreanLocale
    formatter.dateFormat = "a h:mm"
    return formatter.string(from: date)
  }

  static func parts(_ parts: [LoofitWorkoutPartSnapshot]) -> String {
    uniqueJoined(parts.sorted { $0.sortOrder < $1.sortOrder }.map(\.name))
  }

  static func uniqueJoined(_ values: [String]) -> String {
    var seen = Set<String>()
    return values
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty && seen.insert($0).inserted }
      .joined(separator: " · ")
  }

  static func relativeDay(_ date: Date, now: Date) -> String {
    let calendar = Calendar.current
    let start = calendar.startOfDay(for: date)
    let today = calendar.startOfDay(for: now)
    let days = max(0, calendar.dateComponents([.day], from: start, to: today).day ?? 0)
    if days == 0 { return "오늘" }
    if days == 1 { return "어제" }
    return "\(days)일 전"
  }
}

struct LoofitWidgetPalette {
  let brandName: String
  let accent: String
  let accentText: String
  let card: String
  let tx: String
  let tx2: String
  let tx3: String
  let tx4: String
  let heatmapTitle: String
  let textWeekend: String
  let tx5: String
  let surface2: String
  let secondaryButtonText: String
  let heatmapBase: String
  let heatmapEmpty: String
  let heatmapGap: String
  let todayIndicator: String

  init(theme: LoofitWidgetTheme?) {
    let theme = theme ?? LoofitWidgetTheme()
    brandName = theme.brandName
    accent = theme.accent
    accentText = theme.accentText
    card = theme.background
    tx = theme.titleColor
    tx2 = theme.heatmapFooterValueColor
    tx3 = theme.detailColor
    tx4 = theme.heatmapWeekdayLabelColor
    heatmapTitle = theme.heatmapTitleColor
    textWeekend = theme.heatmapWeekendLabelColor
    tx5 = theme.heatmapBrandColor
    surface2 = theme.secondaryButtonBackground
    secondaryButtonText = theme.secondaryButtonText
    heatmapBase = theme.heatmapBaseColor
    heatmapEmpty = theme.heatmapEmptyColor
    heatmapGap = theme.heatmapGapColor
    todayIndicator = theme.todayIndicatorColor
  }
}

extension View {
  @ViewBuilder
  func loofitWidgetBackground(_ color: Color) -> some View {
    if #available(iOS 17.0, *) {
      containerBackground(color, for: .widget)
    } else {
      background(color)
    }
  }
}

func LoofitHomeWidgetContentPadding(for size: CGSize) -> CGFloat {
  let shortestEdge = min(size.width, size.height)
  guard shortestEdge > 0 else {
    return LoofitWidgetRendererContract.contentPadding
  }
  return LoofitWidgetRendererContract.contentPadding
    * shortestEdge
    / LoofitWidgetRendererContract.ContentMargins.homeReferenceShortestEdge
}

func LoofitColor(_ value: String) -> Color {
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
  guard trimmed.hasPrefix("#"), let integer = UInt64(trimmed.dropFirst(), radix: 16) else {
    return .clear
  }
  switch trimmed.count {
  case 7:
    return Color(
      red: Double((integer >> 16) & 0xFF) / 255,
      green: Double((integer >> 8) & 0xFF) / 255,
      blue: Double(integer & 0xFF) / 255
    )
  case 9:
    return Color(
      red: Double((integer >> 24) & 0xFF) / 255,
      green: Double((integer >> 16) & 0xFF) / 255,
      blue: Double((integer >> 8) & 0xFF) / 255,
      opacity: Double(integer & 0xFF) / 255
    )
  default:
    return .clear
  }
}

func LoofitMixColor(_ first: String, _ second: String, weight: Double) -> Color {
  func channels(_ value: String) -> (Double, Double, Double)? {
    let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count == 7, trimmed.hasPrefix("#"),
      let integer = UInt64(trimmed.dropFirst(), radix: 16)
    else { return nil }
    return (
      Double((integer >> 16) & 0xFF) / 255,
      Double((integer >> 8) & 0xFF) / 255,
      Double(integer & 0xFF) / 255
    )
  }
  guard let a = channels(first), let b = channels(second) else {
    return LoofitColor(first)
  }
  return Color(
    red: a.0 * weight + b.0 * (1 - weight),
    green: a.1 * weight + b.1 * (1 - weight),
    blue: a.2 * weight + b.2 * (1 - weight)
  )
}

func LoofitHeatmapFillColor(
  for day: LoofitHeatmapDay,
  palette: LoofitWidgetPalette,
  showLeadingCalendarCells: Bool = false
) -> Color {
  guard day.inRange else {
    return showLeadingCalendarCells
      ? LoofitColor(palette.heatmapEmpty)
      : LoofitColor(palette.heatmapGap)
  }
  let thresholds = LoofitWidgetRendererContract.Heatmap.bucketThresholdSeconds
  let weights = LoofitWidgetRendererContract.Heatmap.bucketAccentWeights
  switch day.durationSeconds {
  case ...0:
    return LoofitColor(palette.heatmapEmpty)
  case ..<thresholds[0]:
    return LoofitMixColor(palette.accent, palette.heatmapBase, weight: weights[0])
  case ..<thresholds[1]:
    return LoofitMixColor(palette.accent, palette.heatmapBase, weight: weights[1])
  case ..<thresholds[2]:
    return LoofitMixColor(palette.accent, palette.heatmapBase, weight: weights[2])
  default:
    return LoofitMixColor(palette.accent, palette.heatmapBase, weight: weights[3])
  }
}

func LoofitHeatmapTextColor(
  for day: LoofitHeatmapDay,
  palette: LoofitWidgetPalette
) -> Color {
  if day.durationSeconds >= LoofitWidgetRendererContract.Heatmap.strongCellLabelMinimumDurationSeconds {
    return LoofitColor(palette.accentText)
  }
  if day.durationSeconds > 0 {
    return LoofitColor(palette.tx)
  }
  return LoofitColor(palette.tx4)
}

func LoofitVisibleRoutineItems(
  _ progress: LoofitRoutineProgressSnapshot?,
  limit: Int
) -> [LoofitRoutineProgressItemSnapshot] {
  guard let progress, !progress.items.isEmpty else { return [] }
  let count = max(limit, 1)
  guard progress.items.count > count else { return progress.items }
  let currentIndex = progress.items.firstIndex {
    $0.routineDayId == progress.currentRoutineDayId
  } ?? 0
  let maxStart = max(progress.items.count - count, 0)
  let start = min(max(currentIndex - count / 2, 0), maxStart)
  return Array(progress.items[start..<min(start + count, progress.items.count)])
}

func LoofitRoutineBodyParts(_ item: LoofitRoutineProgressItemSnapshot) -> String {
  let parts = item.latestCompleted?.parts ?? item.parts
  return LoofitFormat.uniqueJoined(parts.sorted { $0.sortOrder < $1.sortOrder }.map(\.name))
}

func LoofitRoutineWorkoutLabel(_ item: LoofitRoutineProgressItemSnapshot) -> String {
  let alias = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
  return alias.isEmpty ? LoofitRoutineBodyParts(item) : alias
}

func LoofitRoutineBodyPartDetail(_ item: LoofitRoutineProgressItemSnapshot) -> String {
  let alias = item.title.trimmingCharacters(in: .whitespacesAndNewlines)
  let bodyParts = LoofitRoutineBodyParts(item)
  return alias.isEmpty || alias == bodyParts ? "" : bodyParts
}

// MARK: - Heatmap projection and view

enum LoofitHeatmapVariant {
  case week
  case month
  case sixMonths

  var rendererSpec: LoofitHeatmapRendererSpec {
    switch self {
    case .week:
      return LoofitWidgetRendererContract.Heatmap.week
    case .month:
      return LoofitWidgetRendererContract.Heatmap.month
    case .sixMonths:
      return LoofitWidgetRendererContract.Heatmap.year
    }
  }
}

struct LoofitHeatmapWidgetView: View {
  let entry: LoofitWidgetEntry
  let variant: LoofitHeatmapVariant

  private var rendererSpec: LoofitHeatmapRendererSpec {
    variant.rendererSpec
  }

  private var days: [LoofitHeatmapDay] {
    switch rendererSpec.calendarAlignment {
    case .rollingDays:
      return LoofitHeatmapProjection.days(
        snapshot: entry.snapshot,
        endingAt: entry.date,
        count: rendererSpec.rangeDays
      )
    case .calendarWeeks:
      return LoofitHeatmapProjection.calendarWeeks(
        snapshot: entry.snapshot,
        endingAt: entry.date,
        count: rendererSpec.rangeWeeks
      )
    case .continuousMonthsWithBoundarySlots:
      return LoofitHeatmapProjection.sixMonths(snapshot: entry.snapshot, endingAt: entry.date)
    }
  }

  private var count: Int {
    days.filter(\.inRange).reduce(0) { $0 + $1.workoutCount }
  }

  private var duration: Int {
    days.filter(\.inRange).reduce(0) { $0 + $1.durationSeconds }
  }

  var body: some View {
    GeometryReader { geometry in
      let contentPadding = LoofitHomeWidgetContentPadding(for: geometry.size)
      VStack(alignment: .leading, spacing: rendererSpec.headerVisible ? rendererSpec.headerGap : 0) {
        if rendererSpec.headerVisible, rendererSpec.headerSummary != .none {
          Text(headerTitle)
            .font(.system(size: rendererSpec.headerFontSize, weight: LoofitWidgetRendererContract.FontWeight.medium))
            .foregroundStyle(LoofitColor(entry.palette.tx3))
            .lineLimit(1)
            .minimumScaleFactor(rendererSpec.headerMinimumScaleFactor)
            .frame(height: rendererSpec.headerLineHeight, alignment: .leading)
        }

        if rendererSpec.calendarAlignment == .continuousMonthsWithBoundarySlots {
          sixMonthGrid(available: geometry.size)
        } else {
          calendarGrid(available: geometry.size)
        }

        if rendererSpec.calendarAlignment == .rollingDays {
          Spacer(minLength: 0)
          weekStatsTop
          Spacer(minLength: 0)
          weekStat(at: 2)
          if shouldShowWeekRecent {
            Spacer(minLength: 0)
            weekRecent
          }
        } else if rendererSpec.calendarAlignment == .calendarWeeks {
          Spacer(minLength: 0)
          monthStats
        } else {
          Spacer(minLength: 0)
        }
      }
      .padding(contentPadding)
      .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
    }
    .loofitWidgetBackground(LoofitColor(entry.palette.card))
    .widgetURL(URL(string: "loofit://"))
  }

  private var headerTitle: String {
    switch rendererSpec.headerSummary {
    case .none:
      return rendererSpec.title
    case .count:
      return "\(rendererSpec.title) · \(count)회"
    case .countTotalAverage:
      let average = count > 0 ? duration / count : 0
      return "\(rendererSpec.title) · \(count)회 · 총 \(LoofitFormat.duration(duration)) · 평균 \(LoofitFormat.duration(average))"
    }
  }

  private func calendarGrid(available: CGSize) -> some View {
    let columns = max(rendererSpec.columns, 1)
    let rows = days.chunked(into: columns)
    let gap = rendererSpec.cellGap
    let padding = LoofitHomeWidgetContentPadding(for: available) * 2
    let width = max(0, available.width - padding - gap * CGFloat(columns - 1))
    let weekdayLabelHeightInCells = LoofitWidgetRendererContract.Heatmap.weekdayLabelHeightInCells
    let height = max(0, available.height - padding - rendererSpec.reservedHeaderHeight - rendererSpec.reservedFooterHeight - gap * CGFloat(rows.count))
    let gridHeightInCells = CGFloat(max(rows.count, 1)) + weekdayLabelHeightInCells
    let cell = max(0, min(width / CGFloat(columns), height / gridHeightInCells))
    return VStack(alignment: .leading, spacing: gap) {
      HStack(spacing: gap) {
        if rendererSpec.calendarAlignment == .rollingDays {
          ForEach(Array(days.prefix(columns))) { day in
            weekdayLabel(weekdayLabel(for: day.date), cell: cell)
          }
        } else {
          ForEach(
            Array(LoofitWidgetRendererContract.Heatmap.weekdayLabels.prefix(columns).enumerated()),
            id: \.offset
          ) { _, label in
            weekdayLabel(label, cell: cell)
          }
        }
      }
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        HStack(spacing: gap) {
          ForEach(row) { day in
            ZStack {
              RoundedRectangle(cornerRadius: rendererSpec.cellRadius)
                .fill(color(for: day))
              if day.inRange || rendererSpec.showLeadingCalendarCells {
                Text("\(Calendar.current.component(.day, from: day.date))")
                  .font(.system(size: rendererSpec.cellLabelSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
                  .foregroundStyle(labelColor(for: day))
                  .lineLimit(1)
                  .minimumScaleFactor(rendererSpec.cellLabelMinimumScaleFactor)
              }
            }
            .frame(width: cell, height: cell)
          }
          if row.count < columns {
            ForEach(row.count..<columns, id: \.self) { _ in
              Color.clear.frame(width: cell, height: cell)
            }
          }
        }
      }
    }
  }

  private func weekdayLabel(for date: Date) -> String {
    let labels = LoofitWidgetRendererContract.Heatmap.weekdayLabels
    let index = Calendar.current.component(.weekday, from: date) - 1
    return labels.indices.contains(index) ? labels[index] : ""
  }

  private func weekdayLabel(_ label: String, cell: CGFloat) -> some View {
    let color = LoofitWidgetRendererContract.Heatmap.weekendWeekdayLabels.contains(label)
      ? LoofitColor(entry.palette.textWeekend)
      : LoofitColor(entry.palette.tx4)
    return Text(label)
      .font(
        .system(
          size: LoofitWidgetRendererContract.Heatmap.weekdayLabelSize,
          weight: LoofitWidgetRendererContract.FontWeight.bold
        )
      )
      .foregroundStyle(color)
      .frame(
        width: cell,
        height: cell * LoofitWidgetRendererContract.Heatmap.weekdayLabelHeightInCells
      )
  }

  private func sixMonthGrid(available: CGSize) -> some View {
    let columns = LoofitHeatmapProjection.sixMonthColumns(from: days)
    let gap = rendererSpec.cellGap
    let calendarRows = max(LoofitWidgetRendererContract.Heatmap.weekdayLabels.count, 1)
    let padding = LoofitHomeWidgetContentPadding(for: available) * 2
    let width = max(0, available.width - padding - gap * CGFloat(max(columns.count - 1, 0)))
    let height = max(0, available.height - padding - rendererSpec.reservedHeaderHeight - gap * CGFloat(calendarRows - 1) - LoofitWidgetRendererContract.Heatmap.monthHeaderBottomGap)
    let cell = max(0, min(width / CGFloat(max(columns.count, 1)), height / CGFloat(calendarRows)))
    return HStack(alignment: .top, spacing: gap) {
      ForEach(columns) { column in
        VStack(alignment: .leading, spacing: gap) {
          Text(column.monthLabel)
            .font(.system(size: LoofitWidgetRendererContract.Heatmap.monthLabelSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
            .foregroundStyle(LoofitColor(entry.palette.tx4))
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .frame(width: cell, height: LoofitWidgetRendererContract.Heatmap.monthLabelHeight, alignment: .leading)
          ForEach(column.slots) { slot in
            switch slot {
            case .day(let day):
              RoundedRectangle(cornerRadius: rendererSpec.cellRadius)
                .fill(color(for: day))
                .frame(width: cell, height: cell)
            case .gap:
              Color.clear.frame(width: cell, height: cell)
            }
          }
          if column.slots.count < calendarRows {
            ForEach(column.slots.count..<calendarRows, id: \.self) { _ in
              Color.clear.frame(width: cell, height: cell)
            }
          }
        }
      }
    }
  }

  private var weekStatsTop: some View {
    return HStack(alignment: .firstTextBaseline, spacing: LoofitWidgetRendererContract.Heatmap.WeekFooter.topRowGap) {
      weekStat(at: 0)
        .fixedSize(horizontal: true, vertical: false)
      weekStat(at: 1)
        .frame(maxWidth: .infinity, alignment: .leading)
    }
  }

  private var monthStats: some View {
    Text(monthSummary)
      .font(
        .system(
          size: LoofitWidgetRendererContract.Heatmap.year.headerFontSize,
          weight: LoofitWidgetRendererContract.FontWeight.light
        )
      )
      .foregroundStyle(LoofitColor(entry.palette.tx3))
      .opacity(LoofitWidgetRendererContract.Opacity.muted)
      .lineLimit(1)
      .minimumScaleFactor(LoofitWidgetRendererContract.MinimumScale.dense)
  }

  private var monthSummary: String {
    return "\(count)회\(LoofitWidgetRendererContract.Heatmap.MonthFooter.separator)\(LoofitWidgetRendererContract.Heatmap.MonthFooter.totalDurationPrefix)\(LoofitFormat.duration(duration))"
  }

  private var orderedWeekStats: [(label: String, value: String)] {
    let order = LoofitWidgetRendererContract.Heatmap.WeekFooter.statOrder
    let labels = LoofitWidgetRendererContract.Heatmap.WeekFooter.statLabels
    return order.enumerated().map { index, stat in
      let label = labels.indices.contains(index) ? labels[index] : ""
      let value: String
      switch stat {
      case .count:
        value = "\(count)회"
      case .totalDuration:
        value = LoofitFormat.duration(duration)
      case .averageDuration:
        value = LoofitFormat.duration(count > 0 ? duration / count : 0)
      }
      return (label, value)
    }
  }

  private func weekStat(at index: Int) -> some View {
    let value = orderedWeekStats.indices.contains(index)
      ? orderedWeekStats[index]
      : (label: "", value: "")
    return stat(label: value.label, value: value.value)
  }

  private var recentWeekWorkouts: [LoofitWorkoutSessionSnapshot] {
    Array((entry.snapshot?.recentCompleted ?? []).filter {
      guard let started = $0.startedDate else { return false }
      return started >= Calendar.current.date(
        byAdding: .day,
        value: -(max(rendererSpec.rangeDays, 1) - 1),
        to: Calendar.current.startOfDay(for: entry.date)
      ) ?? .distantFuture
    }.prefix(LoofitWidgetRendererContract.Heatmap.WeekFooter.recentLimit))
  }

  private var shouldShowWeekRecent: Bool {
    LoofitWidgetRendererContract.Heatmap.WeekFooter.alwaysShowRecent ||
      !recentWeekWorkouts.isEmpty
  }

  private var weekRecent: some View {
    VStack(alignment: .leading, spacing: LoofitWidgetRendererContract.Heatmap.WeekFooter.recentRowGap) {
      Text(LoofitWidgetRendererContract.Heatmap.WeekFooter.recentLabel)
        .font(.system(size: LoofitWidgetRendererContract.Heatmap.WeekFooter.recentLabelSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
        .foregroundStyle(LoofitColor(entry.palette.tx5))
      if recentWeekWorkouts.isEmpty {
        Text(LoofitWidgetRendererContract.Heatmap.WeekFooter.emptyRecentLabel)
          .font(.system(size: LoofitWidgetRendererContract.Heatmap.WeekFooter.recentValueSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
          .foregroundStyle(LoofitColor(entry.palette.tx2))
          .lineLimit(1)
      } else {
        ForEach(recentWeekWorkouts, id: \.id) { session in
          HStack(spacing: LoofitWidgetRendererContract.Heatmap.WeekFooter.statGap) {
            Text("\(session.title) · \(LoofitFormat.duration(session.durationSeconds))")
              .font(.system(size: LoofitWidgetRendererContract.Heatmap.WeekFooter.recentValueSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
              .foregroundStyle(LoofitColor(entry.palette.tx2))
              .lineLimit(1)
            Spacer(minLength: 0)
            if let date = session.startedDate {
              Text(LoofitFormat.relativeDay(date, now: entry.date))
                .font(.system(size: LoofitWidgetRendererContract.Heatmap.WeekFooter.recentMetaSize, weight: LoofitWidgetRendererContract.FontWeight.medium))
                .foregroundStyle(LoofitColor(entry.palette.tx5))
            }
          }
        }
      }
    }
  }

  private func stat(label: String, value: String) -> some View {
    HStack(alignment: .firstTextBaseline, spacing: LoofitWidgetRendererContract.Heatmap.WeekFooter.statGap) {
      Text(label)
        .font(.system(size: LoofitWidgetRendererContract.Heatmap.WeekFooter.statLabelSize, weight: LoofitWidgetRendererContract.FontWeight.medium))
        .foregroundStyle(LoofitColor(entry.palette.tx5))
      Text(value)
        .font(.system(size: LoofitWidgetRendererContract.Heatmap.WeekFooter.statValueSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
        .foregroundStyle(LoofitColor(entry.palette.tx2))
        .lineLimit(1)
        .allowsTightening(true)
        .minimumScaleFactor(
          LoofitWidgetRendererContract.Heatmap.WeekFooter.statValueMinimumScale
        )
    }
  }

  private func color(for day: LoofitHeatmapDay) -> Color {
    LoofitHeatmapFillColor(
      for: day,
      palette: entry.palette,
      showLeadingCalendarCells: rendererSpec.showLeadingCalendarCells
    )
  }

  private func labelColor(for day: LoofitHeatmapDay) -> Color {
    LoofitHeatmapTextColor(for: day, palette: entry.palette)
  }
}

extension Array {
  func chunked(into size: Int) -> [[Element]] {
    guard size > 0 else { return [] }
    return stride(from: 0, to: count, by: size).map {
      Array(self[$0..<Swift.min($0 + size, count)])
    }
  }
}

// MARK: - Native Live Activity

struct LoofitWorkoutLiveActivity: Widget {
  var body: some WidgetConfiguration {
    ActivityConfiguration(for: LoofitWorkoutActivityAttributes.self) { context in
      LoofitWorkoutActivityBanner(context: context)
        .activityBackgroundTint(LoofitColor(context.state.background))
        .activitySystemActionForegroundColor(LoofitColor(context.state.titleColor))
        .widgetURL(URL(string: "loofit://"))
    } dynamicIsland: { context in
      DynamicIsland {
        DynamicIslandExpandedRegion(
          LoofitWidgetRendererContract.LiveActivity.Expanded.titleRegion
        ) {
          Text(context.state.title)
            .font(.system(
              size: LoofitWidgetRendererContract.LiveActivity.Expanded.titleFontSize,
              weight: LoofitWidgetRendererContract.FontWeight.bold
            ))
            .foregroundStyle(.white)
            .lineLimit(1)
            .minimumScaleFactor(
              LoofitWidgetRendererContract.LiveActivity.Expanded.titleMinimumScaleFactor
            )
            .frame(
              maxHeight: .infinity,
              alignment: LoofitWidgetRendererContract.LiveActivity.Expanded.sideRegionAlignment
            )
        }
        DynamicIslandExpandedRegion(
          LoofitWidgetRendererContract.LiveActivity.Expanded.timerRegion,
          priority: LoofitWidgetRendererContract.LiveActivity.Expanded.timerRegionPriority
        ) {
          LoofitActivityTimer(
            state: context.state,
            size: LoofitWidgetRendererContract.LiveActivity.Expanded.timerFontSize
          )
          .multilineTextAlignment(.trailing)
          .frame(
            maxWidth: .infinity,
            alignment: LoofitWidgetRendererContract.LiveActivity.Expanded.timerAlignment
          )
          .frame(height: LoofitWidgetRendererContract.LiveActivity.Expanded.timerLineHeight)
        }
        DynamicIslandExpandedRegion(
          LoofitWidgetRendererContract.LiveActivity.Expanded.endButtonRegion
        ) {
          LoofitActivityEndButton(
            sessionId: context.attributes.sessionId,
            accent: context.state.accent,
            accentText: context.state.accentText,
            width: LoofitWidgetRendererContract.LiveActivity.Expanded.buttonWidth,
            height: LoofitWidgetRendererContract.LiveActivity.Expanded.buttonHeight,
            fontSize: LoofitWidgetRendererContract.LiveActivity.Expanded.buttonFontSize
          )
          .frame(
            maxHeight: .infinity,
            alignment: LoofitWidgetRendererContract.LiveActivity.Expanded.sideRegionAlignment
          )
        }
      } compactLeading: {
        Text(context.state.title.replacingOccurrences(of: " · ", with: "·"))
          .font(.system(
            size: LoofitWidgetRendererContract.LiveActivity.Compact.fontSize,
            weight: LoofitWidgetRendererContract.FontWeight.bold
          ))
          .foregroundStyle(LoofitColor(context.state.accent))
          .lineLimit(1)
          .frame(
            width: LoofitWidgetRendererContract.LiveActivity.Compact.leadingWidth,
            alignment: .leading
          )
      } compactTrailing: {
        LoofitActivityTimer(
          state: context.state,
          size: LoofitWidgetRendererContract.LiveActivity.Compact.fontSize
        )
        .multilineTextAlignment(.trailing)
        .frame(width: LoofitWidgetRendererContract.LiveActivity.Compact.trailingWidth)
      } minimal: {
        Text(String(context.state.title.prefix(4)))
          .font(.system(
            size: LoofitWidgetRendererContract.LiveActivity.Minimal.fontSize,
            weight: LoofitWidgetRendererContract.FontWeight.bold
          ))
          .foregroundStyle(LoofitColor(context.state.accent))
          .lineLimit(1)
          .minimumScaleFactor(LoofitWidgetRendererContract.LiveActivity.Minimal.minimumScaleFactor)
      }
      .widgetURL(URL(string: "loofit://"))
      .keylineTint(LoofitColor(context.state.accent))
    }
  }
}

private struct LoofitWorkoutActivityBanner: View {
  let context: ActivityViewContext<LoofitWorkoutActivityAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: LoofitWidgetRendererContract.LiveActivity.Banner.contentGap) {
      HStack(spacing: LoofitWidgetRendererContract.LiveActivity.Banner.rowGap) {
        Text(context.state.title)
          .font(.system(
            size: LoofitWidgetRendererContract.LiveActivity.Banner.titleFontSize,
            weight: LoofitWidgetRendererContract.FontWeight.bold
          ))
          .foregroundStyle(LoofitColor(context.state.titleColor))
          .lineLimit(1)
          .minimumScaleFactor(LoofitWidgetRendererContract.LiveActivity.Banner.titleMinimumScaleFactor)
        Spacer(minLength: 0)
        Text(LoofitWidgetRendererContract.Control.Copy.active)
          .font(.system(
            size: LoofitWidgetRendererContract.LiveActivity.Banner.statusFontSize,
            weight: LoofitWidgetRendererContract.FontWeight.bold
          ))
          .foregroundStyle(LoofitColor(context.state.accent))
      }
      HStack(spacing: LoofitWidgetRendererContract.LiveActivity.Banner.rowGap) {
        LoofitActivityTimer(
          state: context.state,
          size: LoofitWidgetRendererContract.LiveActivity.Banner.timerFontSize
        )
        Spacer(minLength: 0)
        LoofitActivityEndButton(
          sessionId: context.attributes.sessionId,
          accent: context.state.accent,
          accentText: context.state.accentText,
          width: LoofitWidgetRendererContract.LiveActivity.Banner.buttonWidth,
          height: LoofitWidgetRendererContract.LiveActivity.Banner.buttonHeight,
          fontSize: LoofitWidgetRendererContract.LiveActivity.Banner.buttonFontSize
        )
      }
    }
    .padding(LoofitWidgetRendererContract.LiveActivity.Banner.contentPadding)
  }
}

private struct LoofitActivityTimer: View {
  let state: LoofitWorkoutActivityAttributes.ContentState
  let size: CGFloat

  var body: some View {
    Group {
      if let startedAt = LoofitWorkoutDate.parseISO8601(state.startedAt) {
        Text(startedAt, style: .timer)
      } else {
        Text("0:00")
      }
    }
    .environment(\.locale, LoofitFormat.koreanLocale)
    .font(.system(size: size, weight: LoofitWidgetRendererContract.FontWeight.bold, design: .rounded))
    .monospacedDigit()
    .foregroundStyle(LoofitColor(state.accent))
    .lineLimit(1)
  }
}

private struct LoofitActivityEndButton: View {
  let sessionId: Int64
  let accent: String
  let accentText: String
  let width: CGFloat
  let height: CGFloat
  let fontSize: CGFloat

  var body: some View {
    if #available(iOS 17.0, *) {
      Button(intent: LoofitEndWorkoutIntent(sessionId: sessionId)) {
        label
      }
      .buttonStyle(.plain)
    } else {
      Link(destination: URL(string: "loofit://")!) {
        label
      }
    }
  }

  private var label: some View {
    Text(LoofitWidgetRendererContract.Control.Copy.end)
      .font(.system(size: fontSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
      .foregroundStyle(LoofitColor(accentText))
      .lineLimit(1)
      .minimumScaleFactor(LoofitWidgetRendererContract.MinimumScale.defaultValue)
      .frame(width: width, height: height)
      .background(LoofitColor(accent))
      .clipShape(Capsule())
  }
}
