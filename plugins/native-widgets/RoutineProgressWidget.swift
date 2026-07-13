import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct RoutineProgressWidget: Widget {
  private let kind = LoofitWidgetKinds.routineProgress

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      RoutineProgressWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 루틴 진행")
    .description("루틴 분할별 최근 운동과 현재 순서를 확인합니다.")
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabled()
  }
}

private struct RoutineProgressWidgetView: View {
  let entry: LoofitWidgetEntry

  private var progress: LoofitRoutineProgressSnapshot? { entry.snapshot?.routineProgress }

  private var items: [LoofitRoutineProgressItemSnapshot] {
    LoofitVisibleRoutineItems(
      progress,
      limit: LoofitWidgetRendererContract.RoutineProgress.visibleItemLimit
    )
  }

  var body: some View {
    GeometryReader { geometry in
      Group {
        if items.isEmpty {
          Text(LoofitWidgetRendererContract.LockScreen.routineRequired)
            .font(.system(size: LoofitWidgetRendererContract.RoutineProgress.metadataSize, weight: LoofitWidgetRendererContract.RoutineProgress.metadataWeight))
            .foregroundStyle(LoofitColor(entry.palette.tx4))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else {
          VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
              row(item)
              if index < items.count - 1 { Spacer(minLength: 0) }
            }
          }
        }
      }
      .padding(LoofitHomeWidgetContentPadding(for: geometry.size))
      .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
    }
    .loofitWidgetBackground(LoofitColor(entry.palette.card))
    .widgetURL(URL(string: "loofit://"))
  }

  private func row(_ item: LoofitRoutineProgressItemSnapshot) -> some View {
    let current = item.routineDayId == progress?.currentRoutineDayId
    let color = LoofitColor(current ? entry.palette.accent : entry.palette.tx4)
    let relativeDay = item.latestCompleted?.startedDate.map {
      LoofitFormat.relativeDay($0, now: entry.date)
    } ?? LoofitWidgetRendererContract.RoutineProgress.emptyRelativeDay
    let metadata = [
      LoofitRoutineBodyParts(item),
      item.latestCompleted.map { LoofitFormat.duration($0.durationSeconds) } ?? "",
    ].filter { !$0.isEmpty }.joined(
      separator: LoofitWidgetRendererContract.RoutineProgress.metadataSeparator
    )

    return VStack(alignment: .leading, spacing: LoofitWidgetRendererContract.Spacing.xs) {
      HStack(alignment: .firstTextBaseline, spacing: LoofitWidgetRendererContract.Spacing.sm) {
        Text(item.title)
          .font(.system(size: LoofitWidgetRendererContract.RoutineProgress.splitSize, weight: LoofitWidgetRendererContract.RoutineProgress.splitWeight))
          .lineLimit(1)
          .minimumScaleFactor(LoofitWidgetRendererContract.MinimumScale.dense)
        Spacer(minLength: 0)
        Text(relativeDay)
          .font(.system(size: LoofitWidgetRendererContract.RoutineProgress.metadataSize, weight: LoofitWidgetRendererContract.RoutineProgress.metadataWeight))
          .lineLimit(1)
      }
      Text(metadata)
        .font(.system(size: LoofitWidgetRendererContract.RoutineProgress.metadataSize, weight: LoofitWidgetRendererContract.RoutineProgress.metadataWeight))
        .lineLimit(1)
        .minimumScaleFactor(LoofitWidgetRendererContract.MinimumScale.dense)
    }
    .foregroundStyle(color)
  }
}
