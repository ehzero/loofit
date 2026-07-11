import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct WorkoutLockScreenSummaryWidget: Widget {
  private let kind = LoofitWidgetKinds.lockScreenSummary

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      LoofitWorkoutLockScreenSummaryWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 잠금화면 요약")
    .description("Review your recent 7 days on the Lock Screen.")
    .supportedFamilies([.accessoryRectangular])
    .contentMarginsDisabled()
  }
}

private struct LoofitWorkoutLockScreenSummaryWidgetView: View {
  @Environment(\.widgetRenderingMode) private var renderingMode

  let entry: LoofitWidgetEntry

  private var aggregates: [LoofitHeatmapDay] {
    LoofitHeatmapProjection.days(snapshot: entry.snapshot, endingAt: entry.date, count: 7)
  }

  private var workoutCount: Int {
    aggregates.reduce(0) { $0 + $1.workoutCount }
  }

  private var durationSeconds: Int {
    aggregates.reduce(0) { $0 + $1.durationSeconds }
  }

  var body: some View {
    VStack(alignment: .center, spacing: 6) {
      HStack(spacing: 3) {
        ForEach(aggregates) { day in
          let active = day.durationSeconds > 0
          RoundedRectangle(cornerRadius: 5)
            .fill(active ? activeCellColor : .clear)
            .overlay(
              RoundedRectangle(cornerRadius: 5)
                .stroke(active ? activeCellColor : inactiveCellBorderColor, lineWidth: 1)
            )
            .widgetAccentable(active)
            .frame(width: 18, height: 18)
        }
      }

      Text("\(workoutCount)회 · 총 \(LoofitFormat.duration(durationSeconds))")
        .font(.system(size: 15, weight: .heavy))
        .foregroundStyle(primaryColor)
        .widgetAccentable()
        .lineLimit(1)
        .minimumScaleFactor(0.64)
        .multilineTextAlignment(.center)
    }
    .padding(4)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    .loofitWidgetBackground(.clear)
    .widgetURL(URL(string: "loofit://"))
  }

  private var primaryColor: Color {
    renderingMode == .vibrant ? .white : .primary
  }

  private var activeCellColor: Color {
    renderingMode == .vibrant ? .white : .primary
  }

  private var inactiveCellBorderColor: Color {
    renderingMode == .vibrant ? Color(white: 0.52) : .secondary.opacity(0.8)
  }
}
