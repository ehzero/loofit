import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct WorkoutControlWidget: Widget {
  let name: String = "WorkoutControlWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      LoofitWorkoutControlWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 운동")
    .description("Start, finish, and review today's workout.")
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabled()
  }
}

struct LoofitWorkoutControlWidgetView: View {
  let entry: WidgetsTimelineProvider.Entry

  var body: some View {
    let props = LoofitWorkoutControlProps(entry.props)

    if #available(iOS 17.0, *) {
      WidgetsEntryView(entry: entry)
        .containerBackground(LoofitWorkoutControlColor(props.background), for: .widget)
    } else {
      WidgetsEntryView(entry: entry)
        .background(LoofitWorkoutControlColor(props.background))
    }
  }
}

private struct LoofitWorkoutControlProps {
  let background: String

  init(_ raw: [String: Any]?) {
    let raw = raw ?? [:]
    background = LoofitWorkoutControlProps.string(raw["background"], fallback: "#141418")
  }

  private static func string(_ value: Any?, fallback: String) -> String {
    guard let value = value as? String,
          !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return fallback
    }
    return value
  }
}

private func LoofitWorkoutControlColor(_ value: String) -> Color {
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)

  guard trimmed.hasPrefix("#") else {
    return Color(red: 20 / 255.0, green: 20 / 255.0, blue: 24 / 255.0)
  }

  let hex = String(trimmed.dropFirst())
  guard let integer = UInt64(hex, radix: 16) else {
    return Color(red: 20 / 255.0, green: 20 / 255.0, blue: 24 / 255.0)
  }

  switch hex.count {
  case 6:
    return Color(
      red: Double((integer >> 16) & 0xFF) / 255.0,
      green: Double((integer >> 8) & 0xFF) / 255.0,
      blue: Double(integer & 0xFF) / 255.0
    )
  case 8:
    return Color(
      red: Double((integer >> 24) & 0xFF) / 255.0,
      green: Double((integer >> 16) & 0xFF) / 255.0,
      blue: Double((integer >> 8) & 0xFF) / 255.0,
      opacity: Double(integer & 0xFF) / 255.0
    )
  default:
    return Color(red: 20 / 255.0, green: 20 / 255.0, blue: 24 / 255.0)
  }
}
