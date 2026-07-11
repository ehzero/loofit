import AppIntents
import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct WorkoutLockScreenWidget: Widget {
  private let kind = LoofitWidgetKinds.lockScreenWorkout

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      LoofitWorkoutLockScreenWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 잠금화면 운동")
    .description("Check your next workout, active workout, and completion on the Lock Screen.")
    .supportedFamilies([.accessoryInline, .accessoryCircular, .accessoryRectangular])
    .contentMarginsDisabled()
  }
}

private struct LoofitWorkoutLockScreenWidgetView: View {
  @Environment(\.widgetFamily) private var family
  @Environment(\.widgetRenderingMode) private var renderingMode

  let entry: LoofitWidgetEntry

  private var presentation: LoofitWorkoutPresentation {
    LoofitWorkoutPresentation(snapshot: entry.snapshot, date: entry.date)
  }

  var body: some View {
    interactiveContent
      .loofitWidgetBackground(.clear)
      .widgetURL(URL(string: "loofit://"))
  }

  @ViewBuilder
  private var interactiveContent: some View {
    if #available(iOS 17.0, *) {
      switch presentation.state {
      case .active:
        if let sessionId = presentation.sessionId {
          Button(intent: LoofitEndWorkoutIntent(sessionId: sessionId)) {
            content
          }
          .buttonStyle(.plain)
        } else {
          content
        }
      case .idle:
        if presentation.canStart {
          Button(intent: LoofitStartNextWorkoutIntent()) {
            content
          }
          .buttonStyle(.plain)
        } else {
          content
        }
      case .completed:
        content
      }
    } else {
      content
    }
  }

  @ViewBuilder
  private var content: some View {
    switch family {
    case .accessoryInline:
      inline
    case .accessoryCircular:
      circular
    case .accessoryRectangular:
      rectangular
    default:
      rectangular
    }
  }

  private var inline: some View {
    Text(inlineText)
      .font(.system(size: 13, weight: .semibold))
      .foregroundStyle(primaryColor)
      .lineLimit(1)
      .minimumScaleFactor(0.75)
  }

  private var circular: some View {
    Group {
      if presentation.state == .active, let startedAt = presentation.startedAt {
        Text(startedAt, style: .timer)
      } else {
        Text(circularText)
      }
    }
    .font(.system(size: presentation.state == .completed ? 15 : 18, weight: .heavy))
    .foregroundStyle(primaryColor)
    .widgetAccentable()
    .lineLimit(1)
    .minimumScaleFactor(0.48)
    .multilineTextAlignment(.center)
    .padding(.horizontal, 2)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }

  private var rectangular: some View {
    VStack(alignment: .center, spacing: 1) {
      Group {
        if presentation.state == .active, let startedAt = presentation.startedAt {
          Text(startedAt, style: .timer)
            .monospacedDigit()
        } else {
          Text(rectangularTitle)
        }
      }
      .font(.system(size: 30, weight: .heavy))
      .foregroundStyle(primaryColor)
      .widgetAccentable()
      .lineLimit(1)
      .minimumScaleFactor(0.62)

      Text(rectangularDetail)
        .font(.system(size: 18, weight: .semibold))
        .foregroundStyle(secondaryColor)
        .lineLimit(1)
        .minimumScaleFactor(0.68)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }

  private var inlineText: String {
    switch presentation.state {
    case .active:
      return "루핏 · 운동 중 \(presentation.title)"
    case .completed:
      return "루핏 · 오운완 \(presentation.title)"
    case .idle:
      return "루핏 · 다음 운동 \(presentation.title)"
    }
  }

  private var circularText: String {
    switch presentation.state {
    case .active:
      return "0분"
    case .completed:
      return "오운완"
    case .idle:
      return String((presentation.detail.isEmpty ? presentation.title : presentation.detail)
        .replacingOccurrences(of: " ", with: "")
        .prefix(3))
    }
  }

  private var rectangularTitle: String {
    switch presentation.state {
    case .active:
      return "0분"
    case .completed:
      return "오운완"
    case .idle:
      return presentation.title
    }
  }

  private var rectangularDetail: String {
    switch presentation.state {
    case .active:
      return presentation.title
    case .completed:
      return [presentation.title, LoofitFormat.duration(presentation.durationSeconds)]
        .filter { !$0.isEmpty }
        .joined(separator: " · ")
    case .idle:
      return presentation.detail
    }
  }

  private var primaryColor: Color {
    renderingMode == .vibrant ? .white : .primary
  }

  private var secondaryColor: Color {
    renderingMode == .vibrant ? Color(white: 0.64) : .secondary
  }
}
