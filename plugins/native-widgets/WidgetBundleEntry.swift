import SwiftUI
import WidgetKit

@main
struct ExportWidgets0: WidgetBundle {
  var body: some Widget {
    WorkoutControlWidget()
    HeatmapWeekWidget()
    HeatmapMonthWidget()
    HeatmapYearWidget()
    CurrentMonthCalendarWidget()
    HeatmapFourWeekExpandedWidget()
    RoutineProgressWidget()
    BodyPartDurationWidget()
    ExportWidgets1().body
  }
}

struct ExportWidgets1: WidgetBundle {
  var body: some Widget {
    WorkoutLockScreenWidget()
    ThreeWeekCalendarLockScreenWidget()
    NextThreeWeekCalendarLockScreenWidget()
    RoutineProgressLockScreenWidget()
    LoofitWorkoutLiveActivity()
  }
}
