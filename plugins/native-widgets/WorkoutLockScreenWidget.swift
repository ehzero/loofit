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
    .description("잠금화면에서 다음 운동, 진행 중인 운동과 완료 상태를 확인합니다.")
    .supportedFamilies([.accessoryInline, .accessoryCircular, .accessoryRectangular])
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
      .font(.system(size: LoofitWidgetRendererContract.LockScreen.inlineFontSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
      .foregroundStyle(primaryColor)
      .lineLimit(1)
      .minimumScaleFactor(0.75)
  }

  private var circular: some View {
    Group {
      if presentation.state == .active, let startedAt = presentation.startedAt {
        Text(startedAt, style: .timer)
          .environment(\.locale, LoofitFormat.koreanLocale)
      } else {
        Text(circularText)
      }
    }
    .font(
      .system(
        size: presentation.state == .completed
          ? LoofitWidgetRendererContract.LockScreen.circularCompletedFontSize
          : LoofitWidgetRendererContract.LockScreen.circularDefaultFontSize,
        weight: LoofitWidgetRendererContract.FontWeight.bold
      )
    )
    .foregroundStyle(primaryColor)
    .widgetAccentable()
    .lineLimit(1)
    .minimumScaleFactor(0.48)
    .multilineTextAlignment(.center)
    .padding(.horizontal, 2)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }

  private var rectangular: some View {
    VStack(alignment: .center, spacing: LoofitWidgetRendererContract.Spacing.xs) {
      Group {
        if presentation.state == .active, let startedAt = presentation.startedAt {
          Text(startedAt, style: .timer)
            .environment(\.locale, LoofitFormat.koreanLocale)
            .monospacedDigit()
        } else {
          Text(rectangularTitle)
        }
      }
      .font(.system(size: LoofitWidgetRendererContract.LockScreen.rectangularTitleFontSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
      .foregroundStyle(primaryColor)
      .widgetAccentable()
      .lineLimit(1)
      .minimumScaleFactor(0.62)
      .multilineTextAlignment(.center)
      .frame(maxWidth: .infinity, alignment: .center)

      Text(rectangularDetail)
        .font(.system(size: LoofitWidgetRendererContract.LockScreen.rectangularDetailFontSize, weight: LoofitWidgetRendererContract.FontWeight.medium))
        .foregroundStyle(secondaryColor)
        .lineLimit(1)
        .minimumScaleFactor(0.68)
    }
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }

  private var inlineText: String {
    switch presentation.state {
    case .active:
      return "\(entry.palette.brandName) · \(LoofitWidgetRendererContract.LockScreen.active) \(presentation.title)"
    case .completed:
      return "\(entry.palette.brandName) · \(LoofitWidgetRendererContract.LockScreen.completedBadge) \(presentation.title)"
    case .idle:
      return "\(entry.palette.brandName) · \(LoofitWidgetRendererContract.LockScreen.idle) \(presentation.title)"
    }
  }

  private var circularText: String {
    switch presentation.state {
    case .active:
      return "0분"
    case .completed:
      return LoofitWidgetRendererContract.LockScreen.completedBadge
    case .idle:
      return String((presentation.detail.isEmpty ? presentation.title : presentation.detail)
        .replacingOccurrences(of: " ", with: "")
        .prefix(LoofitWidgetRendererContract.LockScreen.compactCharacterLimit))
    }
  }

  private var rectangularTitle: String {
    switch presentation.state {
    case .active:
      return "0분"
    case .completed:
      return LoofitWidgetRendererContract.LockScreen.completedBadge
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
