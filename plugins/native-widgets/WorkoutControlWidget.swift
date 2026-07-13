import AppIntents
import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct WorkoutControlWidget: Widget {
  private let kind = LoofitWidgetKinds.control

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      LoofitWorkoutControlWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 운동")
    .description("Start, finish, and review today's workout.")
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabled()
  }
}

private struct LoofitWorkoutControlWidgetView: View {
  let entry: LoofitWidgetEntry

  private var presentation: LoofitWorkoutPresentation {
    LoofitWorkoutPresentation(snapshot: entry.snapshot, date: entry.date)
  }

  var body: some View {
    let palette = entry.palette

    Group {
      switch presentation.state {
      case .active:
        activeView(palette: palette)
      case .completed:
        completedView(palette: palette)
      case .idle:
        idleView(palette: palette)
      }
    }
    .padding(LoofitWidgetRendererContract.contentPadding)
    .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .topLeading)
    .loofitWidgetBackground(LoofitColor(palette.card))
    .widgetURL(URL(string: "loofit://"))
  }

  private func header(_ label: String, palette: LoofitWidgetPalette, active: Bool = false) -> some View {
    HStack(spacing: LoofitWidgetRendererContract.Control.activeDotGap) {
      if active {
        Circle()
          .fill(LoofitColor(palette.accent))
          .frame(
            width: LoofitWidgetRendererContract.Control.activeDotSize,
            height: LoofitWidgetRendererContract.Control.activeDotSize
          )
      }
      Text(label)
        .font(.system(size: LoofitWidgetRendererContract.Control.rangeSize, weight: LoofitWidgetRendererContract.FontWeight.medium))
        .foregroundStyle(LoofitColor(active ? palette.accent : palette.tx3))
        .lineLimit(1)
      Spacer(minLength: 0)
    }
  }

  private func activeView(palette: LoofitWidgetPalette) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      header("운동 중", palette: palette, active: true)
      Spacer(minLength: 0)
      VStack(alignment: .leading, spacing: LoofitWidgetRendererContract.Control.bodyGap) {
        if let startedAt = presentation.startedAt {
          Text(startedAt, style: .timer)
            .font(.system(size: LoofitWidgetRendererContract.Control.timerSize, weight: LoofitWidgetRendererContract.FontWeight.bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(LoofitColor(palette.tx))
            .lineLimit(1)
            .minimumScaleFactor(0.72)
        } else {
          Text("0:00")
            .font(.system(size: LoofitWidgetRendererContract.Control.timerSize, weight: LoofitWidgetRendererContract.FontWeight.bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(LoofitColor(palette.tx))
        }
        Text(presentation.title)
          .font(.system(size: LoofitWidgetRendererContract.Control.detailSize, weight: LoofitWidgetRendererContract.FontWeight.light))
          .foregroundStyle(LoofitColor(palette.tx3))
          .lineLimit(1)
      }
      Spacer(minLength: 0)
      if #available(iOS 17.0, *), let sessionId = presentation.sessionId {
        Button(intent: LoofitEndWorkoutIntent(sessionId: sessionId)) {
          LoofitControlButtonLabel(
            title: "운동 종료",
            background: palette.surface2,
            foreground: palette.tx
          )
        }
        .buttonStyle(.plain)
      } else {
        Link(destination: URL(string: "loofit://")!) {
          LoofitControlButtonLabel(
            title: "운동 종료",
            background: palette.surface2,
            foreground: palette.tx
          )
        }
      }
    }
  }

  private func completedView(palette: LoofitWidgetPalette) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      header("오늘 운동 완료", palette: palette)
      Spacer(minLength: 0)
      VStack(alignment: .leading, spacing: LoofitWidgetRendererContract.Control.bodyGap) {
        Text(presentation.title)
          .font(.system(size: LoofitWidgetRendererContract.Control.titleSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
          .foregroundStyle(LoofitColor(palette.tx))
          .lineLimit(1)
          .minimumScaleFactor(0.75)
        if !presentation.detail.isEmpty, presentation.detail != presentation.title {
          Text(presentation.detail)
            .font(.system(size: LoofitWidgetRendererContract.Control.detailSize, weight: LoofitWidgetRendererContract.FontWeight.light))
            .foregroundStyle(LoofitColor(palette.tx3))
            .lineLimit(1)
        }
      }
      Spacer(minLength: 0)
      VStack(alignment: .leading, spacing: LoofitWidgetRendererContract.Control.footerGap) {
        Text(LoofitFormat.duration(presentation.durationSeconds))
          .font(.system(size: LoofitWidgetRendererContract.Control.durationSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
          .foregroundStyle(LoofitColor(palette.accent))
          .lineLimit(1)
        if !presentation.timeRange.isEmpty {
          Text(presentation.timeRange)
            .font(.system(size: LoofitWidgetRendererContract.Control.rangeSize, weight: LoofitWidgetRendererContract.FontWeight.light))
            .foregroundStyle(LoofitColor(palette.tx3))
            .lineLimit(1)
        }
      }
    }
  }

  private func idleView(palette: LoofitWidgetPalette) -> some View {
    VStack(alignment: .leading, spacing: 0) {
      header("다음 운동", palette: palette)
      Spacer(minLength: 0)
      VStack(alignment: .leading, spacing: LoofitWidgetRendererContract.Control.bodyGap) {
        Text(presentation.title)
          .font(.system(size: LoofitWidgetRendererContract.Control.titleSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
          .foregroundStyle(LoofitColor(palette.tx))
          .lineLimit(1)
          .minimumScaleFactor(0.75)
        if !presentation.detail.isEmpty, presentation.detail != presentation.title {
          Text(presentation.detail)
            .font(.system(size: LoofitWidgetRendererContract.Control.detailSize, weight: LoofitWidgetRendererContract.FontWeight.light))
            .foregroundStyle(LoofitColor(palette.tx3))
            .lineLimit(1)
        }
      }
      Spacer(minLength: 0)
      if #available(iOS 17.0, *), presentation.canStart {
        Button(intent: LoofitStartNextWorkoutIntent()) {
          LoofitControlButtonLabel(
            title: "운동 시작",
            background: palette.accent,
            foreground: palette.accentText
          )
        }
        .buttonStyle(.plain)
      } else {
        Link(destination: URL(string: "loofit://")!) {
          LoofitControlButtonLabel(
            title: presentation.canStart ? "운동 시작" : "루틴 설정",
            background: palette.accent,
            foreground: palette.accentText
          )
        }
      }
    }
  }
}

private struct LoofitControlButtonLabel: View {
  let title: String
  let background: String
  let foreground: String

  var body: some View {
    Text(title)
      .font(.system(size: LoofitWidgetRendererContract.Control.buttonTextSize, weight: LoofitWidgetRendererContract.FontWeight.bold))
      .foregroundStyle(LoofitColor(foreground))
      .frame(
        maxWidth: .infinity,
        minHeight: LoofitWidgetRendererContract.Control.buttonHeight,
        maxHeight: LoofitWidgetRendererContract.Control.buttonHeight
      )
      .background(LoofitColor(background))
      .clipShape(
        RoundedRectangle(
          cornerRadius: LoofitWidgetRendererContract.Control.buttonRadius,
          style: .continuous
        )
      )
  }
}
