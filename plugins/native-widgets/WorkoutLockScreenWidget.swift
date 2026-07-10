import WidgetKit
import SwiftUI
internal import ExpoWidgets

struct WorkoutLockScreenWidget: Widget {
  let name: String = "WorkoutLockScreenWidget"

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: name, provider: WidgetsTimelineProvider(name: name)) { entry in
      LoofitWorkoutLockScreenWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 잠금화면 운동")
    .description("Check your next workout, active workout, and completion on the Lock Screen.")
    .supportedFamilies([.accessoryInline, .accessoryCircular, .accessoryRectangular])
    .contentMarginsDisabled()
  }
}

struct LoofitWorkoutLockScreenWidgetView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var renderingMode
  let entry: WidgetsTimelineProvider.Entry

  var body: some View {
    let props = LoofitWorkoutLockScreenProps(entry.props)
    lockScreenBackground {
      switch family {
      case .accessoryInline:
        inline(props)
      case .accessoryCircular:
        circular(props)
      case .accessoryRectangular:
        rectangular(props)
      default:
        rectangular(props)
      }
    }
  }

  private func inline(_ props: LoofitWorkoutLockScreenProps) -> some View {
    Text(props.inlineText)
      .font(.system(size: 13, weight: .semibold))
      .foregroundStyle(primaryColor)
      .lineLimit(1)
      .minimumScaleFactor(0.75)
  }

  private func circular(_ props: LoofitWorkoutLockScreenProps) -> some View {
    Text(props.circularValue)
      .font(.system(size: props.state == "completed" ? 15 : 18, weight: .heavy))
      .foregroundStyle(primaryColor)
      .widgetAccentable()
      .lineLimit(1)
      .minimumScaleFactor(0.52)
      .multilineTextAlignment(.center)
      .padding(.horizontal, 2)
      .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }

  private func rectangular(_ props: LoofitWorkoutLockScreenProps) -> some View {
    VStack(alignment: .center, spacing: 1) {
      Text(props.rectangularTitle)
        .font(.system(size: 30, weight: .heavy))
        .foregroundStyle(primaryColor)
        .widgetAccentable()
        .lineLimit(1)
        .truncationMode(.tail)
        .allowsTightening(true)
        .multilineTextAlignment(.center)

      Text(props.rectangularDetail)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(secondaryColor)
        .lineLimit(1)
        .truncationMode(.tail)
        .allowsTightening(true)
        .multilineTextAlignment(.center)
    }
    .padding(.horizontal, 0)
    .padding(.vertical, 0)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
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

  private var secondaryColor: Color {
    renderingMode == .vibrant ? Color(white: 0.64) : .secondary
  }

}

private struct LoofitWorkoutLockScreenProps {
  let state: String
  let brandName: String
  let inlineText: String
  let circularValue: String
  let rectangularEyebrow: String
  let rectangularTitle: String
  let rectangularDetail: String
  let accent: String
  let titleColor: String
  let detailColor: String

  init(_ raw: [String: Any]?) {
    let raw = raw ?? [:]
    state = LoofitWorkoutLockScreenProps.string(raw["state"], fallback: "idle")
    brandName = LoofitWorkoutLockScreenProps.string(raw["brandName"], fallback: "루핏")
    inlineText = LoofitWorkoutLockScreenProps.string(raw["inlineText"], fallback: "\(brandName) · 다음 운동")
    circularValue = LoofitWorkoutLockScreenProps.string(raw["circularValue"], fallback: "운동")
    rectangularEyebrow = LoofitWorkoutLockScreenProps.string(raw["rectangularEyebrow"], fallback: "다음 운동")
    rectangularTitle = LoofitWorkoutLockScreenProps.string(raw["rectangularTitle"], fallback: "루틴 설정")
    rectangularDetail = LoofitWorkoutLockScreenProps.string(raw["rectangularDetail"], fallback: "")
    accent = LoofitWorkoutLockScreenProps.string(raw["accent"], fallback: "#CFF56A")
    titleColor = LoofitWorkoutLockScreenProps.string(raw["titleColor"], fallback: "#F4F4F2")
    detailColor = LoofitWorkoutLockScreenProps.string(raw["detailColor"], fallback: "#8A8A90")
  }

  private static func string(_ value: Any?, fallback: String) -> String {
    guard let value = value as? String,
          !value.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty else {
      return fallback
    }
    return value
  }
}

private func LoofitWorkoutLockScreenColor(_ value: String) -> Color {
  let trimmed = value.trimmingCharacters(in: .whitespacesAndNewlines)

  guard trimmed.hasPrefix("#") else {
    return Color.primary
  }

  let hex = String(trimmed.dropFirst())
  guard let integer = UInt64(hex, radix: 16) else {
    return Color.primary
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
    return Color.primary
  }
}
