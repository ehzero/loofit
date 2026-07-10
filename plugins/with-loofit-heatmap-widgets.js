const fs = require('fs');
const path = require('path');

const { withDangerousMod } = require('@expo/config-plugins');

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
    let contentWidth = max(0, size.width - props.contentPadding * 2)
    let totalGap = props.cellGap * CGFloat(max(columnCount - 1, 0))
    let cellSize = max(0, (contentWidth - totalGap) / CGFloat(columnCount))

    return VStack(alignment: .leading, spacing: props.headerGap) {
      HStack(spacing: 4) {
        Text(title)
          .font(.system(size: props.titleSize, weight: .heavy))
          .foregroundStyle(LoofitHeatmapColor(props.titleColor))
        Spacer(minLength: 0)
        Text("LOOFIT")
          .font(.system(size: props.brandSize, weight: .bold))
          .foregroundStyle(LoofitHeatmapColor(props.brandColor))
      }

      VStack(alignment: .leading, spacing: props.cellGap) {
        ForEach(rows.indices, id: \.self) { rowIndex in
          HStack(spacing: props.cellGap) {
            ForEach(rows[rowIndex].indices, id: \.self) { cellIndex in
              RoundedRectangle(cornerRadius: props.cellRadius)
                .fill(LoofitHeatmapColor(rows[rowIndex][cellIndex]))
                .frame(width: cellSize, height: cellSize)
            }
          }
        }
      }

      Spacer(minLength: 0)
    }
    .padding(props.contentPadding)
    .frame(width: size.width, height: size.height, alignment: .topLeading)
  }

  private func heatmapRows(props: LoofitHeatmapProps) -> [[String]] {
    switch variant {
    case .week:
      var cells = Array(props.colors.suffix(7))
      while cells.count < 7 {
        cells.append("#00000000")
      }
      return [cells]

    case .month:
      let columns = max(props.columns, 1)
      var rows: [[String]] = []
      var index = 0
      while index < props.colors.count {
        var row = Array(props.colors[index..<min(index + columns, props.colors.count)])
        while row.count < columns {
          row.append("#00000000")
        }
        rows.append(row)
        index += columns
      }
      if rows.isEmpty {
        rows.append(Array(repeating: "#00000000", count: columns))
      }
      return rows

    case .year:
      let weekCount = max(Int(ceil(Double(props.colors.count) / 7.0)), 1)
      return (0..<7).map { weekday in
        (0..<weekCount).map { week in
          let index = week * 7 + weekday
          return index < props.colors.count ? props.colors[index] : "#00000000"
        }
      }
    }
  }
}

struct LoofitHeatmapProps {
  let colors: [String]
  let background: String
  let titleColor: String
  let brandColor: String
  let titleSize: CGFloat
  let brandSize: CGFloat
  let contentPadding: CGFloat
  let cellGap: CGFloat
  let cellRadius: CGFloat
  let headerGap: CGFloat
  let columns: Int

  init(_ raw: [String: Any]?) {
    let raw = raw ?? [:]
    let colorString = raw["colors"] as? String ?? ""

    colors = colorString
      .split(separator: ",")
      .map(String.init)
      .filter { !$0.isEmpty }
    background = raw["background"] as? String ?? "#141418"
    titleColor = raw["titleColor"] as? String ?? "#8A8A90"
    brandColor = raw["brandColor"] as? String ?? "#6B6B70"
    titleSize = LoofitHeatmapProps.cgFloat(raw["titleSize"], fallback: 11)
    brandSize = LoofitHeatmapProps.cgFloat(raw["brandSize"], fallback: 10)
    contentPadding = LoofitHeatmapProps.cgFloat(raw["contentPadding"], fallback: 16)
    cellGap = LoofitHeatmapProps.cgFloat(raw["cellGap"], fallback: 3)
    cellRadius = LoofitHeatmapProps.cgFloat(raw["cellRadius"], fallback: 3)
    headerGap = LoofitHeatmapProps.cgFloat(raw["headerGap"], fallback: 12)
    columns = LoofitHeatmapProps.int(raw["columns"], fallback: 7)
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
          title: '최근 7일',
          variant: 'week',
          displayName: 'Loofit Heatmap · 7일',
          description: 'Review your last 7 days of workouts.',
          family: 'systemSmall',
        })
      );
      write(
        path.join(targetDir, 'HeatmapMonthWidget.swift'),
        heatmapWidget({
          name: 'HeatmapMonthWidget',
          title: '최근 30일',
          variant: 'month',
          displayName: 'Loofit Heatmap · 30일',
          description: 'Review your last 30 days of workouts.',
          family: 'systemSmall',
        })
      );
      write(
        path.join(targetDir, 'HeatmapYearWidget.swift'),
        heatmapWidget({
          name: 'HeatmapYearWidget',
          title: '최근 1년',
          variant: 'year',
          displayName: 'Loofit Heatmap · 1년',
          description: 'Review your last year of workouts.',
          family: 'systemMedium',
        })
      );

      return config;
    },
  ]);
};
