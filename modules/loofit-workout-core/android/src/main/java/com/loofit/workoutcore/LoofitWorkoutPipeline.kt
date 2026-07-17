package com.loofit.workoutcore

import android.content.Context
import org.json.JSONObject

internal object LoofitWorkoutPipeline {
  private val lock = Any()

  fun execute(
    context: Context,
    command: LoofitWorkoutCommand,
    widgetsEnabled: Boolean,
  ): LoofitWorkoutCommandResult = synchronized(lock) {
    LoofitSQLite.open(context).use { database ->
      val outcome = LoofitWorkoutCommandEngine.execute(command, database)
      if (!widgetsEnabled) return@synchronized resultWithoutPublication(outcome, database)
      publish(context, outcome, database)
    }
  }

  fun reconcile(
    context: Context,
    widgetsEnabled: Boolean,
  ): LoofitWorkoutCommandResult = synchronized(lock) {
    LoofitSQLite.open(context).use { database ->
      val outcome = LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.NOOP, null)
      if (!widgetsEnabled) return@synchronized resultWithoutPublication(outcome, database)
      publish(context, outcome, database)
    }
  }

  fun updateTheme(
    context: Context,
    theme: LoofitWidgetTheme,
    widgetsEnabled: Boolean,
  ): LoofitWorkoutCommandResult = synchronized(lock) {
    LoofitSQLite.open(context).use { database ->
      val json = JSONObject(theme.dictionary()).toString()
      database.withImmediateTransaction {
        database.executeUpdate(
          """
          INSERT INTO app_settings (key, value, updated_at)
          VALUES ('widget_theme_snapshot', ?, ?)
          ON CONFLICT(key) DO UPDATE SET value = excluded.value,
            updated_at = excluded.updated_at
          """.trimIndent(),
          listOf(json, LoofitWorkoutDate.nowIso8601()),
        )
      }
      val outcome = LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.APPLIED, null)
      if (!widgetsEnabled) return@synchronized resultWithoutPublication(outcome, database)
      publish(context, outcome, database)
    }
  }

  private fun resultWithoutPublication(
    outcome: LoofitWorkoutMutationOutcome,
    database: LoofitSQLite,
  ): LoofitWorkoutCommandResult {
    val revisions = database.revisions()
    return LoofitWorkoutCommandResult(
      status = outcome.status,
      sessionId = outcome.sessionId,
      desiredRevision = revisions.first,
      publishedRevision = revisions.second,
      publicationStatus = LoofitWorkoutPublicationStatus.SKIPPED,
    )
  }

  private fun publish(
    context: Context,
    outcome: LoofitWorkoutMutationOutcome,
    database: LoofitSQLite,
  ): LoofitWorkoutCommandResult {
    val revisionsBefore = database.revisions()
    var resolvedSessionId = outcome.sessionId
    return try {
      val previous = LoofitWorkoutSnapshotStore.load(context)
      val snapshot = LoofitWorkoutProjection.makeSnapshot(database)
      LoofitWorkoutSnapshotStore.save(context, snapshot)
      LoofitAndroidSurfacePublisher.publish(context, previous, snapshot)
      resolvedSessionId = resolvedSessionId ?: snapshot.activeSession?.id
      database.markPublished(snapshot.revision)
      val revisions = database.revisions()
      if (revisions.first != revisions.second) {
        val error = "Workout surfaces changed while revision ${snapshot.revision} was being published."
        database.markPublicationError(IllegalStateException(error))
        LoofitWorkoutCommandResult(
          outcome.status,
          resolvedSessionId,
          revisions.first,
          revisions.second,
          LoofitWorkoutPublicationStatus.PENDING,
          error,
        )
      } else {
        LoofitWorkoutCommandResult(
          outcome.status,
          resolvedSessionId,
          revisions.first,
          revisions.second,
          LoofitWorkoutPublicationStatus.PUBLISHED,
        )
      }
    } catch (error: Throwable) {
      database.markPublicationError(error)
      val revisions = runCatching { database.revisions() }.getOrDefault(revisionsBefore)
      LoofitWorkoutCommandResult(
        outcome.status,
        resolvedSessionId,
        revisions.first,
        revisions.second,
        LoofitWorkoutPublicationStatus.PENDING,
        (error.message ?: error.javaClass.simpleName).take(1_000),
      )
    }
  }
}
