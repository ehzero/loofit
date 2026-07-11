import ExpoModulesCore
import Foundation

public final class LoofitWorkoutCoreModule: Module {
  private struct SurfaceContext: Sendable {
    let databaseDirectory: String
    let widgetsEnabled: Bool
  }

  private let contextLock = NSLock()
  private var lastSurfaceContext: SurfaceContext?
  private var timeZoneObserver: NSObjectProtocol?

  public func definition() -> ModuleDefinition {
    Name("LoofitWorkoutCore")

    Constant("widgetsDirectory") {
      LoofitWorkoutIntentEnvironment.databaseDirectory()
    }

    OnCreate {
      timeZoneObserver = NotificationCenter.default.addObserver(
        forName: .NSSystemTimeZoneDidChange,
        object: nil,
        queue: nil
      ) { [weak self] _ in
        guard let context = self?.surfaceContext() else { return }
        Task {
          _ = try? await LoofitWorkoutPipeline.reconcile(
            databaseDirectory: context.databaseDirectory,
            widgetsEnabled: context.widgetsEnabled
          )
        }
      }
    }

    OnDestroy {
      if let timeZoneObserver {
        NotificationCenter.default.removeObserver(timeZoneObserver)
      }
      timeZoneObserver = nil
    }

    AsyncFunction("executeWorkoutCommand") {
      (record: LoofitWorkoutCommandRecord, directory: String?, widgetsEnabled: Bool) async throws
        -> LoofitWorkoutCommandResultRecord in
      let databaseDirectory = try resolveAndRemember(directory, widgetsEnabled: widgetsEnabled)
      let result = try await LoofitWorkoutPipeline.execute(
        try record.command(),
        databaseDirectory: databaseDirectory,
        widgetsEnabled: widgetsEnabled
      )
      return LoofitWorkoutCommandResultRecord(result)
    }

    AsyncFunction("reconcileWorkoutSurfaces") {
      (directory: String?, widgetsEnabled: Bool) async throws -> LoofitWorkoutCommandResultRecord in
      let databaseDirectory = try resolveAndRemember(directory, widgetsEnabled: widgetsEnabled)
      let result = try await LoofitWorkoutPipeline.reconcile(
        databaseDirectory: databaseDirectory,
        widgetsEnabled: widgetsEnabled
      )
      return LoofitWorkoutCommandResultRecord(result)
    }

    AsyncFunction("updateWidgetThemeSnapshot") {
      (record: LoofitWidgetThemeRecord, directory: String?, widgetsEnabled: Bool) async throws
        -> LoofitWorkoutCommandResultRecord in
      let databaseDirectory = try resolveAndRemember(directory, widgetsEnabled: widgetsEnabled)
      let result = try await LoofitWorkoutPipeline.updateTheme(
        record.theme,
        databaseDirectory: databaseDirectory,
        widgetsEnabled: widgetsEnabled
      )
      return LoofitWorkoutCommandResultRecord(result)
    }
  }

  private func resolveAndRemember(_ directory: String?, widgetsEnabled: Bool) throws -> String {
    let databaseDirectory = try resolvedDirectory(directory)
    contextLock.lock()
    lastSurfaceContext = .init(
      databaseDirectory: databaseDirectory,
      widgetsEnabled: widgetsEnabled
    )
    contextLock.unlock()
    return databaseDirectory
  }

  private func surfaceContext() -> SurfaceContext? {
    contextLock.lock()
    defer { contextLock.unlock() }
    return lastSurfaceContext
  }

  private func resolvedDirectory(_ directory: String?) throws -> String {
    guard let value = directory?.trimmingCharacters(in: .whitespacesAndNewlines),
          !value.isEmpty else {
      return try LoofitWorkoutPaths.defaultDatabaseDirectory()
    }
    return LoofitWorkoutPaths.normalizeDatabaseDirectory(value)
  }
}

struct LoofitWorkoutCommandRecord: Record {
  @Field var type: String = ""
  @Field var routineDayId: Int64?
  @Field var expectedSessionId: Int64?
  @Field var bodyPartIds: [Int64] = []
  @Field var label: String?

  func command() throws -> LoofitWorkoutCommand {
    switch type {
    case "startNext":
      return .startNext
    case "startRoutine":
      guard let routineDayId else {
        throw LoofitWorkoutCoreError.invalidCommand("startRoutine requires routineDayId")
      }
      return .startRoutine(routineDayId: routineDayId)
    case "startFree":
      return .startFree(bodyPartIds: bodyPartIds, label: label)
    case "changeRoutine":
      guard let expectedSessionId, let routineDayId else {
        throw LoofitWorkoutCoreError.invalidCommand(
          "changeRoutine requires expectedSessionId and routineDayId"
        )
      }
      return .changeRoutine(
        expectedSessionId: expectedSessionId,
        routineDayId: routineDayId
      )
    case "changeFree":
      guard let expectedSessionId else {
        throw LoofitWorkoutCoreError.invalidCommand("changeFree requires expectedSessionId")
      }
      return .changeFree(
        expectedSessionId: expectedSessionId,
        bodyPartIds: bodyPartIds
      )
    case "complete":
      guard let expectedSessionId else {
        throw LoofitWorkoutCoreError.invalidCommand("complete requires expectedSessionId")
      }
      return .complete(expectedSessionId: expectedSessionId)
    case "cancel":
      guard let expectedSessionId else {
        throw LoofitWorkoutCoreError.invalidCommand("cancel requires expectedSessionId")
      }
      return .cancel(expectedSessionId: expectedSessionId)
    default:
      throw LoofitWorkoutCoreError.invalidCommand("Unsupported workout command: \(type)")
    }
  }
}

struct LoofitWidgetThemeRecord: Record {
  @Field var brandName: String = ""
  @Field var accent: String = ""
  @Field var accentText: String = ""
  @Field var background: String = ""
  @Field var labelColor: String = ""
  @Field var brandColor: String = ""
  @Field var titleColor: String = ""
  @Field var detailColor: String = ""
  @Field var secondaryButtonBackground: String = ""
  @Field var secondaryButtonText: String = ""
  @Field var heatmapBackground: String = ""
  @Field var heatmapTitleColor: String = ""
  @Field var heatmapBrandColor: String = ""
  @Field var heatmapFooterValueColor: String = ""
  @Field var heatmapWeekdayLabelColor: String = ""
  @Field var heatmapDayLabelColor: String = ""
  @Field var heatmapBaseColor: String = ""
  @Field var heatmapEmptyColor: String = ""
  @Field var heatmapGapColor: String = ""

  var theme: LoofitWidgetTheme {
    LoofitWidgetTheme(dictionary: [
      "brandName": brandName,
      "accent": accent,
      "accentText": accentText,
      "background": background,
      "labelColor": labelColor,
      "brandColor": brandColor,
      "titleColor": titleColor,
      "detailColor": detailColor,
      "secondaryButtonBackground": secondaryButtonBackground,
      "secondaryButtonText": secondaryButtonText,
      "heatmapBackground": heatmapBackground,
      "heatmapTitleColor": heatmapTitleColor,
      "heatmapBrandColor": heatmapBrandColor,
      "heatmapFooterValueColor": heatmapFooterValueColor,
      "heatmapWeekdayLabelColor": heatmapWeekdayLabelColor,
      "heatmapDayLabelColor": heatmapDayLabelColor,
      "heatmapBaseColor": heatmapBaseColor,
      "heatmapEmptyColor": heatmapEmptyColor,
      "heatmapGapColor": heatmapGapColor,
    ])
  }
}

struct LoofitWorkoutCommandResultRecord: Record {
  @Field var status: String = LoofitWorkoutCommandStatus.rejected.rawValue
  @Field var sessionId: Int64?
  @Field var desiredRevision: Int64 = 0
  @Field var publishedRevision: Int64 = 0

  init() {}

  init(_ result: LoofitWorkoutCommandResult) {
    status = result.status.rawValue
    sessionId = result.sessionId
    desiredRevision = result.desiredRevision
    publishedRevision = result.publishedRevision
  }
}
