import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct HeatmapFourWeekExpandedWidget: Widget {
  private let kind = LoofitWidgetKinds.heatmapFourWeekExpanded

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      HeatmapFourWeekExpandedWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 지난 4주 상세")
    .description("지난 4주의 운동 날짜와 부위를 함께 확인합니다.")
    .supportedFamilies([.systemMedium])
    .contentMarginsDisabled()
  }
}

private struct HeatmapFourWeekExpandedWidgetView: View {
  let entry: LoofitWidgetEntry

  private var days: [LoofitHeatmapDay] {
    LoofitHeatmapProjection.calendarWeeks(
      snapshot: entry.snapshot,
      endingAt: entry.date,
      count: LoofitWidgetRendererContract.FourWeekExpanded.rangeWeeks
    )
  }

  private var details: [String: [String]] {
    Dictionary(uniqueKeysWithValues: (entry.snapshot?.dailyDetails ?? []).map {
      ($0.dateKey, $0.bodyPartNames)
    })
  }

  var body: some View {
    GeometryReader { geometry in
      let spec = LoofitWidgetRendererContract.FourWeekExpanded.self
      let contentPadding = LoofitHomeWidgetContentPadding(for: geometry.size)
      let rows = days.chunked(into: spec.columns)
      let gap = spec.cellGap
      let width = max(0, geometry.size.width - contentPadding * 2 - gap * CGFloat(spec.columns - 1))
      let cellWidth = width / CGFloat(max(spec.columns, 1))
      let height = max(
        0,
        geometry.size.height - contentPadding * 2 - cellWidth - gap * CGFloat(rows.count)
      )
      let cellHeight = height / CGFloat(max(rows.count, 1))

      VStack(alignment: .leading, spacing: gap) {
        HStack(spacing: gap) {
          ForEach(Array(LoofitWidgetRendererContract.Heatmap.weekdayLabels.enumerated()), id: \.offset) { _, label in
            Text(label)
              .font(.system(size: LoofitWidgetRendererContract.Heatmap.weekdayLabelSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
              .foregroundStyle(weekdayColor(label))
              .frame(width: cellWidth, height: cellWidth)
          }
        }
        ForEach(Array(rows.enumerated()), id: \.offset) { _, row in
          HStack(spacing: gap) {
            ForEach(row) { day in
              dayCell(day, width: cellWidth, height: cellHeight)
            }
            if row.count < spec.columns {
              ForEach(row.count..<spec.columns, id: \.self) { _ in
                Color.clear.frame(width: cellWidth, height: cellHeight)
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
    VStack(spacing: LoofitWidgetRendererContract.FourWeekExpanded.cellContentGap) {
      Text("\(Calendar.current.component(.day, from: day.date))")
        .font(.system(size: LoofitWidgetRendererContract.FourWeekExpanded.cellLabelSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
        .foregroundStyle(LoofitHeatmapTextColor(for: day, palette: entry.palette))
        .lineLimit(1)
      if let names = details[day.dateKey], !names.isEmpty {
        Text(names.joined(separator: LoofitWidgetRendererContract.FourWeekExpanded.bodyPartSeparator))
          .font(.system(size: LoofitWidgetRendererContract.FourWeekExpanded.bodyPartLabelSize, weight: LoofitWidgetRendererContract.FontWeight.medium))
          .foregroundStyle(LoofitHeatmapTextColor(for: day, palette: entry.palette))
          .opacity(LoofitWidgetRendererContract.FourWeekExpanded.bodyPartLabelOpacity)
          .lineLimit(1)
          .minimumScaleFactor(LoofitWidgetRendererContract.MinimumScale.dense)
      }
    }
    .frame(width: width, height: height)
    .background(LoofitHeatmapFillColor(for: day, palette: entry.palette))
    .clipShape(RoundedRectangle(cornerRadius: LoofitWidgetRendererContract.FourWeekExpanded.cellRadius))
  }

  private func weekdayColor(_ label: String) -> Color {
    LoofitWidgetRendererContract.Heatmap.weekendWeekdayLabels.contains(label)
      ? LoofitColor(entry.palette.textWeekend)
      : LoofitColor(entry.palette.tx4)
  }
}
