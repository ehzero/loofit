import Foundation
import SQLite3

enum LoofitWorkoutCoreError: LocalizedError {
  case configuration(String)
  case database(String)
  case invalidCommand(String)
  case projection(String)

  var errorDescription: String? {
    switch self {
    case .configuration(let message), .database(let message),
      .invalidCommand(let message), .projection(let message):
      return message
    }
  }
}

enum LoofitSQLiteValue {
  case integer(Int64)
  case text(String)
  case null
}

private let loofitSQLiteTransient = unsafeBitCast(
  OpaquePointer(bitPattern: -1),
  to: sqlite3_destructor_type.self
)

final class LoofitSQLiteDatabase {
  private(set) var pointer: OpaquePointer?

  init(databaseDirectory: String) throws {
    let normalizedDirectory = LoofitWorkoutPaths.normalizeDatabaseDirectory(databaseDirectory)
    let directoryURL = URL(fileURLWithPath: normalizedDirectory, isDirectory: true)
    try FileManager.default.createDirectory(
      at: directoryURL,
      withIntermediateDirectories: true
    )

    let databaseURL = LoofitWorkoutPaths.databaseURL(in: normalizedDirectory)
    var handle: OpaquePointer?
    let flags = SQLITE_OPEN_READWRITE | SQLITE_OPEN_CREATE | SQLITE_OPEN_FULLMUTEX
    let result = sqlite3_open_v2(databaseURL.path, &handle, flags, nil)
    guard result == SQLITE_OK, let handle else {
      if let handle {
        sqlite3_close(handle)
      }
      throw LoofitWorkoutCoreError.database(
        "SQLite open failed (\(result)): \(databaseURL.path)"
      )
    }
    pointer = handle
    sqlite3_extended_result_codes(handle, 1)
    sqlite3_busy_timeout(handle, 500)
  }

  deinit {
    if let pointer {
      sqlite3_close(pointer)
    }
  }

  func execute(_ sql: String) throws {
    guard let pointer else {
      throw LoofitWorkoutCoreError.database("SQLite connection is closed")
    }
    var message: UnsafeMutablePointer<CChar>?
    let result = sqlite3_exec(pointer, sql, nil, nil, &message)
    guard result == SQLITE_OK else {
      let detail = message.map { String(cString: $0) }
        ?? String(cString: sqlite3_errmsg(pointer))
      sqlite3_free(message)
      throw LoofitWorkoutCoreError.database("SQLite error \(result): \(detail)")
    }
  }

  @discardableResult
  func run(_ sql: String, _ values: [LoofitSQLiteValue] = []) throws -> Int32 {
    let statement = try prepare(sql, values)
    defer { sqlite3_finalize(statement) }
    let result = sqlite3_step(statement)
    guard result == SQLITE_DONE else {
      throw databaseError(code: result)
    }
    return sqlite3_changes(pointer)
  }

  func query(
    _ sql: String,
    _ values: [LoofitSQLiteValue] = [],
    row: (OpaquePointer) throws -> Void
  ) throws {
    let statement = try prepare(sql, values)
    defer { sqlite3_finalize(statement) }
    while true {
      let result = sqlite3_step(statement)
      switch result {
      case SQLITE_ROW:
        try row(statement)
      case SQLITE_DONE:
        return
      default:
        throw databaseError(code: result)
      }
    }
  }

  func firstInt64(_ sql: String, _ values: [LoofitSQLiteValue] = []) throws -> Int64? {
    var value: Int64?
    try query(sql, values) { statement in
      if value == nil, sqlite3_column_type(statement, 0) != SQLITE_NULL {
        value = sqlite3_column_int64(statement, 0)
      }
    }
    return value
  }

  func firstString(_ sql: String, _ values: [LoofitSQLiteValue] = []) throws -> String? {
    var value: String?
    try query(sql, values) { statement in
      if value == nil {
        value = Self.string(statement, 0)
      }
    }
    return value
  }

  var lastInsertRowId: Int64 {
    sqlite3_last_insert_rowid(pointer)
  }

  func withImmediateTransaction<T>(_ body: () throws -> T) throws -> T {
    try execute("BEGIN IMMEDIATE")
    do {
      let result = try body()
      try execute("COMMIT")
      return result
    } catch {
      try? execute("ROLLBACK")
      throw error
    }
  }

  func withReadTransaction<T>(_ body: () throws -> T) throws -> T {
    try execute("BEGIN DEFERRED")
    do {
      let result = try body()
      try execute("COMMIT")
      return result
    } catch {
      try? execute("ROLLBACK")
      throw error
    }
  }

  func migrateSchemaIfNeeded() throws {
    let databaseVersion = Int(try firstInt64("PRAGMA user_version") ?? 0)
    try validateSchemaVersion(databaseVersion)
    guard databaseVersion < LoofitWorkoutSchemaContract.currentVersion else {
      return
    }

    try withImmediateTransaction {
      let transactionVersion = Int(try firstInt64("PRAGMA user_version") ?? 0)
      try validateSchemaVersion(transactionVersion)
      guard transactionVersion < LoofitWorkoutSchemaContract.currentVersion else {
        return
      }

      var expectedVersion = transactionVersion + 1
      for migration in LoofitWorkoutSchemaContract.migrations
      where migration.version > transactionVersion {
        guard migration.version == expectedVersion else {
          throw LoofitWorkoutCoreError.database(
            "Missing schema migration for version \(expectedVersion)"
          )
        }
        if migration.schemaSQL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
          try execute(migration.schemaSQL)
        }
        try ensureSchemaMigrationColumns(migration)
        let postSchemaSQL = migration.postSchemaSQL
          .trimmingCharacters(in: .whitespacesAndNewlines)
        if postSchemaSQL.isEmpty == false {
          try execute(migration.postSchemaSQL)
        }
        try applySchemaMigrationAfterSQL(migration)
        try execute("PRAGMA user_version = \(migration.version)")
        expectedVersion += 1
      }

      guard expectedVersion == LoofitWorkoutSchemaContract.currentVersion + 1 else {
        throw LoofitWorkoutCoreError.database(
          "Missing schema migration for version \(expectedVersion)"
        )
      }
    }
  }

  private func validateSchemaVersion(_ version: Int) throws {
    guard version <= LoofitWorkoutSchemaContract.currentVersion else {
      throw LoofitWorkoutCoreError.database(
        "Database schema version \(version) is newer than supported version " +
          "\(LoofitWorkoutSchemaContract.currentVersion)"
      )
    }
  }

  private func ensureSchemaMigrationColumns(
    _ migration: LoofitWorkoutSchemaMigrationStep
  ) throws {
    for column in migration.columns {
      guard try tableExists(column.table) else {
        throw LoofitWorkoutCoreError.database(
          "Migration \(migration.id) requires missing table \(column.table)"
        )
      }
      if try columnExists(column.column, in: column.table) == false {
        try execute(
          "ALTER TABLE \(column.table) ADD COLUMN \(column.column) \(column.definition)"
        )
      }
    }
  }

  private func applySchemaMigrationAfterSQL(
    _ migration: LoofitWorkoutSchemaMigrationStep
  ) throws {
    if let afterSQL = migration.afterSQL,
       afterSQL.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty == false {
      try execute(afterSQL)
    }
  }

  func revisions() throws -> (desired: Int64, published: Int64) {
    var desired: Int64 = 0
    var published: Int64 = 0
    try query(
      "SELECT desired_revision, published_revision FROM \(LoofitWorkoutSchemaContract.widgetSyncStateTable) WHERE id = 1"
    ) { statement in
      desired = sqlite3_column_int64(statement, 0)
      published = sqlite3_column_int64(statement, 1)
    }
    return (desired, published)
  }

  func markPublished(revision: Int64) throws {
    try run(
      """
      UPDATE \(LoofitWorkoutSchemaContract.widgetSyncStateTable)
      SET published_revision = ?, last_error = NULL,
          updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = 1 AND desired_revision = ?
      """,
      [.integer(revision), .integer(revision)]
    )
  }

  func markPublicationError(_ error: Error) {
    let message = String(describing: error)
    _ = try? run(
      """
      UPDATE \(LoofitWorkoutSchemaContract.widgetSyncStateTable)
      SET last_error = ?, updated_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now')
      WHERE id = 1
      """,
      [.text(String(message.prefix(1_000)))]
    )
  }

  static func string(_ statement: OpaquePointer, _ index: Int32) -> String? {
    guard sqlite3_column_type(statement, index) != SQLITE_NULL,
          let value = sqlite3_column_text(statement, index) else {
      return nil
    }
    return String(cString: value)
  }

  static func optionalInt64(_ statement: OpaquePointer, _ index: Int32) -> Int64? {
    guard sqlite3_column_type(statement, index) != SQLITE_NULL else {
      return nil
    }
    return sqlite3_column_int64(statement, index)
  }

  private func tableExists(_ table: String) throws -> Bool {
    try firstInt64(
      "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ? LIMIT 1",
      [.text(table)]
    ) == 1
  }

  private func columnExists(_ column: String, in table: String) throws -> Bool {
    var exists = false
    try query("PRAGMA table_info(\(table))") { statement in
      if Self.string(statement, 1) == column {
        exists = true
      }
    }
    return exists
  }

  private func prepare(_ sql: String, _ values: [LoofitSQLiteValue]) throws -> OpaquePointer {
    guard let pointer else {
      throw LoofitWorkoutCoreError.database("SQLite connection is closed")
    }
    var statement: OpaquePointer?
    let result = sqlite3_prepare_v2(pointer, sql, -1, &statement, nil)
    guard result == SQLITE_OK, let statement else {
      throw databaseError(code: result)
    }
    do {
      for (offset, value) in values.enumerated() {
        let index = Int32(offset + 1)
        let bindResult: Int32
        switch value {
        case .integer(let integer):
          bindResult = sqlite3_bind_int64(statement, index, integer)
        case .text(let text):
          bindResult = sqlite3_bind_text(statement, index, text, -1, loofitSQLiteTransient)
        case .null:
          bindResult = sqlite3_bind_null(statement, index)
        }
        guard bindResult == SQLITE_OK else {
          throw databaseError(code: bindResult)
        }
      }
      return statement
    } catch {
      sqlite3_finalize(statement)
      throw error
    }
  }

  private func databaseError(code: Int32) -> Error {
    guard let pointer else {
      return LoofitWorkoutCoreError.database("SQLite error \(code)")
    }
    let extended = sqlite3_extended_errcode(pointer)
    return LoofitWorkoutCoreError.database(
      "SQLite error \(code)/\(extended): \(String(cString: sqlite3_errmsg(pointer)))"
    )
  }
}
