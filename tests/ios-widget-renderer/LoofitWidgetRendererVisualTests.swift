import CoreGraphics
import CryptoKit
import SwiftUI
import UIKit
import WidgetKit
import XCTest
import LoofitWorkoutCore
@testable import LoofitWidgetRenderer

final class LoofitWidgetRendererVisualTests: XCTestCase {
  private let calendar: Calendar = {
    var value = Calendar(identifier: .gregorian)
    value.timeZone = TimeZone(identifier: "Asia/Seoul")!
    value.locale = Locale(identifier: "ko_KR")
    return value
  }()

  override func setUp() {
    super.setUp()
    NSTimeZone.default = TimeZone(identifier: "Asia/Seoul")!
  }

  @MainActor
  func testVisualGoldensCoverEveryWidgetInLightAndDark() throws {
    let preview = try PreviewData.load()
    let definitions = visualDefinitions()
    XCTAssertEqual(definitions.count, LoofitWidgetKinds.all.count)

    var hashes: [String: String] = [:]
    for colorScheme in [ColorScheme.light, .dark] {
      let themeName = colorScheme == .light ? "light" : "dark"
      let palette = colorScheme == .light ? preview.palette.light : preview.palette.dark
      let snapshot = snapshot(preview: preview.fixture, palette: palette, completed: false)
      let entry = LoofitWidgetEntry(date: anchorDate, snapshot: snapshot)
      for definition in definitions {
        let name = "\(themeName)_\(definition.name)"
        hashes[name] = try render(
          name: name,
          view: definition.makeView(entry),
          size: definition.size,
          colorScheme: colorScheme,
          background: definition.isAccessory ? nil : palette.surface
        )
      }
    }

    let completedSnapshot = snapshot(
      preview: preview.fixture,
      palette: preview.palette.dark,
      completed: true
    )
    let completedEntry = LoofitWidgetEntry(date: anchorDate, snapshot: completedSnapshot)
    for definition in visualDefinitions().filter({
      $0.name == "control" || $0.name == "lock_workout"
    }) {
      let name = "dark_\(definition.name)_completed"
      hashes[name] = try render(
        name: name,
        view: definition.makeView(completedEntry),
        size: definition.size,
        colorScheme: .dark,
        background: definition.isAccessory ? nil : preview.palette.dark.surface
      )
    }

    try writeHashReport(hashes)
    if ProcessInfo.processInfo.environment["LOOFIT_UPDATE_WIDGET_GOLDENS"] != "1" {
      XCTAssertEqual(hashes, Self.expectedVisualHashes)
    }
  }

  private var anchorDate: Date {
    date(year: 2026, month: 7, day: 18, hour: 20, minute: 32, second: 10)
  }

  private func visualDefinitions() -> [VisualDefinition] {
    let small = LoofitWidgetRendererContract.PreviewViewports.homeSmall
    let medium = LoofitWidgetRendererContract.PreviewViewports.homeMedium
    let lock = LoofitWidgetRendererContract.PreviewViewports.accessoryRectangular
    return [
      VisualDefinition(name: "control", size: small) {
        AnyView(LoofitWorkoutControlWidgetView(entry: $0))
      },
      VisualDefinition(name: "heatmap_week", size: small) {
        AnyView(LoofitHeatmapWidgetView(entry: $0, variant: .week))
      },
      VisualDefinition(name: "heatmap_month", size: small) {
        AnyView(LoofitHeatmapWidgetView(entry: $0, variant: .month))
      },
      VisualDefinition(name: "heatmap_six_months", size: medium) {
        AnyView(LoofitHeatmapWidgetView(entry: $0, variant: .sixMonths))
      },
      VisualDefinition(name: "current_month", size: small) {
        AnyView(CurrentMonthCalendarWidgetView(entry: $0))
      },
      VisualDefinition(name: "four_week_expanded", size: medium) {
        AnyView(HeatmapFourWeekExpandedWidgetView(entry: $0))
      },
      VisualDefinition(name: "routine_progress", size: small) {
        AnyView(RoutineProgressWidgetView(entry: $0))
      },
      VisualDefinition(name: "body_part_duration", size: small) {
        AnyView(BodyPartDurationWidgetView(entry: $0))
      },
      VisualDefinition(name: "lock_workout", size: lock, isAccessory: true) {
        AnyView(LoofitWorkoutLockScreenWidgetView(entry: $0))
      },
      VisualDefinition(name: "lock_three_week", size: lock, isAccessory: true) {
        AnyView(ThreeWeekCalendarLockScreenWidgetView(entry: $0, range: .past))
      },
      VisualDefinition(name: "lock_next_three_week", size: lock, isAccessory: true) {
        AnyView(ThreeWeekCalendarLockScreenWidgetView(entry: $0, range: .next))
      },
      VisualDefinition(name: "lock_routine_progress", size: lock, isAccessory: true) {
        AnyView(RoutineProgressLockScreenWidgetView(entry: $0))
      },
    ]
  }

  @MainActor
  private func render(
    name: String,
    view: AnyView,
    size: CGSize,
    colorScheme: ColorScheme,
    background: String?
  ) throws -> String {
    let content = ZStack {
      if let background {
        LoofitColor(background)
      }
      view
    }
      .environment(\.colorScheme, colorScheme)
      .environment(\.locale, Locale(identifier: "ko_KR"))
      .frame(width: size.width, height: size.height)
    let renderer = ImageRenderer(content: content)
    renderer.proposedSize = ProposedViewSize(size)
    renderer.scale = 1
    guard let image = renderer.cgImage else {
      XCTFail("Could not render \(name)")
      return ""
    }

    let pixels = try normalizedPixels(image)
    XCTAssertTrue(pixels.contains(where: { $0 != 0 }), "\(name) rendered as a blank image")
    try writePNG(image, name: name)
    var hashInput = Data("\(image.width)x\(image.height):".utf8)
    hashInput.append(pixels)
    return SHA256.hash(data: hashInput).map { String(format: "%02x", $0) }.joined()
  }

  private func normalizedPixels(_ image: CGImage) throws -> Data {
    let bytesPerRow = image.width * 4
    var bytes = [UInt8](repeating: 0, count: bytesPerRow * image.height)
    let colorSpace = CGColorSpace(name: CGColorSpace.sRGB)!
    let created = bytes.withUnsafeMutableBytes { buffer -> Bool in
      guard let baseAddress = buffer.baseAddress,
            let context = CGContext(
              data: baseAddress,
              width: image.width,
              height: image.height,
              bitsPerComponent: 8,
              bytesPerRow: bytesPerRow,
              space: colorSpace,
              bitmapInfo: CGImageAlphaInfo.premultipliedLast.rawValue |
                CGBitmapInfo.byteOrder32Big.rawValue
            ) else {
        return false
      }
      context.setBlendMode(.copy)
      context.draw(image, in: CGRect(x: 0, y: 0, width: image.width, height: image.height))
      return true
    }
    guard created else {
      throw VisualTestError.couldNotCreateBitmapContext
    }
    return Data(bytes)
  }

  private func reportDirectory() throws -> URL {
    let environment = ProcessInfo.processInfo.environment
    let path = environment["LOOFIT_WIDGET_GOLDEN_REPORT_DIR"] ??
      FileManager.default.temporaryDirectory
        .appendingPathComponent("loofit-widget-goldens-ios", isDirectory: true).path
    let url = URL(fileURLWithPath: path, isDirectory: true)
    try FileManager.default.createDirectory(at: url, withIntermediateDirectories: true)
    return url
  }

  private func writePNG(_ image: CGImage, name: String) throws {
    guard let data = UIImage(cgImage: image).pngData() else {
      throw VisualTestError.couldNotEncodePNG
    }
    try data.write(to: reportDirectory().appendingPathComponent("\(name).png"))
  }

  private func writeHashReport(_ hashes: [String: String]) throws {
    let report = hashes.keys.sorted().map { key in
      "\"\(key)\": \"\(hashes[key]!)\""
    }.joined(separator: ",\n") + "\n"
    try report.write(
      to: reportDirectory().appendingPathComponent("hashes.txt"),
      atomically: true,
      encoding: .utf8
    )
  }

  private func snapshot(
    preview: PreviewFixture,
    palette: PreviewPalette,
    completed: Bool
  ) -> LoofitWorkoutSnapshot {
    let routineItems = preview.routineProgress.items.enumerated().map { index, item in
      let parts = parts(item.bodyParts, firstId: Int64(index * 10 + 1))
      let completedDate = calendar.date(
        byAdding: .day,
        value: -relativeDayOffset(item.relativeDay),
        to: anchorDate
      )!
      return LoofitRoutineProgressItemSnapshot(
        routineDayId: Int64(index + 1),
        title: item.split,
        parts: parts,
        latestCompleted: session(
          id: Int64(80 + index),
          routineDayId: Int64(index + 1),
          title: item.split.isEmpty ? item.bodyParts : item.split,
          detail: item.bodyParts.replacingOccurrences(of: "·", with: " · "),
          startedAt: completedDate,
          durationSeconds: parseDuration(item.duration),
          parts: parts
        )
      )
    }
    let completedSession = session(
      id: 99,
      routineDayId: 1,
      title: preview.control.completed.title,
      detail: preview.control.completed.detail,
      startedAt: date(year: 2026, month: 7, day: 18, hour: 19, minute: 24),
      durationSeconds: parseDuration(preview.control.completed.duration ?? "0분"),
      parts: parts(preview.control.completed.detail, firstId: 100)
    )
    let daily = (0..<220).map { offset -> LoofitWorkoutDailyAggregate in
      let day = calendar.date(byAdding: .day, value: offset - 219, to: anchorDate)!
      let duration = preview.heatmap.durationPatternSeconds[
        offset % preview.heatmap.durationPatternSeconds.count
      ]
      return LoofitWorkoutDailyAggregate(
        dateKey: dateKey(day),
        workoutCount: duration > 0 ? 1 : 0,
        durationSeconds: duration
      )
    }
    let dailyDetails = daily.enumerated().map { index, aggregate in
      LoofitWorkoutDailyDetail(
        dateKey: aggregate.dateKey,
        bodyPartNames: aggregate.durationSeconds > 0
          ? routineItems[index % routineItems.count].parts.map(\.name)
          : []
      )
    }
    let targetParts = parts(preview.control.idle.detail, firstId: 200)
    return LoofitWorkoutSnapshot(
      revision: 42,
      generatedAt: isoString(anchorDate),
      timeZoneIdentifier: "Asia/Seoul",
      theme: theme(palette),
      activeSession: nil,
      nextWorkout: LoofitWorkoutTargetSnapshot(
        routineId: 1,
        routineDayId: 2,
        title: preview.control.idle.title,
        detail: preview.control.idle.detail,
        parts: targetParts
      ),
      latestCompletedToday: completed ? completedSession : nil,
      completedToday: completed ? [completedSession] : [],
      dailyCompleted: daily,
      recentCompleted: routineItems.compactMap(\.latestCompleted),
      dailyDetails: dailyDetails,
      bodyPartDurations: preview.bodyPartDuration.map {
        LoofitBodyPartDurationSnapshot(
          bodyPartName: $0.bodyPart,
          durationSeconds: $0.durationSeconds
        )
      },
      routineProgress: LoofitRoutineProgressSnapshot(
        currentRoutineDayId: Int64(preview.routineProgress.currentIndex + 1),
        items: routineItems
      ),
      surfaceHashes: [:]
    )
  }

  private func theme(_ palette: PreviewPalette) -> LoofitWidgetTheme {
    LoofitWidgetTheme(
      accent: palette.accent,
      accentText: palette.onAccent,
      background: palette.surface,
      labelColor: palette.textLow,
      brandColor: palette.textLow,
      titleColor: palette.textHigh,
      detailColor: palette.textLow,
      secondaryButtonBackground: palette.raisedSurface,
      secondaryButtonText: palette.textHigh,
      heatmapBackground: palette.surface,
      heatmapTitleColor: palette.textMedium,
      heatmapBrandColor: palette.textLow,
      heatmapFooterValueColor: palette.textMedium,
      heatmapWeekdayLabelColor: palette.textLow,
      heatmapWeekendLabelColor: palette.textWeekend,
      heatmapDayLabelColor: palette.textLow,
      heatmapBaseColor: palette.heatmapBase,
      heatmapEmptyColor: palette.heatmapEmpty,
      heatmapGapColor: "#00000000",
      todayIndicatorColor: palette.todayIndicator
    )
  }

  private func session(
    id: Int64,
    routineDayId: Int64,
    title: String,
    detail: String,
    startedAt: Date,
    durationSeconds: Int,
    parts: [LoofitWorkoutPartSnapshot]
  ) -> LoofitWorkoutSessionSnapshot {
    LoofitWorkoutSessionSnapshot(
      id: id,
      routineId: 1,
      routineDayId: routineDayId,
      title: title,
      detail: detail,
      startedAt: isoString(startedAt),
      endedAt: isoString(startedAt.addingTimeInterval(TimeInterval(durationSeconds))),
      durationSeconds: durationSeconds,
      parts: parts
    )
  }

  private func parts(_ value: String, firstId: Int64) -> [LoofitWorkoutPartSnapshot] {
    value
      .components(separatedBy: "·")
      .map { $0.trimmingCharacters(in: .whitespacesAndNewlines) }
      .filter { !$0.isEmpty }
      .enumerated()
      .map { index, name in
        LoofitWorkoutPartSnapshot(
          id: firstId + Int64(index),
          name: name,
          color: "#CFF56A",
          sortOrder: index
        )
      }
  }

  private func parseDuration(_ value: String) -> Int {
    let hours = captureInteger(in: value, pattern: #"(\d+)시간"#)
    let minutes = captureInteger(in: value, pattern: #"(\d+)분"#)
    let seconds = captureInteger(in: value, pattern: #"(\d+)초"#)
    return hours * 3_600 + minutes * 60 + seconds
  }

  private func captureInteger(in value: String, pattern: String) -> Int {
    guard let expression = try? NSRegularExpression(pattern: pattern),
          let match = expression.firstMatch(
            in: value,
            range: NSRange(value.startIndex..., in: value)
          ),
          let range = Range(match.range(at: 1), in: value) else {
      return 0
    }
    return Int(value[range]) ?? 0
  }

  private func relativeDayOffset(_ value: String) -> Int {
    if value == "오늘" { return 0 }
    if value == "어제" { return 1 }
    return captureInteger(in: value, pattern: #"(\d+)일 전"#)
  }

  private func date(
    year: Int,
    month: Int,
    day: Int,
    hour: Int = 10,
    minute: Int = 0,
    second: Int = 0
  ) -> Date {
    calendar.date(from: DateComponents(
      timeZone: calendar.timeZone,
      year: year,
      month: month,
      day: day,
      hour: hour,
      minute: minute,
      second: second
    ))!
  }

  private func dateKey(_ date: Date) -> String {
    let formatter = DateFormatter()
    formatter.calendar = calendar
    formatter.timeZone = calendar.timeZone
    formatter.locale = Locale(identifier: "en_US_POSIX")
    formatter.dateFormat = "yyyy-MM-dd"
    return formatter.string(from: date)
  }

  private func isoString(_ date: Date) -> String {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime]
    return formatter.string(from: date)
  }

  private static let expectedVisualHashes: [String: String] = [
    "dark_body_part_duration": "56c20ee7753b96f9688e463680b07869de518f3e593ac604871014e7ebb77472",
    "dark_control": "8649af95788eb8ae65ee6d1830895c5481dbcdc549c7c3d6f0c345b17b5600a3",
    "dark_control_completed": "cd7004b5362e7d9d01350a969a90e665043cb8eaf8e58c83848eccd85b4043a5",
    "dark_current_month": "eae8a63f1a39035e8ae327d2162144cb3a95463eadc78f968a7c4904f2828dce",
    "dark_four_week_expanded": "de3094b6f2485e63a0ff37f50c2df21ff287cf835965609518f0c5318051cddc",
    "dark_heatmap_month": "5f3c5d0daeb696d9ba4799cc1d3e3afe2d481732c7d9d5c0284dbc659d117003",
    "dark_heatmap_six_months": "a5c85c3f9365689964af42695c144226920d926fbe6fe9dd0e87a8c2ba294992",
    "dark_heatmap_week": "322ba599387262dd3ec1c20b3926d65b1db604d0d9844d4d71977faec3ae5626",
    "dark_lock_next_three_week": "050d30319510228dc97034ae0378e2d7f83e05ff07623bdeea05a510ddd1a817",
    "dark_lock_routine_progress": "bafb767cf7929288f14d7a1ba054aabdec923926da274ce44e45e4877b1ecb45",
    "dark_lock_three_week": "a76dc2e28872a02bd9a5b6250a0f11e4402ba415aadf5e4e953149bc43e1d8f3",
    "dark_lock_workout": "215013e3c9b50e97730619dfe6224c8a6af8dfeb4e480006f3e25f36111d6e20",
    "dark_lock_workout_completed": "affd4e7ecbb6285fe2baa0b30a5f3cb80f8a68fead3ecff7e3166f8a10e86fec",
    "dark_routine_progress": "ef300e3acccf2a9d867e1d05de295d3fa8662149d002428cad7f1a0219eae543",
    "light_body_part_duration": "c95a3c568e1e48c9abe5f92e4ed3d1093964c929a456b9448027193158151d29",
    "light_control": "65716b2cc9fced7039c223ba48e153cfde63e28948d14e51bf7a4f16a581ad54",
    "light_current_month": "1cd3ff717d367ab4fd824ec8c04c74395eac255b3737957e5c2049ae768ae294",
    "light_four_week_expanded": "f717ae85f29fe5b020f1e807a76fe206d912600e2b545362d59167be71f06377",
    "light_heatmap_month": "5e2de48aa029d4b85873ae78d336c8dd8662c547e1a2f8076b2d05f3dd8530e6",
    "light_heatmap_six_months": "244b36f1ce24ce56c8d17b9ab40e8edab9e98c9cfea971691fe4a875f03ccf74",
    "light_heatmap_week": "0a4413275cac05168c962231f2fc5ad25831700ff1b69698f5fa76c055ed0566",
    "light_lock_next_three_week": "c3cbca50ac80714ea7f85f2f0c9b1e78c8f22f87ca6ce328eff96d31cbb163b8",
    "light_lock_routine_progress": "8d2f8e0a50f3a1c98293955f25ab9a4050323d4cb4bfa3c7141ea487bdcb6525",
    "light_lock_three_week": "2ab6afb34d25623ca6758625ee412ac5fd473a666e487b2c76eafd52f502394f",
    "light_lock_workout": "5e6c144a29e356136aef88c949e0182f4b2d6c99347cdc1e71d9c26f7398cbc8",
    "light_routine_progress": "e6bdf7ebc4502c4359cabd2bbca2324714ef2c1ebac0e6eeee905c5eb4a0fd15",
  ]
}

private struct VisualDefinition {
  let name: String
  let size: CGSize
  let isAccessory: Bool
  let makeView: (LoofitWidgetEntry) -> AnyView

  init(
    name: String,
    size: CGSize,
    isAccessory: Bool = false,
    makeView: @escaping (LoofitWidgetEntry) -> AnyView
  ) {
    self.name = name
    self.size = size
    self.isAccessory = isAccessory
    self.makeView = makeView
  }
}

private enum VisualTestError: Error {
  case couldNotCreateBitmapContext
  case couldNotEncodePNG
}

private struct PreviewData {
  let palette: PreviewPalettes
  let fixture: PreviewFixture

  static func load() throws -> PreviewData {
    let decoder = JSONDecoder()
    return PreviewData(
      palette: try decoder.decode(
        PreviewPalettes.self,
        from: Data(LoofitWidgetRendererContract.PreviewData.paletteJSON.utf8)
      ),
      fixture: try decoder.decode(
        PreviewFixture.self,
        from: Data(LoofitWidgetRendererContract.PreviewData.fixtureJSON.utf8)
      )
    )
  }
}

private struct PreviewPalettes: Decodable {
  let light: PreviewPalette
  let dark: PreviewPalette
}

private struct PreviewPalette: Decodable {
  let surface: String
  let raisedSurface: String
  let textHigh: String
  let textMedium: String
  let textLow: String
  let textWeekend: String
  let accent: String
  let onAccent: String
  let heatmapBase: String
  let heatmapEmpty: String
  let todayIndicator: String
}

private struct PreviewFixture: Decodable {
  let control: Control
  let routineProgress: RoutineProgress
  let bodyPartDuration: [BodyPartDuration]
  let heatmap: Heatmap

  struct Control: Decodable {
    let idle: State
    let completed: State

    struct State: Decodable {
      let title: String
      let detail: String
      let duration: String?

      init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        title = try container.decode(String.self, forKey: .title)
        detail = try container.decode(String.self, forKey: .detail)
        duration = try container.decodeIfPresent(String.self, forKey: .duration)
      }

      private enum CodingKeys: String, CodingKey {
        case title
        case detail
        case duration
      }
    }
  }

  struct RoutineProgress: Decodable {
    let currentIndex: Int
    let items: [Item]

    struct Item: Decodable {
      let split: String
      let bodyParts: String
      let duration: String
      let relativeDay: String
    }
  }

  struct BodyPartDuration: Decodable {
    let bodyPart: String
    let durationSeconds: Int
  }

  struct Heatmap: Decodable {
    let anchorDate: String
    let durationPatternSeconds: [Int]
  }
}
