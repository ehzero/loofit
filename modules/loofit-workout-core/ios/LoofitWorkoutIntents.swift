import AppIntents
import Foundation

public enum LoofitWorkoutIntentEnvironment {
  public static let appGroupInfoKey = "ExpoWidgetsAppGroupIdentifier"
  public static let widgetsEnabledInfoKey = "LoofitWidgetsEnabled"
  public static let widgetsDirectoryName = "LoofitWidgets"

  public static func widgetsAreConfigured(bundle: Bundle = .main) -> Bool {
    bundle.object(forInfoDictionaryKey: widgetsEnabledInfoKey) as? Bool ?? false
  }

  public static func databaseDirectory(bundle: Bundle = .main) -> String? {
    guard let identifier = bundle.object(
      forInfoDictionaryKey: appGroupInfoKey
    ) as? String,
      let groupDirectory = LoofitWorkoutPaths.appGroupDirectory(identifier: identifier)
    else {
      return nil
    }

    let directory = URL(fileURLWithPath: groupDirectory, isDirectory: true)
      .appendingPathComponent(widgetsDirectoryName, isDirectory: true)
    do {
      try FileManager.default.createDirectory(
        at: directory,
        withIntermediateDirectories: true
      )
      return LoofitWorkoutPaths.normalizeDatabaseDirectory(directory.path)
    } catch {
      return nil
    }
  }

  public static func requireDatabaseDirectory(bundle: Bundle = .main) throws -> String {
    guard let directory = databaseDirectory(bundle: bundle) else {
      throw LoofitWorkoutCoreError.configuration(
        "The widget-enabled build cannot access its App Group database directory. " +
          "Verify the ExpoWidgetsAppGroupIdentifier and App Group entitlement."
      )
    }
    return directory
  }
}

@available(iOS 17.0, *)
public struct LoofitStartNextWorkoutIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "운동 시작"
  public static var description = IntentDescription("사용자의 다음 운동을 시작합니다.")
  public static var isDiscoverable = false
  public static var openAppWhenRun = false

  public init() {}

  public func perform() async throws -> some IntentResult {
    let directory = try LoofitWorkoutIntentEnvironment.requireDatabaseDirectory()
    _ = try await LoofitWorkoutPipeline.execute(
      .startNext,
      databaseDirectory: directory,
      widgetsEnabled: true
    )
    return .result()
  }
}

@available(iOS 17.0, *)
public struct LoofitEndWorkoutIntent: LiveActivityIntent {
  public static var title: LocalizedStringResource = "운동 종료"
  public static var description = IntentDescription("현재 운동을 완료합니다.")
  public static var isDiscoverable = false
  public static var openAppWhenRun = false

  @Parameter(title: "Session ID")
  public var sessionId: String

  public init() {
    sessionId = ""
  }

  public init(sessionId: Int64) {
    self.sessionId = String(sessionId)
  }

  public func perform() async throws -> some IntentResult {
    guard let sessionId = Int64(sessionId), sessionId > 0 else {
      return .result()
    }
    let directory = try LoofitWorkoutIntentEnvironment.requireDatabaseDirectory()
    _ = try await LoofitWorkoutPipeline.execute(
      .complete(expectedSessionId: sessionId),
      databaseDirectory: directory,
      widgetsEnabled: true
    )
    return .result()
  }
}
