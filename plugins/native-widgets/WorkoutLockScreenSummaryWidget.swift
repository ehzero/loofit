import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct WorkoutLockScreenSummaryWidget: Widget {
  let name: String = "WorkoutLockScreenSummaryWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      LoofitWorkoutLockScreenSummaryWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 잠금화면 요약")
    .description("Review your recent 7 days on the Lock Screen.")
    .supportedFamilies([.accessoryRectangular])
    .contentMarginsDisabled()
  }
}

struct LoofitWorkoutLockScreenSummaryWidgetView: View {
  @Environment(\.widgetRenderingMode) private var renderingMode
  let entry: WidgetsTimelineProvider.Entry

  var body: some View {
    let props = LoofitWorkoutLockScreenSummaryProps(entry.props)
    lockScreenBackground {
      VStack(alignment: .center, spacing: 6) {
        HStack(spacing: 3) {
          ForEach(props.streakFlags.indices, id: \.self) { index in
            let isActive = props.streakFlags[index]
            RoundedRectangle(cornerRadius: 5)
              .fill(isActive ? activeCellColor : inactiveCellColor)
              .overlay(
                RoundedRectangle(cornerRadius: 5)
                  .stroke(isActive ? activeCellBorderColor : inactiveCellBorderColor, lineWidth: 1)
              )
              .widgetAccentable(isActive)
              .frame(width: 18, height: 18)
          }
        }

        Text(props.summaryText)
          .font(.system(size: 15, weight: .heavy))
          .foregroundStyle(primaryColor)
          .widgetAccentable()
          .lineLimit(1)
          .minimumScaleFactor(0.64)
          .multilineTextAlignment(.center)
      }
      .padding(.horizontal, 4)
      .padding(.vertical, 4)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    }
  }

  @ViewBuilder
  private func lockScreenBackground<Content: View>(@ViewBuilder content: () -> Content) -> some View {
    if #available(iOS 17.0, *) {
      content()
        .containerBackground(Color.clear, for: .widget)
    } else {
      content()
    }
  }

  private var primaryColor: Color {
    renderingMode == .vibrant ? .white : .primary
  }

  private var activeCellColor: Color {
    renderingMode == .vibrant ? .white : .primary
  }

  private var inactiveCellColor: Color {
    .clear
  }

  private var activeCellBorderColor: Color {
    renderingMode == .vibrant ? .white : .primary
  }

  private var inactiveCellBorderColor: Color {
    renderingMode == .vibrant ? Color(white: 0.52) : .secondary.opacity(0.8)
  }

}

private struct LoofitWorkoutLockScreenSummaryProps {
  let streakFlags: [Bool]
  let summaryText: String

  init(_ raw: [String: Any]?) {
    let raw = raw ?? [:]
    streakFlags = LoofitWorkoutLockScreenSummaryProps.flags(raw["streakFlags"] as? String ?? "")
    summaryText = LoofitWorkoutLockScreenSummaryProps.string(raw["summaryText"], fallback: "0회 · 총 0분")
  }

  private static func string(_ value: Any?, fallback: String) -> String {
    guard let value = value as? String,
          !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return fallback
    }
    return value
  }

  private static func flags(_ value: String) -> [Bool] {
    let values = value.split(separator: ",", omittingEmptySubsequences: false).map { $0 == "1" }
    let padded = Array(repeating: false, count: max(0, 7 - values.count)) + values
    return Array(padded.suffix(7))
  }
}
