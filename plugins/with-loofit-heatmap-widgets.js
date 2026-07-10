const fs = require('fs');
const path = require('path');

const { withDangerousMod } = require('@expo/config-plugins');

const brand = require('../src/config/brand.json');
const swiftDefaultBrandName = JSON.stringify(brand.displayName);

function write(targetPath, contents) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents);
}

const sharedIndex = String.raw`import WidgetKit
import SwiftUI
import Foundation
internal import ExpoWidgets

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
    WorkoutLiveActivity()
    WidgetLiveActivity()
  }
}

enum LoofitHeatmapVariant {
  case week
  case month
  case year
}

struct LoofitHeatmapWidgetView: View {
  let entry: WidgetsTimelineProvider.Entry
  let title: String
  let variant: LoofitHeatmapVariant

  var body: some View {
    GeometryReader { geometry in
      let props = LoofitHeatmapProps(entry.props)
      if #available(iOS 17.0, *) {
        layout(size: geometry.size, props: props)
          .containerBackground(LoofitHeatmapColor(props.background), for: .widget)
      } else {
        layout(size: geometry.size, props: props)
          .background(LoofitHeatmapColor(props.background))
      }
    }
  }

  private func layout(size: CGSize, props: LoofitHeatmapProps) -> some View {
    let rows = heatmapRows(props: props)
    let columnCount = max(rows.map(\.count).max() ?? 1, 1)
    let rowCount = max(rows.count, 1)
    let showsCalendarLabels = variant != .year
    let showsMonthLabels = variant == .year
    let showsFooter = variant == .week && props.hasFooter
    let monthBoundaryCount = showsMonthLabels ? monthBoundaryCount(props: props) : 0
    let contentWidth = max(0, size.width - props.contentPadding * 2)
    let displayTitle = props.title.isEmpty ? title : props.title
    let displayTitleSize = max(props.titleSize - 1, CGFloat(9))
    let widthUnits = max(
      CGFloat(columnCount) + CGFloat(monthBoundaryCount) * props.monthGapColumns,
      1
    )
    let horizontalGaps = props.cellGap * CGFloat(max(columnCount - 1, 0))
    let widthCellSize = max(0, (contentWidth - horizontalGaps) / widthUnits)
    let titleHeight = max(displayTitleSize, props.brandSize) + 3
    let weekdayHeight = showsCalendarLabels ? props.weekdayLabelSize + 2 : 0
    let monthLabelHeight = showsMonthLabels ? props.monthLabelSize + 3 : 0
    let footerHeight = showsFooter ? props.footerHeight : 0
    let verticalGaps = props.headerGap
      + (showsCalendarLabels ? props.cellGap : 0)
      + (showsMonthLabels ? props.cellGap : 0)
      + (showsFooter ? props.headerGap : 0)
      + props.cellGap * CGFloat(max(rowCount - 1, 0))
    let availableGridHeight = max(
      0,
      size.height - props.contentPadding * 2 - titleHeight - weekdayHeight - monthLabelHeight - footerHeight - verticalGaps
    )
    let heightCellSize = max(0, availableGridHeight / CGFloat(rowCount))
    let cellSize = max(0, min(widthCellSize, heightCellSize))

    return VStack(alignment: .leading, spacing: props.headerGap) {
      HStack(spacing: 4) {
        Text(displayTitle)
          .font(.system(size: displayTitleSize, weight: .semibold))
          .foregroundStyle(LoofitHeatmapColor(props.titleColor))
          .opacity(0.72)
          .lineLimit(1)
          .minimumScaleFactor(0.75)
        Spacer(minLength: 0)
        Text(props.brandName)
          .font(.system(size: props.brandSize, weight: .bold))
          .foregroundStyle(LoofitHeatmapColor(props.brandColor))
      }

      if showsMonthLabels {
        yearGrid(rows: rows, props: props, cellSize: cellSize, monthLabelHeight: monthLabelHeight)
      } else {
        VStack(alignment: .leading, spacing: props.cellGap) {
          if showsCalendarLabels {
            HStack(spacing: props.cellGap) {
              ForEach(props.weekdayLabels.indices, id: \.self) { index in
                Text(props.weekdayLabels[index])
                  .font(.system(size: props.weekdayLabelSize, weight: .heavy))
                  .foregroundStyle(LoofitHeatmapColor(props.weekdayLabelColor))
                  .lineLimit(1)
                  .minimumScaleFactor(0.7)
                  .frame(width: cellSize, height: weekdayHeight, alignment: .center)
              }
            }
          }

          ForEach(rows.indices, id: \.self) { rowIndex in
            HStack(spacing: props.cellGap) {
              ForEach(rows[rowIndex].indices, id: \.self) { cellIndex in
                let cell = rows[rowIndex][cellIndex]
                ZStack {
                  RoundedRectangle(cornerRadius: props.cellRadius)
                    .fill(LoofitHeatmapColor(cell.color))
                  if showsCalendarLabels && !cell.label.isEmpty {
                    Text(cell.label)
                      .font(.system(size: props.cellLabelSize, weight: .heavy))
                      .foregroundStyle(LoofitHeatmapColor(cell.labelColor))
                      .lineLimit(1)
                      .minimumScaleFactor(0.65)
                  }
                }
                .frame(width: cellSize, height: cellSize)
              }
            }
          }
        }
      }

      if showsFooter {
        Spacer(minLength: 0)
        weekFooter(props: props)
      } else {
        Spacer(minLength: 0)
      }
    }
    .padding(props.contentPadding)
    .frame(width: size.width, height: size.height, alignment: .topLeading)
  }

  private func weekFooter(props: LoofitHeatmapProps) -> some View {
    VStack(alignment: .leading, spacing: 4) {
      let statCount = min(props.footerStatLabels.count, props.footerStatValues.count)
      if statCount > 0 {
        HStack(alignment: .bottom, spacing: 8) {
          ForEach(0..<statCount, id: \.self) { index in
            VStack(alignment: .leading, spacing: 1) {
              Text(props.footerStatLabels[index])
                .font(.system(size: 8, weight: .heavy))
                .foregroundStyle(LoofitHeatmapColor(props.brandColor))
                .lineLimit(1)
              Text(props.footerStatValues[index])
                .font(.system(size: 12, weight: .heavy))
                .foregroundStyle(LoofitHeatmapColor(props.footerValueColor))
                .lineLimit(1)
                .minimumScaleFactor(0.8)
            }
            .frame(maxWidth: .infinity, alignment: .leading)
          }
        }
      }

      let recordCount = min(props.recentWorkoutTitles.count, props.recentWorkoutMetas.count)
      let showsRecent = !props.recentWorkoutLabel.isEmpty || recordCount > 0
      if showsRecent {
        VStack(alignment: .leading, spacing: 2) {
          Text(props.recentWorkoutLabel.isEmpty ? "최근 운동" : props.recentWorkoutLabel)
            .font(.system(size: 8, weight: .heavy))
            .foregroundStyle(LoofitHeatmapColor(props.brandColor))
            .lineLimit(1)

          if recordCount > 0 {
            ForEach(0..<recordCount, id: \.self) { index in
              HStack(spacing: 6) {
                Text(props.recentWorkoutTitles[index])
                  .font(.system(size: 10, weight: .heavy))
                  .foregroundStyle(LoofitHeatmapColor(props.footerValueColor))
                  .lineLimit(1)
                  .minimumScaleFactor(0.75)
                Spacer(minLength: 0)
                Text(props.recentWorkoutMetas[index])
                  .font(.system(size: 9, weight: .heavy))
                  .foregroundStyle(LoofitHeatmapColor(props.brandColor))
                  .lineLimit(1)
              }
            }
          } else {
            Text("아직 기록 없음")
              .font(.system(size: 10, weight: .heavy))
              .foregroundStyle(LoofitHeatmapColor(props.footerValueColor))
              .lineLimit(1)
              .minimumScaleFactor(0.75)
          }
        }
      }
    }
  }

  private func yearGrid(
    rows: [[LoofitHeatmapCell]],
    props: LoofitHeatmapProps,
    cellSize: CGFloat,
    monthLabelHeight: CGFloat
  ) -> some View {
    let weekCount = rows.map(\.count).max() ?? 0

    return HStack(alignment: .top, spacing: 0) {
      ForEach(0..<weekCount, id: \.self) { week in
        let monthLabel = monthLabel(for: week, props: props)
        let leadingGap = monthLeadingGap(for: week, props: props, cellSize: cellSize)

        VStack(alignment: .leading, spacing: props.cellGap) {
          Text(monthLabel)
            .font(.system(size: props.monthLabelSize, weight: .heavy))
            .foregroundStyle(LoofitHeatmapColor(props.weekdayLabelColor))
            .lineLimit(1)
            .fixedSize(horizontal: true, vertical: false)
            .frame(width: cellSize, height: monthLabelHeight, alignment: .leading)

          VStack(alignment: .leading, spacing: props.cellGap) {
            ForEach(rows.indices, id: \.self) { weekday in
              let cell = cellAt(rows: rows, weekday: weekday, week: week, props: props)
              RoundedRectangle(cornerRadius: props.cellRadius)
                .fill(LoofitHeatmapColor(cell.color))
                .frame(width: cellSize, height: cellSize)
            }
          }
        }
        .padding(.leading, leadingGap)
      }
    }
  }

  private func monthLabel(for week: Int, props: LoofitHeatmapProps) -> String {
    week < props.monthLabels.count ? props.monthLabels[week] : ""
  }

  private func monthBoundaryCount(props: LoofitHeatmapProps) -> Int {
    props.monthGapBeforeWeeks.enumerated().filter { pair in
      pair.offset > 0 && pair.element == "1"
    }.count
  }

  private func monthLeadingGap(
    for week: Int,
    props: LoofitHeatmapProps,
    cellSize: CGFloat
  ) -> CGFloat {
    guard week > 0 else {
      return 0
    }
    return props.cellGap + (hasMonthGap(before: week, props: props) ? cellSize * props.monthGapColumns : 0)
  }

  private func hasMonthGap(before week: Int, props: LoofitHeatmapProps) -> Bool {
    week < props.monthGapBeforeWeeks.count && props.monthGapBeforeWeeks[week] == "1"
  }

  private func cellAt(
    rows: [[LoofitHeatmapCell]],
    weekday: Int,
    week: Int,
    props: LoofitHeatmapProps
  ) -> LoofitHeatmapCell {
    guard rows.indices.contains(weekday), rows[weekday].indices.contains(week) else {
      return LoofitHeatmapCell.empty(labelColor: props.weekdayLabelColor)
    }
    return rows[weekday][week]
  }

  private func heatmapRows(props: LoofitHeatmapProps) -> [[LoofitHeatmapCell]] {
    let cells = props.colors.enumerated().map { index, color in
      LoofitHeatmapCell(
        color: color,
        label: index < props.labels.count ? props.labels[index] : "",
        labelColor: index < props.labelColors.count ? props.labelColors[index] : props.weekdayLabelColor
      )
    }

    switch variant {
    case .week:
      var row = Array(cells.suffix(7))
      while row.count < 7 {
        row.append(LoofitHeatmapCell.empty(labelColor: props.weekdayLabelColor))
      }
      return [row]

    case .month:
      let columns = max(props.columns, 1)
      var rows: [[LoofitHeatmapCell]] = []
      var index = 0
      while index < cells.count {
        var row = Array(cells[index..<min(index + columns, cells.count)])
        while row.count < columns {
          row.append(LoofitHeatmapCell.empty(labelColor: props.weekdayLabelColor))
        }
        rows.append(row)
        index += columns
      }
      if rows.isEmpty {
        rows.append(
          Array(repeating: LoofitHeatmapCell.empty(labelColor: props.weekdayLabelColor), count: columns)
        )
      }
      return rows

    case .year:
      let weekCount = max(Int(ceil(Double(cells.count) / 7.0)), 1)
      return (0..<7).map { weekday in
        (0..<weekCount).map { week in
          let index = week * 7 + weekday
          return index < cells.count ? cells[index] : LoofitHeatmapCell.empty(labelColor: props.weekdayLabelColor)
        }
      }
    }
  }
}

struct LoofitHeatmapCell {
  let color: String
  let label: String
  let labelColor: String

  static func empty(labelColor: String) -> LoofitHeatmapCell {
    LoofitHeatmapCell(color: "#00000000", label: "", labelColor: labelColor)
  }
}

struct LoofitHeatmapProps {
  let title: String
  let colors: [String]
  let labels: [String]
  let labelColors: [String]
  let weekdayLabels: [String]
  let monthLabels: [String]
  let monthGapBeforeWeeks: [String]
  let brandName: String
  let footerStatLabels: [String]
  let footerStatValues: [String]
  let recentWorkoutLabel: String
  let recentWorkoutTitles: [String]
  let recentWorkoutMetas: [String]
  let background: String
  let titleColor: String
  let brandColor: String
  let footerValueColor: String
  let weekdayLabelColor: String
  let titleSize: CGFloat
  let brandSize: CGFloat
  let weekdayLabelSize: CGFloat
  let monthLabelSize: CGFloat
  let cellLabelSize: CGFloat
  let contentPadding: CGFloat
  let cellGap: CGFloat
  let cellRadius: CGFloat
  let headerGap: CGFloat
  let columns: Int
  let monthGapColumns: CGFloat

  init(_ raw: [String: Any]?) {
    let raw = raw ?? [:]
    let colorString = raw["colors"] as? String ?? ""

    title = raw["title"] as? String ?? ""
    colors = LoofitHeatmapProps.list(colorString).filter { !$0.isEmpty }
    labels = LoofitHeatmapProps.list(raw["labels"] as? String ?? "")
    labelColors = LoofitHeatmapProps.list(raw["labelColors"] as? String ?? "")
    weekdayLabels = LoofitHeatmapProps.list(raw["weekdayLabels"] as? String ?? "일,월,화,수,목,금,토")
      .filter { !$0.isEmpty }
    monthLabels = LoofitHeatmapProps.list(raw["monthLabels"] as? String ?? "")
    monthGapBeforeWeeks = LoofitHeatmapProps.list(raw["monthGapBeforeWeeks"] as? String ?? "")
    brandName = raw["brandName"] as? String ?? ${swiftDefaultBrandName}
    footerStatLabels = LoofitHeatmapProps.list(raw["footerStatLabels"] as? String ?? "").filter { !$0.isEmpty }
    footerStatValues = LoofitHeatmapProps.list(raw["footerStatValues"] as? String ?? "").filter { !$0.isEmpty }
    recentWorkoutLabel = raw["recentWorkoutLabel"] as? String ?? ""
    recentWorkoutTitles = LoofitHeatmapProps.list(raw["recentWorkoutTitles"] as? String ?? "").filter { !$0.isEmpty }
    recentWorkoutMetas = LoofitHeatmapProps.list(raw["recentWorkoutMetas"] as? String ?? "").filter { !$0.isEmpty }
    background = raw["background"] as? String ?? "#141418"
    titleColor = raw["titleColor"] as? String ?? "#8A8A90"
    brandColor = raw["brandColor"] as? String ?? "#6B6B70"
    footerValueColor = raw["footerValueColor"] as? String ?? "#9A9AA0"
    weekdayLabelColor = raw["weekdayLabelColor"] as? String ?? "#6B6B70"
    titleSize = LoofitHeatmapProps.cgFloat(raw["titleSize"], fallback: 11)
    brandSize = LoofitHeatmapProps.cgFloat(raw["brandSize"], fallback: 10)
    weekdayLabelSize = LoofitHeatmapProps.cgFloat(raw["weekdayLabelSize"], fallback: 8)
    monthLabelSize = LoofitHeatmapProps.cgFloat(raw["monthLabelSize"], fallback: 9)
    cellLabelSize = LoofitHeatmapProps.cgFloat(raw["cellLabelSize"], fallback: 7)
    contentPadding = LoofitHeatmapProps.cgFloat(raw["contentPadding"], fallback: 16)
    cellGap = LoofitHeatmapProps.cgFloat(raw["cellGap"], fallback: 3)
    cellRadius = LoofitHeatmapProps.cgFloat(raw["cellRadius"], fallback: 3)
    headerGap = LoofitHeatmapProps.cgFloat(raw["headerGap"], fallback: 12)
    columns = LoofitHeatmapProps.int(raw["columns"], fallback: 7)
    monthGapColumns = LoofitHeatmapProps.cgFloat(raw["monthGapColumns"], fallback: 0)
  }

  var hasFooter: Bool {
    !footerStatValues.isEmpty || !recentWorkoutLabel.isEmpty || !recentWorkoutTitles.isEmpty
  }

  var footerHeight: CGFloat {
    var height: CGFloat = 0
    if !footerStatValues.isEmpty {
      height += 25
    }
    let showsRecent = !recentWorkoutLabel.isEmpty || !recentWorkoutTitles.isEmpty
    if showsRecent {
      if height > 0 {
        height += 4
      }
      let rowCount = max(recentWorkoutTitles.count, 1)
      height += 10 + CGFloat(rowCount) * 13 + CGFloat(max(rowCount - 1, 0)) * 2
    }
    return height
  }

  private static func cgFloat(_ value: Any?, fallback: CGFloat) -> CGFloat {
    if let value = value as? CGFloat {
      return value
    }
    if let value = value as? Double {
      return CGFloat(value)
    }
    if let value = value as? Int {
      return CGFloat(value)
    }
    if let value = value as? NSNumber {
      return CGFloat(truncating: value)
    }
    if let value = value as? String, let number = Double(value) {
      return CGFloat(number)
    }
    return fallback
  }

  private static func int(_ value: Any?, fallback: Int) -> Int {
    if let value = value as? Int {
      return value
    }
    if let value = value as? NSNumber {
      return value.intValue
    }
    if let value = value as? String, let number = Int(value) {
      return number
    }
    return fallback
  }

  private static func list(_ value: String) -> [String] {
    value.split(separator: ",", omittingEmptySubsequences: false).map(String.init)
  }
}

private func LoofitHeatmapColor(_ value: String) -> Color {
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)

  if trimmed.hasPrefix("#") {
    let hex = String(trimmed.dropFirst())
    guard let integer = UInt64(hex, radix: 16) else {
      return Color.clear
    }

    switch hex.count {
    case 6:
      let red = Double((integer >> 16) & 0xFF) / 255.0
      let green = Double((integer >> 8) & 0xFF) / 255.0
      let blue = Double(integer & 0xFF) / 255.0
      return Color(red: red, green: green, blue: blue)
    case 8:
      let red = Double((integer >> 24) & 0xFF) / 255.0
      let green = Double((integer >> 16) & 0xFF) / 255.0
      let blue = Double((integer >> 8) & 0xFF) / 255.0
      let alpha = Double(integer & 0xFF) / 255.0
      return Color(red: red, green: green, blue: blue, opacity: alpha)
    default:
      return Color.clear
    }
  }

  return Color.clear
}
`;

function heatmapWidget({ name, title, variant, displayName, description, family }) {
  return String.raw`import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct ${name}: Widget {
  let name: String = "${name}"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      LoofitHeatmapWidgetView(entry: entry, title: "${title}", variant: .${variant})
    }
    .configurationDisplayName("${displayName}")
    .description("${description}")
    .supportedFamilies([.${family}])
    .contentMarginsDisabled()
  }
}
`;
}

module.exports = function withLoofitHeatmapWidgets(config) {
  return withDangerousMod(config, [
    'ios',
    async (config) => {
      const targetDir = path.join(config.modRequest.platformProjectRoot, 'ExpoWidgetsTarget');

      write(path.join(targetDir, 'index.swift'), sharedIndex);
      write(
        path.join(targetDir, 'HeatmapWeekWidget.swift'),
        heatmapWidget({
          name: 'HeatmapWeekWidget',
          title: '지난 7일',
          variant: 'week',
          displayName: `${brand.displayName} 히트맵 · 7일`,
          description: 'Review your last 7 days of workouts.',
          family: 'systemSmall',
        })
      );
      write(
        path.join(targetDir, 'HeatmapMonthWidget.swift'),
        heatmapWidget({
          name: 'HeatmapMonthWidget',
          title: '지난 30일',
          variant: 'month',
          displayName: `${brand.displayName} 히트맵 · 30일`,
          description: 'Review your last 30 days of workouts.',
          family: 'systemSmall',
        })
      );
      write(
        path.join(targetDir, 'HeatmapYearWidget.swift'),
        heatmapWidget({
          name: 'HeatmapYearWidget',
          title: '지난 6개월',
          variant: 'year',
          displayName: `${brand.displayName} 히트맵 · 6개월`,
          description: 'Review your recent 6 months of workouts.',
          family: 'systemMedium',
        })
      );

      return config;
    },
  ]);
};
