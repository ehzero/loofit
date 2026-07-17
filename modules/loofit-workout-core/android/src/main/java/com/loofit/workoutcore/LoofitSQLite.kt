package com.loofit.workoutcore

import android.content.Context
import android.database.Cursor
import android.database.sqlite.SQLiteDatabase
import android.database.sqlite.SQLiteStatement
import java.io.File

internal class LoofitSQLite private constructor(
  val database: SQLiteDatabase,
) : AutoCloseable {
  val lastInsertRowId: Long
    get() = firstLong("SELECT last_insert_rowid()") ?: 0

  fun <T> withImmediateTransaction(block: () -> T): T {
    database.beginTransactionNonExclusive()
    return try {
      val value = block()
      database.setTransactionSuccessful()
      value
    } finally {
      database.endTransaction()
    }
  }

  fun executeInsert(sql: String, arguments: List<Any?> = emptyList()): Long =
    database.compileStatement(sql).use { statement ->
      bind(statement, arguments)
      statement.executeInsert()
    }

  fun executeUpdate(sql: String, arguments: List<Any?> = emptyList()): Int =
    database.compileStatement(sql).use { statement ->
      bind(statement, arguments)
      statement.executeUpdateDelete()
    }

  fun query(
    sql: String,
    arguments: List<Any?> = emptyList(),
    block: (Cursor) -> Unit,
  ) {
    require(arguments.none { it == null }) { "SQLite query arguments cannot contain null." }
    database.rawQuery(sql, arguments.map { it.toString() }.toTypedArray()).use { cursor ->
      while (cursor.moveToNext()) {
        block(cursor)
      }
    }
  }

  fun firstLong(sql: String, arguments: List<Any?> = emptyList()): Long? {
    var value: Long? = null
    query(sql, arguments) { cursor ->
      if (value == null && !cursor.isNull(0)) value = cursor.getLong(0)
    }
    return value
  }

  fun firstString(sql: String, arguments: List<Any?> = emptyList()): String? {
    var value: String? = null
    query(sql, arguments) { cursor ->
      if (value == null && !cursor.isNull(0)) value = cursor.getString(0)
    }
    return value
  }

  fun revisions(): Pair<Long, Long> {
    var desired = 0L
    var published = 0L
    query(
      "SELECT desired_revision, published_revision FROM widget_sync_state WHERE id = 1 LIMIT 1",
    ) { cursor ->
      desired = cursor.getLong(0)
      published = cursor.getLong(1)
    }
    return desired to published
  }

  fun markPublished(revision: Long) {
    executeUpdate(
      """
      UPDATE widget_sync_state
      SET published_revision = ?, last_error = NULL, updated_at = ?
      WHERE id = 1 AND desired_revision = ?
      """.trimIndent(),
      listOf(revision, LoofitWorkoutDate.nowIso8601(), revision),
    )
  }

  fun markPublicationError(error: Throwable) {
    runCatching {
      executeUpdate(
        """
        UPDATE widget_sync_state
        SET last_error = ?, updated_at = ? WHERE id = 1
        """.trimIndent(),
        listOf(error.message?.take(1_000) ?: error.javaClass.simpleName, LoofitWorkoutDate.nowIso8601()),
      )
    }
  }

  override fun close() {
    database.close()
  }

  companion object {
    fun databaseFile(context: Context): File =
      File(File(context.filesDir, "SQLite"), LoofitWorkoutSchemaContract.databaseName)

    fun open(context: Context): LoofitSQLite {
      val file = databaseFile(context)
      file.parentFile?.mkdirs()
      val database = SQLiteDatabase.openDatabase(
        file.absolutePath,
        null,
        SQLiteDatabase.OPEN_READWRITE or SQLiteDatabase.CREATE_IF_NECESSARY,
      )
      database.rawQuery("PRAGMA busy_timeout = 500", null).close()
      database.enableWriteAheadLogging()
      val wrapper = LoofitSQLite(database)
      wrapper.migrateSchemaIfNeeded()
      return wrapper
    }

    private fun bind(statement: SQLiteStatement, values: List<Any?>) {
      for ((offset, value) in values.withIndex()) {
        val index = offset + 1
        when (value) {
          null -> statement.bindNull(index)
          is ByteArray -> statement.bindBlob(index, value)
          is Boolean -> statement.bindLong(index, if (value) 1 else 0)
          is Byte, is Short, is Int, is Long -> statement.bindLong(index, (value as Number).toLong())
          is Float, is Double -> statement.bindDouble(index, (value as Number).toDouble())
          else -> statement.bindString(index, value.toString())
        }
      }
    }
  }

  private fun migrateSchemaIfNeeded() {
    val currentVersion = database.version
    check(currentVersion <= LoofitWorkoutSchemaContract.currentVersion) {
      "Database schema version $currentVersion is newer than supported version ${LoofitWorkoutSchemaContract.currentVersion}."
    }
    if (currentVersion == LoofitWorkoutSchemaContract.currentVersion) return

    withImmediateTransaction {
      var appliedVersion = currentVersion
      for (migration in LoofitWorkoutSchemaContract.migrations) {
        if (migration.version <= appliedVersion) continue
        executeScript(migration.schemaSql)
        for (column in migration.columns) {
          if (!hasColumn(column.table, column.column)) {
            database.execSQL(
              "ALTER TABLE ${column.table} ADD COLUMN ${column.column} ${column.definition}",
            )
          }
        }
        executeScript(migration.postSchemaSql)
        migration.afterSql?.let(::executeScript)
        database.version = migration.version
        appliedVersion = migration.version
      }
    }
  }

  private fun hasColumn(table: String, column: String): Boolean {
    database.rawQuery("PRAGMA table_info($table)", null).use { cursor ->
      val nameIndex = cursor.getColumnIndexOrThrow("name")
      while (cursor.moveToNext()) {
        if (cursor.getString(nameIndex) == column) return true
      }
    }
    return false
  }

  private fun executeScript(source: String) {
    val statement = StringBuilder()
    var trigger = false
    for (line in source.lineSequence()) {
      if (line.isBlank() && statement.isEmpty()) continue
      statement.appendLine(line)
      val normalized = statement.toString().trimStart().uppercase()
      if (!trigger && normalized.startsWith("CREATE TRIGGER")) trigger = true
      val complete = if (trigger) line.trim().equals("END;", ignoreCase = true) else line.trimEnd().endsWith(';')
      if (complete) {
        database.execSQL(statement.toString().trim())
        statement.clear()
        trigger = false
      }
    }
    check(statement.toString().isBlank()) { "Incomplete generated SQLite statement" }
  }
}
