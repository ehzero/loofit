import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct CurrentMonthCalendarWidget: Widget {
  private let kind = LoofitWidgetKinds.currentMonthCalendar

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      CurrentMonthCalendarWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 이번 달 캘린더")
    .description("이번 달 운동 기록을 달력으로 확인합니다.")
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabled()
  }
}

private struct CurrentMonthCalendarWidgetView: View {
  let entry: LoofitWidgetEntry

  private var days: [LoofitHeatmapDay] {
    LoofitHeatmapProjection.currentMonth(snapshot: entry.snapshot, containing: entry.date)
  }

  private var rows: [[LoofitHeatmapDay]] { days.chunked(into: 7) }

  private var title: String {
    let month = Calendar.current.component(.month, from: entry.date)
    let count = days.filter(\.inRange).reduce(0) { $0 + $1.workoutCount }
    return "\(month)월 · \(count)회"
  }

  var body: some View {
    GeometryReader { geometry in
      let spec = LoofitWidgetRendererContract.CurrentMonth.self
      let gap = spec.cellGap
      let width = max(0, geometry.size.width - spec.contentPadding * 2 - gap * 6)
      let headerHeight = spec.headerFontSize + 4
      let gridHeight = max(
        0,
        geometry.size.height - spec.contentPadding * 2 - headerHeight - spec.headerGap
          - gap * CGFloat(rows.count)
      )
      let cell = max(0, min(width / 7, gridHeight / CGFloat(max(rows.count + 1, 1))))

      VStack(alignment: .leading, spacing: spec.headerGap) {
        Text(title)
          .font(.system(size: spec.headerFontSize, weight: LoofitWidgetRendererContract.FontWeight.medium))
          .foregroundStyle(LoofitColor(entry.palette.tx3))
          .lineLimit(1)
          .frame(height: headerHeight)

        VStack(alignment: .leading, spacing: gap) {
          HStack(spacing: gap) {
            ForEach(Array(LoofitWidgetRendererContract.Heatmap.weekdayLabels.enumerated()), id: \.offset) { _, label in
              Text(label)
                .font(.system(size: LoofitWidgetRendererContract.Heatmap.weekdayLabelSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
                .foregroundStyle(weekdayColor(label))
                .frame(width: cell, height: cell)
            }
          }
          ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
            HStack(spacing: gap) {
              ForEach(row) { day in
                dayCell(day, size: cell)
              }
            }
          }
        }
      }
      .padding(spec.contentPadding)
      .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
    }
    .loofitWidgetBackground(LoofitColor(entry.palette.card))
    .widgetURL(URL(string: "loofit://"))
  }

  private func dayCell(_ day: LoofitHeatmapDay, size: CGFloat) -> some View {
    ZStack {
      if day.inRange {
        RoundedRectangle(cornerRadius: LoofitWidgetRendererContract.CurrentMonth.cellRadius)
          .fill(LoofitHeatmapFillColor(for: day, palette: entry.palette))
          .overlay {
            if Calendar.current.isDate(day.date, inSameDayAs: entry.date) {
              RoundedRectangle(cornerRadius: LoofitWidgetRendererContract.CurrentMonth.cellRadius)
                .stroke(
                  LoofitColor(entry.palette.todayIndicator),
                  lineWidth: LoofitWidgetRendererContract.CurrentMonth.todayIndicatorWidth
                )
            }
          }
        Text("\(Calendar.current.component(.day, from: day.date))")
          .font(.system(size: LoofitWidgetRendererContract.CurrentMonth.cellLabelSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
          .foregroundStyle(LoofitHeatmapTextColor(for: day, palette: entry.palette))
      }
    }
    .frame(width: size, height: size)
  }

  private func weekdayColor(_ label: String) -> Color {
    LoofitWidgetRendererContract.Heatmap.weekendWeekdayLabels.contains(label)
      ? LoofitColor(entry.palette.textWeekend)
      : LoofitColor(entry.palette.tx4)
  }
}
