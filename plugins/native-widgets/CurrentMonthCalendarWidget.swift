import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct CurrentMonthCalendarWidget: Widget {
  private let kind = LoofitWidgetKinds.currentMonthCalendar

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      CurrentMonthCalendarWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 히트맵 · 이번 달")
    .description("이번 달 운동 기록을 히트맵으로 확인합니다.")
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabled()
  }
}

struct CurrentMonthCalendarWidgetView: View {
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
      let contentPadding = LoofitHomeWidgetContentPadding(for: geometry.size)
      let dense = rows.count >= spec.denseRowThreshold
      let horizontalGap = spec.cellGap
      let verticalGap = dense ? spec.denseVerticalGap : spec.cellGap
      let headerGap = dense ? spec.denseHeaderGap : spec.headerGap
      let width = max(0, geometry.size.width - contentPadding * 2 - horizontalGap * 6)
      let headerHeight = spec.headerLineHeight
      let calendarHeight = max(
        0,
        geometry.size.height - contentPadding * 2 - headerHeight - headerGap
      )
      let widthCell = max(0, width / 7)
      let denseWeekdayHeight = spec.denseWeekdayHeaderHeight
      let heightCell = dense
        ? max(
            0,
            min(
              widthCell,
              (calendarHeight - denseWeekdayHeight - verticalGap * CGFloat(rows.count))
                / CGFloat(max(rows.count, 1))
            )
          )
        : max(
            0,
            min(
              widthCell,
              (calendarHeight - verticalGap * CGFloat(rows.count))
                / CGFloat(max(rows.count + 1, 1))
            )
          )
      let cellWidth = dense ? widthCell : heightCell
      let weekdayHeight = dense ? denseWeekdayHeight : heightCell

      VStack(alignment: .leading, spacing: headerGap) {
        Text(title)
          .font(.system(size: spec.headerFontSize, weight: LoofitWidgetRendererContract.FontWeight.medium))
          .foregroundStyle(LoofitColor(entry.palette.heatmapTitle))
          .opacity(spec.headerOpacity)
          .lineLimit(1)
          .minimumScaleFactor(spec.headerMinimumScaleFactor)
          .frame(height: headerHeight)

        VStack(alignment: .leading, spacing: verticalGap) {
          HStack(spacing: horizontalGap) {
            ForEach(Array(LoofitWidgetRendererContract.Heatmap.weekdayLabels.enumerated()), id: \.offset) { _, label in
              Text(label)
                .font(.system(size: LoofitWidgetRendererContract.Heatmap.weekdayLabelSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
                .foregroundStyle(weekdayColor(label))
                .frame(width: cellWidth, height: weekdayHeight)
            }
          }
          ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
            HStack(spacing: horizontalGap) {
              ForEach(row) { day in
                dayCell(day, width: cellWidth, height: heightCell)
              }
            }
          }
        }
      }
      .padding(contentPadding)
      .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
    }
    .loofitWidgetBackground(LoofitColor(entry.palette.card))
    .widgetURL(URL(string: "loofit://"))
  }

  private func dayCell(_ day: LoofitHeatmapDay, width: CGFloat, height: CGFloat) -> some View {
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
          .lineLimit(1)
          .minimumScaleFactor(LoofitWidgetRendererContract.CurrentMonth.cellLabelMinimumScaleFactor)
      } else if LoofitWidgetRendererContract.CurrentMonth.outsideMonthDateLabelOnly {
        Text("\(Calendar.current.component(.day, from: day.date))")
          .font(.system(size: LoofitWidgetRendererContract.CurrentMonth.cellLabelSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
          .foregroundStyle(LoofitColor(entry.palette.tx4))
          .lineLimit(1)
          .minimumScaleFactor(LoofitWidgetRendererContract.CurrentMonth.cellLabelMinimumScaleFactor)
      }
    }
    .frame(width: width, height: height)
  }

  private func weekdayColor(_ label: String) -> Color {
    LoofitWidgetRendererContract.Heatmap.weekendWeekdayLabels.contains(label)
      ? LoofitColor(entry.palette.textWeekend)
      : LoofitColor(entry.palette.tx4)
  }
}
