import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct NextThreeWeekCalendarLockScreenWidget: Widget {
  private let kind = LoofitWidgetKinds.lockScreenNextThreeWeekCalendar

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      ThreeWeekCalendarLockScreenWidgetView(entry: entry, range: .next)
    }
    .configurationDisplayName("루핏 잠금화면 히트맵 · 다음 3주")
    .description("이번 주와 다음 2주의 운동 기록을 히트맵으로 확인합니다.")
    .supportedFamilies([.accessoryRectangular])
  }
}
