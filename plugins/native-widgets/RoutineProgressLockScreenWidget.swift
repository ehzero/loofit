import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct RoutineProgressLockScreenWidget: Widget {
  private let kind = LoofitWidgetKinds.lockScreenRoutineProgress

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      RoutineProgressLockScreenWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 잠금화면 루틴 진행")
    .description("루틴 분할의 최근 운동 날짜와 현재 순서를 확인합니다.")
    .supportedFamilies([.accessoryRectangular])
  }
}

private struct RoutineProgressLockScreenWidgetView: View {
  @Environment(\.widgetRenderingMode) private var renderingMode

  let entry: LoofitWidgetEntry

  private var progress: LoofitRoutineProgressSnapshot? { entry.snapshot?.routineProgress }

  private var items: [LoofitRoutineProgressItemSnapshot] {
    LoofitVisibleRoutineItems(
      progress,
      limit: LoofitWidgetRendererContract.RoutineProgress.LockScreen.visibleItemLimit
    )
  }

  var body: some View {
    HStack(spacing: LoofitWidgetRendererContract.RoutineProgress.LockScreen.columnGap) {
      if items.isEmpty {
        Text(LoofitWidgetRendererContract.LockScreen.routineRequired)
          .font(.system(size: LoofitWidgetRendererContract.RoutineProgress.LockScreen.relativeDaySize, weight: LoofitWidgetRendererContract.RoutineProgress.LockScreen.relativeDayWeight))
          .foregroundStyle(.secondary)
          .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
      } else {
        ForEach(items, id: \.routineDayId) { item in
          column(item)
        }
      }
    }
    .padding(LoofitWidgetRendererContract.RoutineProgress.LockScreen.contentPadding)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
    .loofitWidgetBackground(.clear)
    .widgetURL(URL(string: "loofit://"))
  }

  private func column(_ item: LoofitRoutineProgressItemSnapshot) -> some View {
    let current = item.routineDayId == progress?.currentRoutineDayId
    let workout = LoofitRoutineWorkoutLabel(item)
    let relativeDay = item.latestCompleted?.startedDate.map {
      LoofitFormat.relativeDay($0, now: entry.date)
    } ?? LoofitWidgetRendererContract.RoutineProgress.emptyRelativeDay

    return VStack(alignment: .center, spacing: LoofitWidgetRendererContract.RoutineProgress.LockScreen.itemGap) {
      Text(workout)
        .font(.system(size: LoofitWidgetRendererContract.RoutineProgress.LockScreen.workoutSize, weight: LoofitWidgetRendererContract.RoutineProgress.LockScreen.workoutWeight))
        .lineLimit(1)
        .minimumScaleFactor(LoofitWidgetRendererContract.MinimumScale.dense)
      Text(relativeDay)
        .font(.system(size: LoofitWidgetRendererContract.RoutineProgress.LockScreen.relativeDaySize, weight: LoofitWidgetRendererContract.RoutineProgress.LockScreen.relativeDayWeight))
        .lineLimit(1)
    }
    .foregroundStyle(current ? primaryColor : secondaryColor)
    .widgetAccentable(current)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
  }

  private var primaryColor: Color {
    renderingMode == .vibrant ? .white : .primary
  }

  private var secondaryColor: Color {
    renderingMode == .vibrant ? Color(white: 0.52) : .secondary
  }
}
