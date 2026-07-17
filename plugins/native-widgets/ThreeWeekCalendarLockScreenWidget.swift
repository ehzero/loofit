import SwiftUI
import UIKit
import WidgetKit
import LoofitWorkoutCore

struct ThreeWeekCalendarLockScreenWidget: Widget {
  private let kind = LoofitWidgetKinds.lockScreenThreeWeekCalendar

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      ThreeWeekCalendarLockScreenWidgetView(entry: entry, range: .past)
    }
    .configurationDisplayName("루핏 잠금화면 히트맵 · 지난 3주")
    .description("지난 3주의 운동 기록을 히트맵으로 확인합니다.")
    .supportedFamilies([.accessoryRectangular])
  }
}

enum ThreeWeekCalendarRange {
  case past
  case next
}

struct ThreeWeekCalendarLockScreenWidgetView: View {
  @Environment(\.widgetRenderingMode) private var renderingMode

  let entry: LoofitWidgetEntry
  let range: ThreeWeekCalendarRange

  private var days: [LoofitHeatmapDay] {
    switch range {
    case .past:
      return LoofitHeatmapProjection.completeCalendarWeeks(
        snapshot: entry.snapshot,
        containing: entry.date,
        count: LoofitWidgetRendererContract.LockScreen.ThreeWeekCalendar.rangeWeeks
      )
    case .next:
      return LoofitHeatmapProjection.upcomingCompleteCalendarWeeks(
        snapshot: entry.snapshot,
        containing: entry.date,
        count: LoofitWidgetLayoutContract.LockScreen.nextThreeWeekCalendarRangeWeeks
      )
    }
  }

  var body: some View {
    GeometryReader { geometry in
      let spec = LoofitWidgetRendererContract.LockScreen.ThreeWeekCalendar.self
      let rows = days.chunked(into: spec.columns)
      let gap = spec.cellGap
      let width = max(
        0,
        geometry.size.width - spec.contentPadding * 2 - gap * CGFloat(spec.columns - 1)
      )
      let cellWidth = width / CGFloat(max(spec.columns, 1))
      let gridHeight = max(
        0,
        geometry.size.height - spec.contentPadding * 2 - spec.weekdayLabelLineHeight
          - gap * CGFloat(rows.count)
      )
      let cellHeight = gridHeight / CGFloat(max(rows.count, 1))

      VStack(spacing: gap) {
        HStack(spacing: gap) {
          ForEach(
            Array(LoofitWidgetRendererContract.Heatmap.weekdayLabels.enumerated()),
            id: \.offset
          ) { _, label in
            Text(label)
              .font(.system(
                size: spec.weekdayLabelSize,
                weight: LoofitWidgetRendererContract.FontWeight.bold
              ))
              .foregroundStyle(weekdayColor(label))
              .frame(width: cellWidth, height: spec.weekdayLabelLineHeight)
          }
        }

        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          HStack(spacing: gap) {
            ForEach(row) { day in
              dayCell(day, width: cellWidth, height: cellHeight)
            }
          }
        }
      }
      .padding(spec.contentPadding)
      .frame(width: geometry.size.width, height: geometry.size.height, alignment: .center)
    }
    .loofitWidgetBackground(.clear)
    .widgetURL(URL(string: "loofit://"))
  }

  private func dayCell(_ day: LoofitHeatmapDay, width: CGFloat, height: CGFloat) -> some View {
    let spec = LoofitWidgetRendererContract.LockScreen.ThreeWeekCalendar.self
    let level = heatLevel(for: day)
    return ZStack {
      RoundedRectangle(cornerRadius: spec.cellRadius)
        .fill(cellFillColor(level: level))
        .overlay {
          if Calendar.current.isDate(day.date, inSameDayAs: entry.date) {
            RoundedRectangle(cornerRadius: spec.cellRadius)
              .stroke(
                LoofitColor(spec.todayIndicatorColor),
                lineWidth: spec.todayIndicatorWidth
              )
          }
        }

      Text("\(Calendar.current.component(.day, from: day.date))")
        .font(.system(
          size: spec.cellLabelSize,
          weight: LoofitWidgetRendererContract.FontWeight.bold
        ))
        .foregroundStyle(cellLabelColor(level: level))
        .lineLimit(1)
        .minimumScaleFactor(LoofitWidgetRendererContract.MinimumScale.dense)
    }
    .frame(width: width, height: height)
  }

  private func heatLevel(for day: LoofitHeatmapDay) -> Int {
    switch day.durationSeconds {
    case ...0: return 0
    case ..<(30 * 60): return 1
    case ..<(60 * 60): return 2
    case ..<(90 * 60): return 3
    default: return 4
    }
  }

  private func cellFillColor(level: Int) -> Color {
    guard level > 0 else { return .clear }
    let spec = LoofitWidgetRendererContract.LockScreen.ThreeWeekCalendar.self
    let opacity = spec.bucketOpacities[min(level - 1, spec.bucketOpacities.count - 1)]
    return primaryColor.opacity(opacity)
  }

  private func cellLabelColor(level: Int) -> Color {
    return level >= 3 ? inverseColor : primaryColor
  }

  private func weekdayColor(_ label: String) -> Color {
    LoofitWidgetRendererContract.LockScreen.ThreeWeekCalendar.dimmedWeekdayLabels.contains(label)
      ? secondaryColor
      : primaryColor
  }

  private var primaryColor: Color {
    renderingMode == .vibrant ? .white : .primary
  }

  private var secondaryColor: Color {
    renderingMode == .vibrant
      ? .white.opacity(
        LoofitWidgetRendererContract.LockScreen.ThreeWeekCalendar.dimmedWeekdayOpacity
      )
      : .secondary
  }

  private var inverseColor: Color {
    renderingMode == .vibrant ? .black : Color(uiColor: .systemBackground)
  }
}
