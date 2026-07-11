import ActivityKit
import Foundation
import os.log
import WidgetKit

public enum LoofitWorkoutPipeline {
  public static func execute(
    _ command: LoofitWorkoutCommand,
    databaseDirectory: String,
    widgetsEnabled: Bool
  ) async throws -> LoofitWorkoutCommandResult {
    try await LoofitWorkoutPipelineCoordinator.execute(
      command,
      databaseDirectory: databaseDirectory,
      widgetsEnabled: widgetsEnabled
    )
  }

  public static func reconcile(
    databaseDirectory: String,
    widgetsEnabled: Bool
  ) async throws -> LoofitWorkoutCommandResult {
    try await LoofitWorkoutPipelineCoordinator.reconcile(
      databaseDirectory: databaseDirectory,
      reloadWidgets: widgetsEnabled,
      updateLiveActivity: widgetsEnabled
    )
  }

  /// Used by WidgetKit when the system time zone changed while the app was not
  /// running. Reprojects local-day data and reloads widgets without attempting
  /// to create or change a Live Activity from a timeline-provider process.
  public static func reconcileWidgetTimeline(
    databaseDirectory: String
  ) async throws -> LoofitWorkoutCommandResult {
    try await LoofitWorkoutPipelineCoordinator.reconcile(
      databaseDirectory: databaseDirectory,
      reloadWidgets: true,
      updateLiveActivity: false
    )
  }

  public static func updateTheme(
    _ theme: LoofitWidgetTheme,
    databaseDirectory: String,
    widgetsEnabled: Bool
  ) async throws -> LoofitWorkoutCommandResult {
    try await LoofitWorkoutPipelineCoordinator.updateTheme(
      theme,
      databaseDirectory: databaseDirectory,
      widgetsEnabled: widgetsEnabled
    )
  }
}

private enum LoofitWorkoutPipelineCoordinator {
  static func execute(
    _ command: LoofitWorkoutCommand,
    databaseDirectory: String,
    widgetsEnabled: Bool
  ) async throws -> LoofitWorkoutCommandResult {
    try await LoofitWorkoutMetrics.measureAsync("Dispatch") {
      let directory = LoofitWorkoutPaths.normalizeDatabaseDirectory(databaseDirectory)
      let processLock = try await LoofitWorkoutProcessLock.acquire(databaseDirectory: directory)
      defer { processLock.unlock() }
      let database = try LoofitSQLiteDatabase(databaseDirectory: directory)
      try database.ensureWidgetSyncSchema()
      let outcome = try LoofitWorkoutMetrics.measure("DatabaseTransaction") {
        try LoofitWorkoutCommandEngine.execute(command, database: database)
      }
      guard widgetsEnabled else {
        return resultWithoutPublication(outcome: outcome, database: database)
      }
      return await publish(
        outcome: outcome,
        database: database,
        databaseDirectory: directory,
        reloadWidgets: true,
        updateLiveActivity: true
      )
    }
  }

  static func reconcile(
    databaseDirectory: String,
    reloadWidgets: Bool,
    updateLiveActivity: Bool
  ) async throws -> LoofitWorkoutCommandResult {
    try await LoofitWorkoutMetrics.measureAsync("Dispatch") {
      let directory = LoofitWorkoutPaths.normalizeDatabaseDirectory(databaseDirectory)
      let processLock = try await LoofitWorkoutProcessLock.acquire(databaseDirectory: directory)
      defer { processLock.unlock() }
      let database = try LoofitSQLiteDatabase(databaseDirectory: directory)
      try database.ensureWidgetSyncSchema()
      let outcome = LoofitWorkoutMutationOutcome(status: .noop, sessionId: nil)
      guard reloadWidgets || updateLiveActivity else {
        return resultWithoutPublication(outcome: outcome, database: database)
      }
      return await publish(
        outcome: outcome,
        database: database,
        databaseDirectory: directory,
        reloadWidgets: reloadWidgets,
        updateLiveActivity: updateLiveActivity
      )
    }
  }

  static func updateTheme(
    _ theme: LoofitWidgetTheme,
    databaseDirectory: String,
    widgetsEnabled: Bool
  ) async throws -> LoofitWorkoutCommandResult {
    try await LoofitWorkoutMetrics.measureAsync("Dispatch") {
      let directory = LoofitWorkoutPaths.normalizeDatabaseDirectory(databaseDirectory)
      let processLock = try await LoofitWorkoutProcessLock.acquire(databaseDirectory: directory)
      defer { processLock.unlock() }
      let database = try LoofitSQLiteDatabase(databaseDirectory: directory)
      try database.ensureWidgetSyncSchema()
      let encoder = JSONEncoder()
      encoder.outputFormatting = [.sortedKeys, .withoutEscapingSlashes]
      let data = try encoder.encode(theme.dictionary)
      guard let json = String(data: data, encoding: .utf8) else {
        throw LoofitWorkoutCoreError.projection("Widget theme could not be encoded")
      }
      _ = try LoofitWorkoutMetrics.measure("DatabaseTransaction") {
        try database.withImmediateTransaction {
          try database.run(
            """
            INSERT INTO app_settings (key, value, updated_at)
            VALUES ('widget_theme_snapshot', ?, ?)
            ON CONFLICT(key) DO UPDATE SET value = excluded.value,
              updated_at = excluded.updated_at
            """,
            [.text(json), .text(LoofitWorkoutDate.nowISO8601())]
          )
        }
      }
      let outcome = LoofitWorkoutMutationOutcome(status: .applied, sessionId: nil)
      guard widgetsEnabled else {
        return resultWithoutPublication(outcome: outcome, database: database)
      }
      return await publish(
        outcome: outcome,
        database: database,
        databaseDirectory: directory,
        reloadWidgets: true,
        updateLiveActivity: true
      )
    }
  }

  private static func resultWithoutPublication(
    outcome: LoofitWorkoutMutationOutcome,
    database: LoofitSQLiteDatabase
  ) -> LoofitWorkoutCommandResult {
    let revisions = (try? database.revisions()) ?? (desired: 0, published: 0)
    return .init(
      status: outcome.status,
      sessionId: outcome.sessionId,
      desiredRevision: revisions.desired,
      publishedRevision: revisions.published,
      publicationStatus: .skipped
    )
  }

  private static func publish(
    outcome: LoofitWorkoutMutationOutcome,
    database: LoofitSQLiteDatabase,
    databaseDirectory: String,
    reloadWidgets: Bool,
    updateLiveActivity: Bool
  ) async -> LoofitWorkoutCommandResult {
    let revisionsBeforePublication =
      (try? database.revisions()) ?? (desired: 0, published: 0)
    var resolvedSessionId = outcome.sessionId
    do {
      let previous = try? LoofitWorkoutSnapshotStore.load(from: databaseDirectory)
      let snapshot = try LoofitWorkoutMetrics.measure("Projection") {
        try LoofitWorkoutProjection.makeSnapshot(database: database)
      }
      try LoofitWorkoutMetrics.measure("SnapshotWrite") {
        try LoofitWorkoutSnapshotStore.save(snapshot, to: databaseDirectory)
      }
      if reloadWidgets {
        LoofitWorkoutMetrics.measure("WidgetReload") {
          reloadChangedWidgets(previous: previous, current: snapshot)
        }
      }
      if updateLiveActivity {
        try await LoofitWorkoutMetrics.measureAsync("ActivityKit") {
          try await reconcileLiveActivity(snapshot: snapshot)
        }
      }
      resolvedSessionId = outcome.sessionId ?? snapshot.activeSession?.id
      try database.markPublished(revision: snapshot.revision)
      let revisions = try database.revisions()
      guard revisions.desired == revisions.published else {
        let error = LoofitWorkoutCoreError.projection(
          "Workout surfaces changed while revision \(snapshot.revision) was being published"
        )
        database.markPublicationError(error)
        return .init(
          status: outcome.status,
          sessionId: resolvedSessionId,
          desiredRevision: revisions.desired,
          publishedRevision: revisions.published,
          publicationStatus: .pending,
          publicationError: publicationErrorMessage(error)
        )
      }
      return .init(
        status: outcome.status,
        sessionId: resolvedSessionId,
        desiredRevision: revisions.desired,
        publishedRevision: revisions.published,
        publicationStatus: .published
      )
    } catch {
      database.markPublicationError(error)
      let revisions = (try? database.revisions()) ?? revisionsBeforePublication
      return .init(
        status: outcome.status,
        sessionId: resolvedSessionId,
        desiredRevision: revisions.desired,
        publishedRevision: revisions.published,
        publicationStatus: .pending,
        publicationError: publicationErrorMessage(error)
      )
    }
  }

  private static func publicationErrorMessage(_ error: Error) -> String {
    String(error.localizedDescription.prefix(1_000))
  }

  private static func reloadChangedWidgets(
    previous: LoofitWorkoutSnapshot?,
    current: LoofitWorkoutSnapshot
  ) {
    if previous?.timeZoneIdentifier != current.timeZoneIdentifier {
      WidgetCenter.shared.reloadAllTimelines()
      return
    }
    for kind in LoofitWidgetKinds.all {
      if previous?.surfaceHashes[kind] != current.surfaceHashes[kind] {
        WidgetCenter.shared.reloadTimelines(ofKind: kind)
      }
    }
  }

  private static func reconcileLiveActivity(snapshot: LoofitWorkoutSnapshot) async throws {
    guard let active = snapshot.activeSession else {
      for activity in Activity<LoofitWorkoutActivityAttributes>.activities {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
      return
    }

    let state = LoofitWorkoutActivityAttributes.ContentState(
      title: active.title,
      detail: active.detail,
      startedAt: active.startedAt,
      accent: snapshot.theme.accent,
      accentText: snapshot.theme.accentText,
      background: snapshot.theme.background,
      titleColor: snapshot.theme.titleColor
    )
    var matching: Activity<LoofitWorkoutActivityAttributes>?
    for activity in Activity<LoofitWorkoutActivityAttributes>.activities {
      if activity.attributes.sessionId == active.id, matching == nil {
        matching = activity
      } else {
        await activity.end(nil, dismissalPolicy: .immediate)
      }
    }

    let content = ActivityContent(state: state, staleDate: nil)
    if let matching {
      await matching.update(content)
      return
    }
    guard ActivityAuthorizationInfo().areActivitiesEnabled else {
      return
    }
    _ = try Activity.request(
      attributes: LoofitWorkoutActivityAttributes(sessionId: active.id),
      content: content,
      pushType: nil
    )
  }
}

private enum LoofitWorkoutMetrics {
  private static let log = OSLog(
    subsystem: "com.loofit.app",
    category: .pointsOfInterest
  )

  static func measure<T>(_ name: StaticString, _ operation: () throws -> T) rethrows -> T {
    let id = OSSignpostID(log: log)
    os_signpost(.begin, log: log, name: name, signpostID: id)
    defer { os_signpost(.end, log: log, name: name, signpostID: id) }
    return try operation()
  }

  static func measureAsync<T>(
    _ name: StaticString,
    _ operation: () async throws -> T
  ) async rethrows -> T {
    let id = OSSignpostID(log: log)
    os_signpost(.begin, log: log, name: name, signpostID: id)
    defer { os_signpost(.end, log: log, name: name, signpostID: id) }
    return try await operation()
  }
}
