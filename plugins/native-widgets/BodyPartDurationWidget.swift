import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct BodyPartDurationWidget: Widget {
  private let kind = LoofitWidgetKinds.bodyPartDuration

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      BodyPartDurationWidgetView(entry: entry)
    }
    .configurationDisplayName("루핏 부위별 운동 시간")
    .description("최근 30일 동안 부위별로 기록된 운동 시간을 확인합니다.")
    .supportedFamilies([.systemSmall])
    .contentMarginsDisabled()
  }
}

struct BodyPartDurationWidgetView: View {
  let entry: LoofitWidgetEntry

  private var items: [LoofitBodyPartDurationSnapshot] {
    Array((entry.snapshot?.bodyPartDurations ?? []).prefix(
      LoofitWidgetRendererContract.BodyPartDuration.visibleItemLimit
    ))
  }

  private var maxDuration: Int {
    max(items.map(\.durationSeconds).max() ?? 0, 1)
  }

  var body: some View {
    GeometryReader { geometry in
      VStack(alignment: .leading, spacing: 0) {
        Text(LoofitWidgetRendererContract.BodyPartDuration.title)
          .font(.system(size: LoofitWidgetRendererContract.BodyPartDuration.titleSize, weight: LoofitWidgetRendererContract.BodyPartDuration.titleWeight))
          .foregroundStyle(LoofitColor(entry.palette.tx))
          .lineLimit(1)

        if items.isEmpty {
          Text("아직 기록 없음")
            .font(.system(size: LoofitWidgetRendererContract.BodyPartDuration.bodyPartSize, weight: LoofitWidgetRendererContract.BodyPartDuration.bodyPartWeight))
            .foregroundStyle(LoofitColor(entry.palette.tx4))
            .frame(maxWidth: .infinity, maxHeight: .infinity, alignment: .center)
        } else {
          Spacer(minLength: LoofitWidgetRendererContract.Spacing.md)
          VStack(alignment: .leading, spacing: 0) {
            ForEach(Array(items.enumerated()), id: \.offset) { index, item in
              row(item)
              if index < items.count - 1 { Spacer(minLength: 0) }
            }
          }
          .frame(maxHeight: .infinity)
        }
      }
      .padding(LoofitHomeWidgetContentPadding(for: geometry.size))
      .frame(width: geometry.size.width, height: geometry.size.height, alignment: .topLeading)
    }
    .loofitWidgetBackground(LoofitColor(entry.palette.card))
    .widgetURL(URL(string: "loofit://"))
  }

  private func row(_ item: LoofitBodyPartDurationSnapshot) -> some View {
    VStack(alignment: .leading, spacing: LoofitWidgetRendererContract.Spacing.xs) {
      HStack(alignment: .firstTextBaseline, spacing: LoofitWidgetRendererContract.Spacing.sm) {
        Text(item.bodyPartName)
          .font(.system(size: LoofitWidgetRendererContract.BodyPartDuration.bodyPartSize, weight: LoofitWidgetRendererContract.BodyPartDuration.bodyPartWeight))
          .foregroundStyle(LoofitColor(entry.palette.tx))
          .lineLimit(1)
        Spacer(minLength: 0)
        Text(LoofitFormat.duration(item.durationSeconds))
          .font(.system(size: LoofitWidgetRendererContract.BodyPartDuration.durationSize, weight: LoofitWidgetRendererContract.BodyPartDuration.durationWeight))
          .foregroundStyle(LoofitColor(entry.palette.tx3))
          .lineLimit(1)
      }
      GeometryReader { geometry in
        let ratio = CGFloat(item.durationSeconds) / CGFloat(maxDuration)
        ZStack(alignment: .leading) {
          RoundedRectangle(cornerRadius: LoofitWidgetRendererContract.BodyPartDuration.barRadius)
            .fill(LoofitColor(entry.palette.surface2))
          RoundedRectangle(cornerRadius: LoofitWidgetRendererContract.BodyPartDuration.barRadius)
            .fill(LoofitColor(entry.palette.accent))
            .frame(width: geometry.size.width * ratio)
        }
      }
      .frame(height: LoofitWidgetRendererContract.BodyPartDuration.barHeight)
    }
  }
}
