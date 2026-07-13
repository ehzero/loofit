import ExpoModulesCore
import Foundation
import LoofitWorkoutCore

private enum LoofitWorkoutExpoAdapterError: LocalizedError {
  case configuration(String)
  case invalidCommand(String)

  var errorDescription: String? {
    switch self {
    case .configuration(let message), .invalidCommand(let message):
      return message
    }
  }
}

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

    Constant("widgetsConfigured") {
      LoofitWorkoutIntentEnvironment.widgetsAreConfigured()
    }

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
    let widgetsConfigured = LoofitWorkoutIntentEnvironment.widgetsAreConfigured()
    guard widgetsConfigured == widgetsEnabled else {
      throw LoofitWorkoutExpoAdapterError.configuration(
        "The requested widget mode does not match the installed iOS build configuration."
      )
    }
    let databaseDirectory = try resolvedDirectory(
      directory,
      widgetsConfigured: widgetsConfigured
    )
    contextLock.lock()
    lastSurfaceContext = .init(
      databaseDirectory: databaseDirectory,
      widgetsEnabled: widgetsConfigured
    )
    contextLock.unlock()
    return databaseDirectory
  }

  private func surfaceContext() -> SurfaceContext? {
    contextLock.lock()
    defer { contextLock.unlock() }
    return lastSurfaceContext
  }

  private func resolvedDirectory(
    _ directory: String?,
    widgetsConfigured: Bool
  ) throws -> String {
    if widgetsConfigured {
      let appGroupDirectory = try LoofitWorkoutIntentEnvironment.requireDatabaseDirectory()
      if let value = directory?.trimmingCharacters(in: .whitespacesAndNewlines),
        !value.isEmpty,
        LoofitWorkoutPaths.normalizeDatabaseDirectory(value) != appGroupDirectory
      {
        throw LoofitWorkoutExpoAdapterError.configuration(
          "The requested database directory does not match the configured App Group directory."
        )
      }
      return appGroupDirectory
    }

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
        throw LoofitWorkoutExpoAdapterError.invalidCommand("startRoutine requires routineDayId")
      }
      return .startRoutine(routineDayId: routineDayId)
    case "startFree":
      return .startFree(bodyPartIds: bodyPartIds, label: label)
    case "changeRoutine":
      guard let expectedSessionId, let routineDayId else {
        throw LoofitWorkoutExpoAdapterError.invalidCommand(
          "changeRoutine requires expectedSessionId and routineDayId"
        )
      }
      return .changeRoutine(
        expectedSessionId: expectedSessionId,
        routineDayId: routineDayId
      )
    case "changeFree":
      guard let expectedSessionId else {
        throw LoofitWorkoutExpoAdapterError.invalidCommand("changeFree requires expectedSessionId")
      }
      return .changeFree(
        expectedSessionId: expectedSessionId,
        bodyPartIds: bodyPartIds
      )
    case "complete":
      guard let expectedSessionId else {
        throw LoofitWorkoutExpoAdapterError.invalidCommand("complete requires expectedSessionId")
      }
      return .complete(expectedSessionId: expectedSessionId)
    case "cancel":
      guard let expectedSessionId else {
        throw LoofitWorkoutExpoAdapterError.invalidCommand("cancel requires expectedSessionId")
      }
      return .cancel(expectedSessionId: expectedSessionId)
    default:
      throw LoofitWorkoutExpoAdapterError.invalidCommand("Unsupported workout command: \(type)")
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
  @Field var heatmapWeekendLabelColor: String = ""
  @Field var heatmapDayLabelColor: String = ""
  @Field var heatmapBaseColor: String = ""
  @Field var heatmapEmptyColor: String = ""
  @Field var heatmapGapColor: String = ""
  @Field var todayIndicatorColor: String = ""

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
      "heatmapWeekendLabelColor": heatmapWeekendLabelColor,
      "heatmapDayLabelColor": heatmapDayLabelColor,
      "heatmapBaseColor": heatmapBaseColor,
      "heatmapEmptyColor": heatmapEmptyColor,
      "heatmapGapColor": heatmapGapColor,
      "todayIndicatorColor": todayIndicatorColor,
    ])
  }
}

struct LoofitWorkoutCommandResultRecord: Record {
  @Field var status: String = LoofitWorkoutCommandStatus.rejected.rawValue
  @Field var sessionId: Int64?
  @Field var desiredRevision: Int64 = 0
  @Field var publishedRevision: Int64 = 0
  @Field var publicationStatus: String = LoofitWorkoutPublicationStatus.skipped.rawValue
  @Field var publicationError: String?

  init() {}

  init(_ result: LoofitWorkoutCommandResult) {
    status = result.status.rawValue
    sessionId = result.sessionId
    desiredRevision = result.desiredRevision
    publishedRevision = result.publishedRevision
    publicationStatus = result.publicationStatus.rawValue
    publicationError = result.publicationError
  }
}
