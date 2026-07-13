import ActivityKit
import Foundation

public enum LoofitWorkoutCommand: Sendable {
  case startNext
  case startRoutine(routineDayId: Int64)
  case startFree(bodyPartIds: [Int64], label: String?)
  case changeRoutine(expectedSessionId: Int64, routineDayId: Int64)
  case changeFree(expectedSessionId: Int64, bodyPartIds: [Int64])
  case complete(expectedSessionId: Int64)
  case cancel(expectedSessionId: Int64)
}

public enum LoofitWorkoutCommandStatus: String, Codable, Sendable {
  case applied
  case noop
  case stale
  case rejected
}

public enum LoofitWorkoutPublicationStatus: String, Codable, Sendable {
  case published
  case pending
  case skipped
}

public struct LoofitWorkoutCommandResult: Codable, Sendable {
  public let status: LoofitWorkoutCommandStatus
  public let sessionId: Int64?
  public let desiredRevision: Int64
  public let publishedRevision: Int64
  public let publicationStatus: LoofitWorkoutPublicationStatus
  public let publicationError: String?

  public init(
    status: LoofitWorkoutCommandStatus,
    sessionId: Int64?,
    desiredRevision: Int64,
    publishedRevision: Int64,
    publicationStatus: LoofitWorkoutPublicationStatus,
    publicationError: String? = nil
  ) {
    self.status = status
    self.sessionId = sessionId
    self.desiredRevision = desiredRevision
    self.publishedRevision = publishedRevision
    self.publicationStatus = publicationStatus
    self.publicationError = publicationError
  }
}

public struct LoofitWidgetTheme: Codable, Hashable, Sendable {
  public let brandName: String
  public let accent: String
  public let accentText: String
  public let background: String
  public let labelColor: String
  public let brandColor: String
  public let titleColor: String
  public let detailColor: String
  public let secondaryButtonBackground: String
  public let secondaryButtonText: String
  public let heatmapBackground: String
  public let heatmapTitleColor: String
  public let heatmapBrandColor: String
  public let heatmapFooterValueColor: String
  public let heatmapWeekdayLabelColor: String
  public let heatmapWeekendLabelColor: String
  public let heatmapDayLabelColor: String
  public let heatmapBaseColor: String
  public let heatmapEmptyColor: String
  public let heatmapGapColor: String

  public init(
    brandName: String = "루핏",
    accent: String = "#CFF56A",
    accentText: String = "#0B0B0B",
    background: String = "#141418",
    labelColor: String = "#8A8A90",
    brandColor: String = "#6B6B70",
    titleColor: String = "#F4F4F2",
    detailColor: String = "#8A8A90",
    secondaryButtonBackground: String = "#26262B",
    secondaryButtonText: String = "#F4F4F2",
    heatmapBackground: String = "#141418",
    heatmapTitleColor: String = "#8A8A90",
    heatmapBrandColor: String = "#6B6B70",
    heatmapFooterValueColor: String = "#D7D7D3",
    heatmapWeekdayLabelColor: String = "#6B6B70",
    heatmapWeekendLabelColor: String = "#C87A7A",
    heatmapDayLabelColor: String = "#9A9AA0",
    heatmapBaseColor: String = "#16161A",
    heatmapEmptyColor: String = "#1B1B1F",
    heatmapGapColor: String = "#00000000"
  ) {
    self.brandName = brandName
    self.accent = accent
    self.accentText = accentText
    self.background = background
    self.labelColor = labelColor
    self.brandColor = brandColor
    self.titleColor = titleColor
    self.detailColor = detailColor
    self.secondaryButtonBackground = secondaryButtonBackground
    self.secondaryButtonText = secondaryButtonText
    self.heatmapBackground = heatmapBackground
    self.heatmapTitleColor = heatmapTitleColor
    self.heatmapBrandColor = heatmapBrandColor
    self.heatmapFooterValueColor = heatmapFooterValueColor
    self.heatmapWeekdayLabelColor = heatmapWeekdayLabelColor
    self.heatmapWeekendLabelColor = heatmapWeekendLabelColor
    self.heatmapDayLabelColor = heatmapDayLabelColor
    self.heatmapBaseColor = heatmapBaseColor
    self.heatmapEmptyColor = heatmapEmptyColor
    self.heatmapGapColor = heatmapGapColor
  }

  public init(dictionary: [String: String]) {
    let fallback = LoofitWidgetTheme()
    func value(_ key: String, _ defaultValue: String) -> String {
      guard let candidate = dictionary[key]?.trimmingCharacters(in: .whitespacesAndNewlines),
            !candidate.isEmpty else {
        return defaultValue
      }
      return candidate
    }

    self.init(
      brandName: value("brandName", fallback.brandName),
      accent: value("accent", fallback.accent),
      accentText: value("accentText", fallback.accentText),
      background: value("background", fallback.background),
      labelColor: value("labelColor", fallback.labelColor),
      brandColor: value("brandColor", fallback.brandColor),
      titleColor: value("titleColor", fallback.titleColor),
      detailColor: value("detailColor", fallback.detailColor),
      secondaryButtonBackground: value(
        "secondaryButtonBackground",
        fallback.secondaryButtonBackground
      ),
      secondaryButtonText: value("secondaryButtonText", fallback.secondaryButtonText),
      heatmapBackground: value("heatmapBackground", fallback.heatmapBackground),
      heatmapTitleColor: value("heatmapTitleColor", fallback.heatmapTitleColor),
      heatmapBrandColor: value("heatmapBrandColor", fallback.heatmapBrandColor),
      heatmapFooterValueColor: value(
        "heatmapFooterValueColor",
        fallback.heatmapFooterValueColor
      ),
      heatmapWeekdayLabelColor: value(
        "heatmapWeekdayLabelColor",
        fallback.heatmapWeekdayLabelColor
      ),
      heatmapWeekendLabelColor: value(
        "heatmapWeekendLabelColor",
        fallback.heatmapWeekendLabelColor
      ),
      heatmapDayLabelColor: value("heatmapDayLabelColor", fallback.heatmapDayLabelColor),
      heatmapBaseColor: value("heatmapBaseColor", fallback.heatmapBaseColor),
      heatmapEmptyColor: value("heatmapEmptyColor", fallback.heatmapEmptyColor),
      heatmapGapColor: value("heatmapGapColor", fallback.heatmapGapColor)
    )
  }

  public var dictionary: [String: String] {
    [
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
    ]
  }
}

public struct LoofitWorkoutPartSnapshot: Codable, Hashable, Sendable {
  public let id: Int64?
  public let name: String
  public let color: String
  public let sortOrder: Int

  public init(id: Int64?, name: String, color: String, sortOrder: Int) {
    self.id = id
    self.name = name
    self.color = color
    self.sortOrder = sortOrder
  }
}

public struct LoofitWorkoutSessionSnapshot: Codable, Hashable, Sendable {
  public let id: Int64
  public let routineId: Int64?
  public let routineDayId: Int64?
  public let title: String
  public let detail: String
  public let startedAt: String
  public let endedAt: String?
  public let durationSeconds: Int
  public let parts: [LoofitWorkoutPartSnapshot]

  public init(
    id: Int64,
    routineId: Int64?,
    routineDayId: Int64?,
    title: String,
    detail: String,
    startedAt: String,
    endedAt: String?,
    durationSeconds: Int,
    parts: [LoofitWorkoutPartSnapshot]
  ) {
    self.id = id
    self.routineId = routineId
    self.routineDayId = routineDayId
    self.title = title
    self.detail = detail
    self.startedAt = startedAt
    self.endedAt = endedAt
    self.durationSeconds = durationSeconds
    self.parts = parts
  }

  public var startedDate: Date? { LoofitWorkoutDate.parseISO8601(startedAt) }
  public var endedDate: Date? { endedAt.flatMap(LoofitWorkoutDate.parseISO8601) }
}

public struct LoofitWorkoutTargetSnapshot: Codable, Hashable, Sendable {
  public let routineId: Int64
  public let routineDayId: Int64
  public let title: String
  public let detail: String
  public let parts: [LoofitWorkoutPartSnapshot]

  public init(
    routineId: Int64,
    routineDayId: Int64,
    title: String,
    detail: String,
    parts: [LoofitWorkoutPartSnapshot]
  ) {
    self.routineId = routineId
    self.routineDayId = routineDayId
    self.title = title
    self.detail = detail
    self.parts = parts
  }
}

public struct LoofitWorkoutDailyAggregate: Codable, Hashable, Sendable {
  public let dateKey: String
  public let workoutCount: Int
  public let durationSeconds: Int

  public init(dateKey: String, workoutCount: Int, durationSeconds: Int) {
    self.dateKey = dateKey
    self.workoutCount = workoutCount
    self.durationSeconds = durationSeconds
  }
}

public struct LoofitWorkoutSnapshot: Codable, Sendable {
  public let revision: Int64
  public let generatedAt: String
  public let timeZoneIdentifier: String
  public let theme: LoofitWidgetTheme
  public let activeSession: LoofitWorkoutSessionSnapshot?
  public let nextWorkout: LoofitWorkoutTargetSnapshot?
  public let latestCompletedToday: LoofitWorkoutSessionSnapshot?
  public let completedToday: [LoofitWorkoutSessionSnapshot]
  public let dailyCompleted: [LoofitWorkoutDailyAggregate]
  public let recentCompleted: [LoofitWorkoutSessionSnapshot]
  public let surfaceHashes: [String: String]

  public init(
    revision: Int64,
    generatedAt: String,
    timeZoneIdentifier: String = Calendar.autoupdatingCurrent.timeZone.identifier,
    theme: LoofitWidgetTheme,
    activeSession: LoofitWorkoutSessionSnapshot?,
    nextWorkout: LoofitWorkoutTargetSnapshot?,
    latestCompletedToday: LoofitWorkoutSessionSnapshot?,
    completedToday: [LoofitWorkoutSessionSnapshot],
    dailyCompleted: [LoofitWorkoutDailyAggregate],
    recentCompleted: [LoofitWorkoutSessionSnapshot],
    surfaceHashes: [String: String]
  ) {
    self.revision = revision
    self.generatedAt = generatedAt
    self.timeZoneIdentifier = timeZoneIdentifier
    self.theme = theme
    self.activeSession = activeSession
    self.nextWorkout = nextWorkout
    self.latestCompletedToday = latestCompletedToday
    self.completedToday = completedToday
    self.dailyCompleted = dailyCompleted
    self.recentCompleted = recentCompleted
    self.surfaceHashes = surfaceHashes
  }
}

public enum LoofitWidgetKinds {
  public static let control = "WorkoutControlWidget"
  public static let heatmapWeek = "HeatmapWeekWidget"
  public static let heatmapMonth = "HeatmapMonthWidget"
  public static let heatmapSixMonths = "HeatmapYearWidget"
  public static let lockScreenWorkout = "WorkoutLockScreenWidget"
  public static let lockScreenSummary = "WorkoutLockScreenSummaryWidget"
  public static let all = [
    control,
    heatmapWeek,
    heatmapMonth,
    heatmapSixMonths,
    lockScreenWorkout,
    lockScreenSummary,
  ]
}

public struct LoofitWorkoutActivityAttributes: ActivityAttributes {
  public struct ContentState: Codable, Hashable {
    public let title: String
    public let detail: String
    public let startedAt: String
    public let accent: String
    public let accentText: String
    public let background: String
    public let titleColor: String

    public init(
      title: String,
      detail: String,
      startedAt: String,
      accent: String,
      accentText: String,
      background: String,
      titleColor: String
    ) {
      self.title = title
      self.detail = detail
      self.startedAt = startedAt
      self.accent = accent
      self.accentText = accentText
      self.background = background
      self.titleColor = titleColor
    }
  }

  public let sessionId: Int64

  public init(sessionId: Int64) {
    self.sessionId = sessionId
  }
}

public enum LoofitWorkoutPaths {
  public static let databaseName: String = LoofitWorkoutSchemaContract.databaseName
  public static let snapshotName = "loofit-widget-snapshot.json"

  public static func normalizeDatabaseDirectory(_ value: String) -> String {
    if let url = URL(string: value), url.isFileURL {
      return url.path
    }
    return value
  }

  public static func appGroupDirectory(identifier: String) -> String? {
    FileManager.default.containerURL(
      forSecurityApplicationGroupIdentifier: identifier
    )?.path
  }

  public static func defaultDatabaseDirectory() throws -> String {
    let documents = try FileManager.default.url(
      for: .documentDirectory,
      in: .userDomainMask,
      appropriateFor: nil,
      create: true
    )
    let directory = documents.appendingPathComponent("SQLite", isDirectory: true)
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true
    )
    return directory.path
  }

  public static func databaseURL(in databaseDirectory: String) -> URL {
    URL(fileURLWithPath: normalizeDatabaseDirectory(databaseDirectory), isDirectory: true)
      .appendingPathComponent(databaseName, isDirectory: false)
  }

  public static func snapshotURL(in databaseDirectory: String) -> URL {
    URL(fileURLWithPath: normalizeDatabaseDirectory(databaseDirectory), isDirectory: true)
      .appendingPathComponent(snapshotName, isDirectory: false)
  }
}

public enum LoofitWorkoutSnapshotStore {
  public static let fileName = LoofitWorkoutPaths.snapshotName

  public static func snapshotURL(in databaseDirectory: String) -> URL {
    LoofitWorkoutPaths.snapshotURL(in: databaseDirectory)
  }

  public static func load(from databaseDirectory: String) throws -> LoofitWorkoutSnapshot? {
    let url = snapshotURL(in: databaseDirectory)
    guard FileManager.default.fileExists(atPath: url.path) else {
      return nil
    }
    return try JSONDecoder().decode(LoofitWorkoutSnapshot.self, from: Data(contentsOf: url))
  }

  static func save(_ snapshot: LoofitWorkoutSnapshot, to databaseDirectory: String) throws {
    let directory = URL(
      fileURLWithPath: LoofitWorkoutPaths.normalizeDatabaseDirectory(databaseDirectory),
      isDirectory: true
    )
    try FileManager.default.createDirectory(
      at: directory,
      withIntermediateDirectories: true
    )
    let encoder = JSONEncoder()
    encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
    try encoder.encode(snapshot).write(
      to: snapshotURL(in: databaseDirectory),
      options: [.atomic]
    )
  }
}

public enum LoofitWorkoutDate {
  private static let fractionalFormatter: ISO8601DateFormatter = {
    let formatter = ISO8601DateFormatter()
    formatter.formatOptions = [.withInternetDateTime, .withFractionalSeconds]
    return formatter
  }()

  private static let formatter = ISO8601DateFormatter()

  public static func nowISO8601(_ date: Date = Date()) -> String {
    fractionalFormatter.string(from: date)
  }

  public static func parseISO8601(_ value: String) -> Date? {
    fractionalFormatter.date(from: value) ?? formatter.date(from: value)
  }
}
