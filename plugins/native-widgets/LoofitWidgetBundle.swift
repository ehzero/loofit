import ActivityKit
import AppIntents
import Foundation
import SwiftUI
import WidgetKit
import LoofitWorkoutCore

@main
struct ExportWidgets0: WidgetBundle {
  var body: some Widget {
    WorkoutControlWidget()
    HeatmapWeekWidget()
    HeatmapMonthWidget()
    HeatmapYearWidget()
    ExportWidgets1().body
  }
}

struct ExportWidgets1: WidgetBundle {
  var body: some Widget {
    WorkoutLockScreenWidget()
    WorkoutLockScreenSummaryWidget()
    LoofitWorkoutLiveActivity()
  }
}

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
    title = next?.title.isEmpty == false ? next!.title : "루틴 설정 필요"
    detail = next?.detail ?? ""
    startedAt = nil
    durationSeconds = 0
    timeRange = ""
    canStart = next != nil
  }
}

enum LoofitFormat {
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
    formatter.locale = Locale(identifier: "ko_KR")
    formatter.dateFormat = "a h:mm"
    return formatter.string(from: date)
  }

  static func weekday(_ date: Date) -> String {
    let symbols = ["일", "월", "화", "수", "목", "금", "토"]
    let index = Calendar.current.component(.weekday, from: date) - 1
    return symbols.indices.contains(index) ? symbols[index] : ""
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
  let tx5: String
  let surface2: String
  let secondaryButtonText: String
  let heatmapBase: String
  let heatmapEmpty: String
  let heatmapGap: String

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
    tx5 = theme.heatmapBrandColor
    surface2 = theme.secondaryButtonBackground
    secondaryButtonText = theme.secondaryButtonText
    heatmapBase = theme.heatmapBaseColor
    heatmapEmpty = theme.heatmapEmptyColor
    heatmapGap = theme.heatmapGapColor
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

// MARK: - Heatmap projection and view

enum LoofitHeatmapVariant {
  case week
  case month
  case sixMonths
}

struct LoofitHeatmapDay: Identifiable {
  let date: Date
  let dateKey: String
  let workoutCount: Int
  let durationSeconds: Int
  let inRange: Bool

  var id: String { dateKey }
}

enum LoofitHeatmapProjection {
  static func days(
    snapshot: LoofitWorkoutSnapshot?,
    endingAt date: Date,
    count: Int
  ) -> [LoofitHeatmapDay] {
    let calendar = Calendar.current
    let end = calendar.startOfDay(for: date)
    let start = calendar.date(byAdding: .day, value: -(count - 1), to: end) ?? end
    return range(snapshot: snapshot, start: start, end: end, inRangeStart: start)
  }

  static func month(snapshot: LoofitWorkoutSnapshot?, endingAt date: Date) -> [LoofitHeatmapDay] {
    let calendar = Calendar.current
    let end = calendar.startOfDay(for: date)
    let rangeStart = calendar.date(byAdding: .day, value: -29, to: end) ?? end
    let weekday = calendar.component(.weekday, from: rangeStart)
    let gridStart = calendar.date(byAdding: .day, value: -(weekday - 1), to: rangeStart) ?? rangeStart
    return range(snapshot: snapshot, start: gridStart, end: end, inRangeStart: rangeStart)
  }

  static func sixMonths(snapshot: LoofitWorkoutSnapshot?, endingAt date: Date) -> [LoofitHeatmapDay] {
    let calendar = Calendar.current
    let end = calendar.startOfDay(for: date)
    let currentMonth = calendar.date(from: calendar.dateComponents([.year, .month], from: end)) ?? end
    let rangeStart = calendar.date(byAdding: .month, value: -5, to: currentMonth) ?? currentMonth
    let weekday = calendar.component(.weekday, from: rangeStart)
    let gridStart = calendar.date(byAdding: .day, value: -(weekday - 1), to: rangeStart) ?? rangeStart
    return range(snapshot: snapshot, start: gridStart, end: end, inRangeStart: rangeStart)
  }

  private static func range(
    snapshot: LoofitWorkoutSnapshot?,
    start: Date,
    end: Date,
    inRangeStart: Date
  ) -> [LoofitHeatmapDay] {
    let values = Dictionary(
      uniqueKeysWithValues: (snapshot?.dailyCompleted ?? []).map { ($0.dateKey, $0) }
    )
    let calendar = Calendar.current
    var result: [LoofitHeatmapDay] = []
    var cursor = start
    while cursor <= end {
      let key = dateKey(cursor)
      let aggregate = values[key]
      result.append(
        LoofitHeatmapDay(
          date: cursor,
          dateKey: key,
          workoutCount: aggregate?.workoutCount ?? 0,
          durationSeconds: aggregate?.durationSeconds ?? 0,
          inRange: cursor >= inRangeStart
        )
      )
      cursor = calendar.date(byAdding: .day, value: 1, to: cursor) ?? end.addingTimeInterval(1)
    }
    return result
  }

  static func dateKey(_ date: Date) -> String {
    let components = Calendar.current.dateComponents([.year, .month, .day], from: date)
    return String(
      format: "%04d-%02d-%02d",
      components.year ?? 0,
      components.month ?? 0,
      components.day ?? 0
    )
  }
}

struct LoofitHeatmapWidgetView: View {
  let entry: LoofitWidgetEntry
  let title: String
  let variant: LoofitHeatmapVariant

  private var days: [LoofitHeatmapDay] {
    switch variant {
    case .week:
      return LoofitHeatmapProjection.days(snapshot: entry.snapshot, endingAt: entry.date, count: 7)
    case .month:
      return LoofitHeatmapProjection.month(snapshot: entry.snapshot, endingAt: entry.date)
    case .sixMonths:
      return LoofitHeatmapProjection.sixMonths(snapshot: entry.snapshot, endingAt: entry.date)
    }
  }

  private var count: Int { days.reduce(0) { $0 + $1.workoutCount } }
  private var duration: Int { days.reduce(0) { $0 + $1.durationSeconds } }

  var body: some View {
    GeometryReader { geometry in
      VStack(alignment: .leading, spacing: variant == .week ? 8 : 8) {
        Text(headerTitle)
          .font(.system(size: variant == .sixMonths ? 10 : 11, weight: .semibold))
          .foregroundStyle(LoofitColor(entry.palette.tx3))
          .opacity(0.82)
          .lineLimit(1)
          .minimumScaleFactor(0.68)

        if variant == .sixMonths {
          sixMonthGrid(available: geometry.size)
        } else {
          calendarGrid(available: geometry.size)
        }

        if variant == .week {
          Spacer(minLength: 0)
          weekFooter
        } else {
          Spacer(minLength: 0)
        }
      }
      .padding(16)
      .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
    }
    .loofitWidgetBackground(LoofitColor(entry.palette.card))
    .widgetURL(URL(string: "loofit://"))
  }

  private var headerTitle: String {
    if variant == .sixMonths {
      let average = count > 0 ? duration / count : 0
      return "\(title) · \(count)회 · 총 \(LoofitFormat.duration(duration)) · 평균 \(LoofitFormat.duration(average))"
    }
    return "\(title) · \(count)회"
  }

  private func calendarGrid(available: CGSize) -> some View {
    let rows = days.chunked(into: 7)
    let gap: CGFloat = variant == .week ? 4 : 3
    let reservedFooter: CGFloat = variant == .week ? 63 : 0
    let width = max(0, available.width - 32 - gap * 6)
    let height = max(0, available.height - 32 - 22 - reservedFooter - gap * CGFloat(max(rows.count - 1, 0)))
    let cell = max(0, min(width / 7, height / CGFloat(max(rows.count, 1))))
    return VStack(alignment: .leading, spacing: gap) {
      HStack(spacing: gap) {
        ForEach(Array(days.prefix(7))) { day in
          Text(LoofitFormat.weekday(day.date))
            .font(.system(size: 8, weight: .heavy))
            .foregroundStyle(LoofitColor(entry.palette.tx4))
            .frame(width: cell)
        }
      }
      ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
        HStack(spacing: gap) {
          ForEach(row) { day in
            ZStack {
              RoundedRectangle(cornerRadius: variant == .week ? 4 : 3)
                .fill(color(for: day))
              if day.inRange {
                Text("\(Calendar.current.component(.day, from: day.date))")
                  .font(.system(size: variant == .week ? 8 : 7, weight: .heavy))
                  .foregroundStyle(day.durationSeconds >= 90 * 60 ? LoofitColor(entry.palette.accentText) : LoofitColor(entry.palette.tx3))
                  .minimumScaleFactor(0.6)
              }
            }
            .frame(width: cell, height: cell)
          }
          if row.count < 7 {
            ForEach(row.count..<7, id: \.self) { _ in
              Color.clear.frame(width: cell, height: cell)
            }
          }
        }
      }
    }
  }

  private func sixMonthGrid(available: CGSize) -> some View {
    let weeks = days.chunked(into: 7)
    let gap: CGFloat = 2
    let width = max(0, available.width - 32 - gap * CGFloat(max(weeks.count - 1, 0)))
    let height = max(0, available.height - 32 - 22 - gap * 6 - 12)
    let cell = max(0, min(width / CGFloat(max(weeks.count, 1)), height / 7))
    return HStack(alignment: .top, spacing: gap) {
      ForEach(Array(weeks.enumerated()), id: \.offset) { index, week in
        VStack(alignment: .leading, spacing: gap) {
          Text(monthLabel(for: index, weeks: weeks))
            .font(.system(size: 9, weight: .heavy))
            .foregroundStyle(LoofitColor(entry.palette.tx4))
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .frame(width: cell, height: 12, alignment: .leading)
          ForEach(week) { day in
            RoundedRectangle(cornerRadius: 2)
              .fill(color(for: day))
              .frame(width: cell, height: cell)
          }
          if week.count < 7 {
            ForEach(week.count..<7, id: \.self) { _ in
              Color.clear.frame(width: cell, height: cell)
            }
          }
        }
      }
    }
  }

  private func monthLabel(for index: Int, weeks: [[LoofitHeatmapDay]]) -> String {
    guard let first = weeks[index].first(where: { $0.inRange }) else { return "" }
    let month = Calendar.current.component(.month, from: first.date)
    if index == 0 { return "\(month)월" }
    let previousMonth = weeks[index - 1].compactMap { $0.inRange ? Calendar.current.component(.month, from: $0.date) : nil }.last
    return previousMonth == month ? "" : "\(month)월"
  }

  private var weekFooter: some View {
    VStack(alignment: .leading, spacing: 4) {
      HStack(spacing: 8) {
        stat(label: "총 시간", value: LoofitFormat.duration(duration))
        stat(label: "평균", value: LoofitFormat.duration(count > 0 ? duration / count : 0))
      }
      let recent = (entry.snapshot?.recentCompleted ?? []).filter {
        guard let started = $0.startedDate else { return false }
        return started >= Calendar.current.date(byAdding: .day, value: -6, to: Calendar.current.startOfDay(for: entry.date)) ?? .distantFuture
      }.prefix(2)
      if !recent.isEmpty {
        Text("최근 운동")
          .font(.system(size: 8, weight: .heavy))
          .foregroundStyle(LoofitColor(entry.palette.tx5))
        ForEach(Array(recent), id: \.id) { session in
          HStack(spacing: 4) {
            Text("\(session.title) · \(LoofitFormat.duration(session.durationSeconds))")
              .font(.system(size: 10, weight: .heavy))
              .foregroundStyle(LoofitColor(entry.palette.tx2))
              .lineLimit(1)
            Spacer(minLength: 0)
            if let date = session.startedDate {
              Text(LoofitFormat.relativeDay(date, now: entry.date))
                .font(.system(size: 9, weight: .heavy))
                .foregroundStyle(LoofitColor(entry.palette.tx5))
            }
          }
        }
      }
    }
  }

  private func stat(label: String, value: String) -> some View {
    VStack(alignment: .leading, spacing: 1) {
      Text(label)
        .font(.system(size: 8, weight: .heavy))
        .foregroundStyle(LoofitColor(entry.palette.tx5))
      Text(value)
        .font(.system(size: 12, weight: .heavy))
        .foregroundStyle(LoofitColor(entry.palette.tx2))
        .lineLimit(1)
    }
    .frame(maxWidth: .infinity, alignment: .leading)
  }

  private func color(for day: LoofitHeatmapDay) -> Color {
    guard day.inRange else { return LoofitColor(entry.palette.heatmapGap) }
    switch day.durationSeconds {
    case ...0:
      return LoofitColor(entry.palette.heatmapEmpty)
    case ..<(30 * 60):
      return LoofitMixColor(entry.palette.accent, entry.palette.heatmapBase, weight: 0.24)
    case ..<(60 * 60):
      return LoofitMixColor(entry.palette.accent, entry.palette.heatmapBase, weight: 0.48)
    case ..<(90 * 60):
      return LoofitMixColor(entry.palette.accent, entry.palette.heatmapBase, weight: 0.74)
    default:
      return LoofitColor(entry.palette.accent)
    }
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
        DynamicIslandExpandedRegion(.center) {
          LoofitWorkoutActivityExpanded(context: context)
        }
      } compactLeading: {
        Text(context.state.title.replacingOccurrences(of: " · ", with: "·"))
          .font(.system(size: 11, weight: .heavy))
          .foregroundStyle(LoofitColor(context.state.accent))
          .lineLimit(1)
          .frame(width: 48, alignment: .leading)
      } compactTrailing: {
        LoofitActivityTimer(state: context.state, size: 11)
          .frame(width: 42, alignment: .trailing)
      } minimal: {
        Text(String(context.state.title.prefix(4)))
          .font(.system(size: 10, weight: .heavy))
          .foregroundStyle(LoofitColor(context.state.accent))
          .lineLimit(1)
      }
      .widgetURL(URL(string: "loofit://"))
      .keylineTint(LoofitColor(context.state.accent))
    }
  }
}

private struct LoofitWorkoutActivityBanner: View {
  let context: ActivityViewContext<LoofitWorkoutActivityAttributes>

  var body: some View {
    VStack(alignment: .leading, spacing: 7) {
      HStack(spacing: 4) {
        Text(context.state.title)
          .font(.system(size: 17, weight: .heavy))
          .foregroundStyle(LoofitColor(context.state.titleColor))
          .lineLimit(1)
          .minimumScaleFactor(0.78)
        Spacer(minLength: 0)
        Text("운동 중")
          .font(.system(size: 11, weight: .heavy))
          .foregroundStyle(LoofitColor(context.state.accent))
      }
      HStack(spacing: 10) {
        LoofitActivityTimer(state: context.state, size: 32)
        Spacer(minLength: 0)
        LoofitActivityEndButton(
          sessionId: context.attributes.sessionId,
          accent: context.state.accent,
          accentText: context.state.accentText,
          width: 88,
          height: 32,
          fontSize: 13
        )
      }
    }
    .padding(14)
  }
}

private struct LoofitWorkoutActivityExpanded: View {
  let context: ActivityViewContext<LoofitWorkoutActivityAttributes>

  var body: some View {
    HStack(spacing: 7) {
      Text(context.state.title)
        .font(.system(size: 14, weight: .heavy))
        .foregroundStyle(.white)
        .lineLimit(1)
        .minimumScaleFactor(0.76)
        .frame(maxWidth: 124, alignment: .leading)
      Spacer(minLength: 0)
      LoofitActivityTimer(state: context.state, size: 14)
        .frame(width: 68, alignment: .trailing)
      LoofitActivityEndButton(
        sessionId: context.attributes.sessionId,
        accent: context.state.accent,
        accentText: context.state.accentText,
        width: 68,
        height: 26,
        fontSize: 11
      )
    }
    .padding(.horizontal, 12)
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
    .font(.system(size: size, weight: .heavy, design: .rounded))
    .monospacedDigit()
    .foregroundStyle(LoofitColor(state.accent))
    .lineLimit(1)
    .minimumScaleFactor(0.68)
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
    Text("운동 종료")
      .font(.system(size: fontSize, weight: .heavy))
      .foregroundStyle(LoofitColor(accentText))
      .lineLimit(1)
      .minimumScaleFactor(0.8)
      .frame(width: width, height: height)
      .background(LoofitColor(accent))
      .clipShape(Capsule())
  }
}
