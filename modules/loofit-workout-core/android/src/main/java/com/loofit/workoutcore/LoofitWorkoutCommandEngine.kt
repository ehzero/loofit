package com.loofit.workoutcore

private data class LoofitActiveSessionRecord(
  val id: Long,
  val routineId: Long?,
  val routineDayId: Long?,
  val routineDayNameSnapshot: String?,
  val startedAt: String,
)

internal object LoofitWorkoutCommandEngine {
  fun execute(
    command: LoofitWorkoutCommand,
    database: LoofitSQLite,
  ): LoofitWorkoutMutationOutcome = database.withImmediateTransaction {
    when (command) {
      LoofitWorkoutCommand.StartNext -> startNext(database)
      is LoofitWorkoutCommand.StartRoutine -> startRoutine(command.routineDayId, database)
      is LoofitWorkoutCommand.ChangeParts -> changeParts(
        expectedSessionId = command.expectedSessionId,
        bodyPartIds = command.bodyPartIds,
        updateRoutine = command.updateRoutine,
        database = database,
      )
      is LoofitWorkoutCommand.Complete -> finish(
        expectedSessionId = command.expectedSessionId,
        status = "completed",
        database = database,
      )
      is LoofitWorkoutCommand.Cancel -> finish(
        expectedSessionId = command.expectedSessionId,
        status = "canceled",
        database = database,
      )
    }
  }

  private fun startNext(database: LoofitSQLite): LoofitWorkoutMutationOutcome {
    activeSession(database)?.let {
      return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.NOOP, it.id)
    }
    val target = nextRoutineTarget(database)
      ?: return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.REJECTED, null)
    return insertSession(target, database)
  }

  private fun startRoutine(
    routineDayId: Long,
    database: LoofitSQLite,
  ): LoofitWorkoutMutationOutcome {
    activeSession(database)?.let {
      return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.NOOP, it.id)
    }
    val target = routineTarget(routineDayId, database)
      ?: return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.REJECTED, null)
    return insertSession(target, database)
  }

  private fun changeParts(
    expectedSessionId: Long,
    bodyPartIds: List<Long>,
    updateRoutine: Boolean,
    database: LoofitSQLite,
  ): LoofitWorkoutMutationOutcome {
    val active = activeSession(database)
      ?: return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.STALE, null)
    if (active.id != expectedSessionId) {
      return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.STALE, active.id)
    }
    val parts = bodyParts(bodyPartIds, database)
    if (parts.isEmpty()) {
      return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.REJECTED, active.id)
    }
    val routineId = active.routineId
      ?: return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.REJECTED, active.id)
    val routineDayId = active.routineDayId
      ?: return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.REJECTED, active.id)
    val alias = activeRoutineDayAlias(routineDayId, database)
      ?: return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.REJECTED, active.id)

    if (updateRoutine) replaceRoutineDayParts(routineDayId, parts, database)
    replaceTarget(
      activeSessionId = active.id,
      routineId = routineId,
      routineDayId = routineDayId,
      routineDayNameSnapshot = workoutTitle(alias, parts),
      parts = parts,
      database = database,
    )
    return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.APPLIED, active.id)
  }

  private fun finish(
    expectedSessionId: Long,
    status: String,
    database: LoofitSQLite,
  ): LoofitWorkoutMutationOutcome {
    val active = activeSession(database)
    if (active == null) {
      val priorStatus = database.firstString(
        "SELECT status FROM workout_sessions WHERE id = ? LIMIT 1",
        listOf(expectedSessionId),
      )
      val resultStatus = if (priorStatus == "completed" || priorStatus == "canceled") {
        LoofitWorkoutCommandStatus.NOOP
      } else {
        LoofitWorkoutCommandStatus.STALE
      }
      return LoofitWorkoutMutationOutcome(resultStatus, null)
    }
    if (active.id != expectedSessionId) {
      return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.STALE, active.id)
    }
    val completedDayId = if (status == "completed") {
      active.routineDayId
        ?: return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.REJECTED, active.id)
    } else {
      null
    }
    val now = LoofitWorkoutDate.nowIso8601()
    val changed = database.executeUpdate(
      """
      UPDATE workout_sessions
      SET status = ?, ended_at = ?, duration_seconds = ?, updated_at = ?
      WHERE id = ? AND status = 'active'
      """.trimIndent(),
      listOf(status, now, LoofitWorkoutDate.elapsedSeconds(active.startedAt), now, active.id),
    )
    if (changed != 1) {
      return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.STALE, active.id)
    }
    if (completedDayId != null) advanceRoutineProgress(completedDayId, database)
    return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.APPLIED, active.id)
  }

  private fun advanceRoutineProgress(completedDayId: Long, database: LoofitSQLite) {
    val activeRoutineId = database.firstLong(
      "SELECT id FROM routines WHERE is_active = 1 ORDER BY id DESC LIMIT 1",
    )
    val now = LoofitWorkoutDate.nowIso8601()
    if (activeRoutineId == null) {
      database.executeUpdate(
        """
        INSERT INTO routine_progress (id, active_routine_id, next_routine_day_id, updated_at)
        VALUES (1, NULL, NULL, ?)
        ON CONFLICT(id) DO UPDATE SET active_routine_id = NULL,
          next_routine_day_id = NULL, updated_at = excluded.updated_at
        """.trimIndent(),
        listOf(now),
      )
      return
    }
    val dayIds = mutableListOf<Long>()
    database.query(
      "SELECT id FROM routine_days WHERE routine_id = ? ORDER BY sort_order ASC, id ASC",
      listOf(activeRoutineId),
    ) { cursor -> dayIds += cursor.getLong(0) }
    val index = dayIds.indexOf(completedDayId)
    val nextDayId = when {
      dayIds.isEmpty() -> null
      index >= 0 -> dayIds[(index + 1) % dayIds.size]
      else -> dayIds.first()
    }
    database.executeUpdate(
      """
      INSERT INTO routine_progress (id, active_routine_id, next_routine_day_id, updated_at)
      VALUES (1, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET active_routine_id = excluded.active_routine_id,
        next_routine_day_id = excluded.next_routine_day_id,
        updated_at = excluded.updated_at
      """.trimIndent(),
      listOf(activeRoutineId, nextDayId, now),
    )
  }

  private fun insertSession(
    target: LoofitWorkoutTargetSnapshot,
    database: LoofitSQLite,
  ): LoofitWorkoutMutationOutcome {
    val now = LoofitWorkoutDate.nowIso8601()
    val sessionId = database.executeInsert(
      """
      INSERT INTO workout_sessions
        (routine_id, routine_day_id, routine_day_name_snapshot, started_at, ended_at,
         duration_seconds, status, note, created_at, updated_at)
      VALUES (?, ?, ?, ?, NULL, 0, 'active', NULL, ?, ?)
      """.trimIndent(),
      listOf(target.routineId, target.routineDayId, target.title, now, now, now),
    )
    insertParts(target.parts, sessionId, database)
    return LoofitWorkoutMutationOutcome(LoofitWorkoutCommandStatus.APPLIED, sessionId)
  }

  private fun replaceTarget(
    activeSessionId: Long,
    routineId: Long,
    routineDayId: Long,
    routineDayNameSnapshot: String,
    parts: List<LoofitWorkoutPartSnapshot>,
    database: LoofitSQLite,
  ) {
    database.executeUpdate(
      """
      UPDATE workout_sessions
      SET routine_id = ?, routine_day_id = ?, routine_day_name_snapshot = ?, updated_at = ?
      WHERE id = ? AND status = 'active'
      """.trimIndent(),
      listOf(routineId, routineDayId, routineDayNameSnapshot, LoofitWorkoutDate.nowIso8601(), activeSessionId),
    )
    database.executeUpdate(
      "DELETE FROM workout_session_parts_snapshot WHERE workout_session_id = ?",
      listOf(activeSessionId),
    )
    insertParts(parts, activeSessionId, database)
  }

  private fun insertParts(
    parts: List<LoofitWorkoutPartSnapshot>,
    sessionId: Long,
    database: LoofitSQLite,
  ) {
    parts.forEachIndexed { index, part ->
      database.executeInsert(
        """
        INSERT INTO workout_session_parts_snapshot
          (workout_session_id, body_part_id, body_part_name, body_part_color, sort_order)
        VALUES (?, ?, ?, ?, ?)
        """.trimIndent(),
        listOf(sessionId, part.id, part.name, part.color, index),
      )
    }
  }

  private fun activeSession(database: LoofitSQLite): LoofitActiveSessionRecord? {
    var result: LoofitActiveSessionRecord? = null
    database.query(
      """
      SELECT id, routine_id, routine_day_id, routine_day_name_snapshot, started_at
      FROM workout_sessions WHERE status = 'active'
      ORDER BY started_at DESC, id DESC LIMIT 1
      """.trimIndent(),
    ) { cursor ->
      result = LoofitActiveSessionRecord(
        id = cursor.getLong(0),
        routineId = cursor.optionalLong(1),
        routineDayId = cursor.optionalLong(2),
        routineDayNameSnapshot = cursor.optionalString(3),
        startedAt = cursor.getString(4) ?: "",
      )
    }
    return result
  }

  private fun nextRoutineTarget(database: LoofitSQLite): LoofitWorkoutTargetSnapshot? {
    var selectedDayId: Long? = null
    var routineId = 0L
    var alias = ""
    val parts = mutableListOf<LoofitWorkoutPartSnapshot>()
    database.query(
      """
      SELECT rd.id, rd.routine_id, rd.name,
             bp.id, bp.name, bp.color, rdp.sort_order
      FROM routines r
      JOIN routine_days rd ON rd.routine_id = r.id
      LEFT JOIN routine_day_parts rdp ON rdp.routine_day_id = rd.id
      LEFT JOIN body_parts bp ON bp.id = rdp.body_part_id AND bp.is_archived = 0
      WHERE r.is_active = 1
      ORDER BY CASE WHEN rd.id = (
        SELECT next_routine_day_id FROM routine_progress WHERE id = 1
      ) THEN 0 ELSE 1 END, rd.sort_order ASC, rd.id ASC, rdp.sort_order ASC
      """.trimIndent(),
    ) { cursor ->
      val rowDayId = cursor.getLong(0)
      if (selectedDayId == null) {
        selectedDayId = rowDayId
        routineId = cursor.getLong(1)
        alias = cursor.optionalString(2) ?: ""
      }
      if (selectedDayId != rowDayId || cursor.isNull(4) || cursor.isNull(5)) return@query
      parts += LoofitWorkoutPartSnapshot(
        id = cursor.optionalLong(3),
        name = cursor.getString(4),
        color = cursor.getString(5),
        sortOrder = cursor.getInt(6),
      )
    }
    val dayId = selectedDayId ?: return null
    if (parts.isEmpty()) return null
    return makeTarget(routineId, dayId, alias, parts)
  }

  private fun routineTarget(id: Long, database: LoofitSQLite): LoofitWorkoutTargetSnapshot? {
    var routineId: Long? = null
    var alias = ""
    val parts = mutableListOf<LoofitWorkoutPartSnapshot>()
    database.query(
      """
      SELECT rd.routine_id, rd.name, bp.id, bp.name, bp.color, rdp.sort_order
      FROM routine_days rd
      JOIN routines r ON r.id = rd.routine_id AND r.is_active = 1
      LEFT JOIN routine_day_parts rdp ON rdp.routine_day_id = rd.id
      LEFT JOIN body_parts bp ON bp.id = rdp.body_part_id AND bp.is_archived = 0
      WHERE rd.id = ? ORDER BY rdp.sort_order ASC
      """.trimIndent(),
      listOf(id),
    ) { cursor ->
      routineId = cursor.getLong(0)
      alias = cursor.optionalString(1) ?: ""
      if (cursor.isNull(3) || cursor.isNull(4)) return@query
      parts += LoofitWorkoutPartSnapshot(
        id = cursor.optionalLong(2),
        name = cursor.getString(3),
        color = cursor.getString(4),
        sortOrder = cursor.getInt(5),
      )
    }
    val resolvedRoutineId = routineId ?: return null
    if (parts.isEmpty()) return null
    return makeTarget(resolvedRoutineId, id, alias, parts)
  }

  private fun makeTarget(
    routineId: Long,
    dayId: Long,
    alias: String,
    parts: List<LoofitWorkoutPartSnapshot>,
  ): LoofitWorkoutTargetSnapshot {
    val partNames = parts.joinToString(" · ") { it.name }
    val trimmedAlias = alias.trim()
    return LoofitWorkoutTargetSnapshot(
      routineId = routineId,
      routineDayId = dayId,
      title = workoutTitle(alias, parts),
      detail = if (trimmedAlias.isBlank() || trimmedAlias == partNames) "" else partNames,
      parts = parts,
    )
  }

  private fun activeRoutineDayAlias(id: Long, database: LoofitSQLite): String? {
    var alias: String? = null
    var found = false
    database.query(
      """
      SELECT rd.name
      FROM routine_days rd
      JOIN routines r ON r.id = rd.routine_id AND r.is_active = 1
      WHERE rd.id = ? LIMIT 1
      """.trimIndent(),
      listOf(id),
    ) { cursor ->
      found = true
      alias = cursor.optionalString(0) ?: ""
    }
    return if (found) alias else null
  }

  private fun replaceRoutineDayParts(
    routineDayId: Long,
    parts: List<LoofitWorkoutPartSnapshot>,
    database: LoofitSQLite,
  ) {
    database.executeUpdate(
      "DELETE FROM routine_day_parts WHERE routine_day_id = ?",
      listOf(routineDayId),
    )
    parts.forEachIndexed { index, part ->
      val id = part.id ?: return@forEachIndexed
      database.executeInsert(
        """
        INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order)
        VALUES (?, ?, ?)
        """.trimIndent(),
        listOf(routineDayId, id, index),
      )
    }
    database.executeUpdate(
      "UPDATE routine_days SET updated_at = ? WHERE id = ?",
      listOf(LoofitWorkoutDate.nowIso8601(), routineDayId),
    )
  }

  private fun workoutTitle(
    alias: String,
    parts: List<LoofitWorkoutPartSnapshot>,
  ): String = alias.trim().ifBlank { parts.joinToString(" · ") { it.name } }

  private fun bodyParts(
    ids: List<Long>,
    database: LoofitSQLite,
  ): List<LoofitWorkoutPartSnapshot> {
    val uniqueIds = ids.distinct()
    if (uniqueIds.isEmpty()) return emptyList()
    val parts = mutableListOf<LoofitWorkoutPartSnapshot>()
    database.query(
      """
      SELECT id, name, color, sort_order FROM body_parts
      WHERE is_archived = 0 AND id IN (${uniqueIds.joinToString(",") { "?" }})
      ORDER BY sort_order ASC, id ASC
      """.trimIndent(),
      uniqueIds,
    ) { cursor ->
      parts += LoofitWorkoutPartSnapshot(
        id = cursor.getLong(0),
        name = cursor.getString(1) ?: "",
        color = cursor.getString(2) ?: "#6C757D",
        sortOrder = cursor.getInt(3),
      )
    }
    return parts
  }
}

private fun android.database.Cursor.optionalLong(index: Int): Long? =
  if (isNull(index)) null else getLong(index)

private fun android.database.Cursor.optionalString(index: Int): String? =
  if (isNull(index)) null else getString(index)
