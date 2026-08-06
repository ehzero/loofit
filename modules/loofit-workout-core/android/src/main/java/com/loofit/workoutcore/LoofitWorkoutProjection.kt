package com.loofit.workoutcore

import android.database.Cursor
import org.json.JSONObject
import java.security.MessageDigest
import java.time.ZoneId
import java.util.LinkedHashMap

private data class AndroidSessionBuilder(
  val id: Long,
  val routineId: Long?,
  val routineDayId: Long?,
  val alias: String,
  val startedAt: String,
  val endedAt: String?,
  val durationSeconds: Int,
  val parts: MutableList<LoofitWorkoutPartSnapshot> = mutableListOf(),
) {
  fun snapshot(): LoofitWorkoutSessionSnapshot {
    val partNames = parts.joinToString(" · ") { it.name }
    val trimmedAlias = alias.trim()
    return LoofitWorkoutSessionSnapshot(
      id = id,
      routineId = routineId,
      routineDayId = routineDayId,
      title = trimmedAlias.ifBlank { partNames.ifBlank { "운동 기록" } },
      detail = if (trimmedAlias.isBlank() || trimmedAlias == partNames) "" else partNames,
      startedAt = startedAt,
      endedAt = endedAt,
      durationSeconds = durationSeconds,
      parts = parts.toList(),
    )
  }
}

private data class AndroidRoutineDayBuilder(
  val id: Long,
  val title: String,
  val parts: MutableList<LoofitWorkoutPartSnapshot> = mutableListOf(),
)

internal object LoofitWidgetKinds {
  const val CONTROL = LoofitWidgetLayoutContract.SurfaceKinds.CONTROL
  const val HEATMAP_WEEK = LoofitWidgetLayoutContract.SurfaceKinds.HEATMAP_WEEK
  const val HEATMAP_MONTH = LoofitWidgetLayoutContract.SurfaceKinds.HEATMAP_MONTH
  const val HEATMAP_SIX_MONTHS = LoofitWidgetLayoutContract.SurfaceKinds.HEATMAP_SIX_MONTHS
  const val CURRENT_MONTH = LoofitWidgetLayoutContract.SurfaceKinds.CURRENT_MONTH
  const val FOUR_WEEK_EXPANDED = LoofitWidgetLayoutContract.SurfaceKinds.FOUR_WEEK_EXPANDED
  const val ROUTINE_PROGRESS = LoofitWidgetLayoutContract.SurfaceKinds.ROUTINE_PROGRESS
  const val BODY_PART_DURATION = LoofitWidgetLayoutContract.SurfaceKinds.BODY_PART_DURATION
  const val LOCK_WORKOUT = LoofitWidgetLayoutContract.SurfaceKinds.LOCK_WORKOUT
  const val LOCK_THREE_WEEK = LoofitWidgetLayoutContract.SurfaceKinds.LOCK_THREE_WEEK
  const val LOCK_NEXT_THREE_WEEK = LoofitWidgetLayoutContract.SurfaceKinds.LOCK_NEXT_THREE_WEEK
  const val LOCK_ROUTINE_PROGRESS = LoofitWidgetLayoutContract.SurfaceKinds.LOCK_ROUTINE_PROGRESS

  val all = LoofitWidgetLayoutContract.SurfaceKinds.all
}

internal object LoofitWorkoutProjection {
  fun makeSnapshot(database: LoofitSQLite): LoofitWorkoutSnapshot = database.withImmediateTransaction {
    val zoneId = ZoneId.systemDefault()
    val theme = loadTheme(database)
    val active = loadSessions(database, "active", null).firstOrNull()
    val next = loadNextWorkout(database)
    val sixMonthStart = LoofitWorkoutDate.today(zoneId)
      .withDayOfMonth(1)
      .minusMonths((LoofitWidgetLayoutContract.Heatmap.sixMonthRangeMonths - 1).toLong())
      .atStartOfDay(zoneId)
      .toInstant()
      .toString()
    val completed = loadSessions(database, "completed", sixMonthStart)
    val todayKey = LoofitWorkoutDate.today(zoneId).toString()
    val completedToday = completed.filter {
      LoofitWorkoutDate.localDateKey(it.startedAt, zoneId) == todayKey
    }
    val daily = dailyAggregates(completed, zoneId)
    val details = dailyDetails(completed, zoneId)
    val durations = bodyPartDurations(completed, zoneId)
    val progress = loadRoutineProgress(database)
    val recent = completed.take(12)
    val hashes = surfaceHashes(
      theme,
      active,
      next,
      completedToday,
      daily,
      recent,
      details,
      durations,
      progress,
    )
    LoofitWorkoutSnapshot(
      revision = database.revisions().first,
      generatedAt = LoofitWorkoutDate.nowIso8601(),
      timeZoneIdentifier = zoneId.id,
      theme = theme,
      activeSession = active,
      nextWorkout = next,
      latestCompletedToday = completedToday.firstOrNull(),
      completedToday = completedToday,
      dailyCompleted = daily,
      recentCompleted = recent,
      dailyDetails = details,
      bodyPartDurations = durations,
      routineProgress = progress,
      surfaceHashes = hashes,
    )
  }

  private fun loadTheme(database: LoofitSQLite): LoofitWidgetTheme {
    val raw = database.firstString(
      "SELECT value FROM app_settings WHERE key = 'widget_theme_snapshot' LIMIT 1",
    ) ?: return LoofitWidgetTheme()
    return runCatching { LoofitWidgetTheme.fromMap(JSONObject(raw).stringMap()) }
      .getOrDefault(LoofitWidgetTheme())
  }

  private fun loadSessions(
    database: LoofitSQLite,
    status: String,
    startedAtOrAfter: String?,
  ): List<LoofitWorkoutSessionSnapshot> {
    val filter = if (startedAtOrAfter == null) "" else "AND ws.started_at >= ?"
    val arguments = buildList {
      add(status)
      if (startedAtOrAfter != null) add(startedAtOrAfter)
    }
    val builders = LinkedHashMap<Long, AndroidSessionBuilder>()
    database.query(
      """
      SELECT ws.id, ws.routine_id, ws.routine_day_id,
             COALESCE(ws.routine_day_name_snapshot, ''),
             ws.started_at, ws.ended_at, ws.duration_seconds,
             sp.body_part_id, sp.body_part_name, sp.body_part_color, sp.sort_order
      FROM workout_sessions ws
      LEFT JOIN workout_session_parts_snapshot sp ON sp.workout_session_id = ws.id
      WHERE ws.status = ? $filter
      ORDER BY ws.started_at DESC, ws.id DESC, sp.sort_order ASC, sp.id ASC
      """.trimIndent(),
      arguments,
    ) { cursor ->
      val id = cursor.getLong(0)
      val builder = builders.getOrPut(id) { cursor.sessionBuilder() }
      cursor.part(7, 8, 9, 10)?.let(builder.parts::add)
    }
    return builders.values.map(AndroidSessionBuilder::snapshot)
  }

  private fun loadNextWorkout(database: LoofitSQLite): LoofitWorkoutTargetSnapshot? {
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
      val dayId = cursor.getLong(0)
      if (selectedDayId == null) {
        selectedDayId = dayId
        routineId = cursor.getLong(1)
        alias = cursor.stringOrNull(2).orEmpty()
      }
      if (selectedDayId == dayId) cursor.part(3, 4, 5, 6)?.let(parts::add)
    }
    val dayId = selectedDayId ?: return null
    if (parts.isEmpty()) return null
    val names = parts.joinToString(" · ") { it.name }
    val title = alias.trim().ifBlank { names }
    return LoofitWorkoutTargetSnapshot(
      routineId = routineId,
      routineDayId = dayId,
      title = title,
      detail = if (alias.isBlank() || alias.trim() == names) "" else names,
      parts = parts,
    )
  }

  private fun loadRoutineProgress(database: LoofitSQLite): LoofitRoutineProgressSnapshot? {
    val builders = LinkedHashMap<Long, AndroidRoutineDayBuilder>()
    database.query(
      """
      SELECT rd.id, rd.name, bp.id, bp.name, bp.color, rdp.sort_order
      FROM routines r
      JOIN routine_days rd ON rd.routine_id = r.id
      LEFT JOIN routine_day_parts rdp ON rdp.routine_day_id = rd.id
      LEFT JOIN body_parts bp ON bp.id = rdp.body_part_id AND bp.is_archived = 0
      WHERE r.is_active = 1
      ORDER BY rd.sort_order ASC, rd.id ASC, rdp.sort_order ASC
      """.trimIndent(),
    ) { cursor ->
      val id = cursor.getLong(0)
      val builder = builders.getOrPut(id) {
        AndroidRoutineDayBuilder(id, cursor.stringOrNull(1).orEmpty())
      }
      cursor.part(2, 3, 4, 5)?.let(builder.parts::add)
    }
    if (builders.isEmpty()) return null
    val currentDayId = database.firstLong(
      "SELECT next_routine_day_id FROM routine_progress WHERE id = 1 LIMIT 1",
    )
    return LoofitRoutineProgressSnapshot(
      currentRoutineDayId = currentDayId,
      items = builders.values.map { builder ->
        LoofitRoutineProgressItemSnapshot(
          routineDayId = builder.id,
          title = builder.title,
          parts = builder.parts,
          latestCompleted = loadLatestCompleted(database, builder.id),
        )
      },
    )
  }

  private fun loadLatestCompleted(
    database: LoofitSQLite,
    routineDayId: Long,
  ): LoofitWorkoutSessionSnapshot? {
    var builder: AndroidSessionBuilder? = null
    database.query(
      """
      SELECT ws.id, ws.routine_id, ws.routine_day_id,
             COALESCE(ws.routine_day_name_snapshot, ''),
             ws.started_at, ws.ended_at, ws.duration_seconds,
             sp.body_part_id, sp.body_part_name, sp.body_part_color, sp.sort_order
      FROM workout_sessions ws
      LEFT JOIN workout_session_parts_snapshot sp ON sp.workout_session_id = ws.id
      WHERE ws.id = (
        SELECT id FROM workout_sessions
        WHERE status = 'completed' AND routine_day_id = ?
        ORDER BY started_at DESC, id DESC LIMIT 1
      )
      ORDER BY sp.sort_order ASC, sp.id ASC
      """.trimIndent(),
      listOf(routineDayId),
    ) { cursor ->
      if (builder == null) builder = cursor.sessionBuilder()
      cursor.part(7, 8, 9, 10)?.let { builder?.parts?.add(it) }
    }
    return builder?.snapshot()
  }

  private fun dailyAggregates(
    sessions: List<LoofitWorkoutSessionSnapshot>,
    zoneId: ZoneId,
  ): List<LoofitWorkoutDailyAggregate> = sessions
    .mapNotNull { session ->
      LoofitWorkoutDate.localDateKey(session.startedAt, zoneId)?.let { it to session }
    }
    .groupBy({ it.first }, { it.second })
    .toSortedMap()
    .map { (date, values) ->
      LoofitWorkoutDailyAggregate(
        dateKey = date,
        workoutCount = values.size,
        durationSeconds = values.sumOf { it.durationSeconds },
      )
    }

  private fun dailyDetails(
    sessions: List<LoofitWorkoutSessionSnapshot>,
    zoneId: ZoneId,
  ): List<LoofitWorkoutDailyDetail> {
    val values = sortedMapOf<String, LinkedHashSet<String>>()
    sessions.asReversed().forEach { session ->
      val key = LoofitWorkoutDate.localDateKey(session.startedAt, zoneId) ?: return@forEach
      val names = values.getOrPut(key) { linkedSetOf() }
      session.parts.sortedBy { it.sortOrder }.forEach { names += it.name }
    }
    return values.map { LoofitWorkoutDailyDetail(it.key, it.value.toList()) }
  }

  private fun bodyPartDurations(
    sessions: List<LoofitWorkoutSessionSnapshot>,
    zoneId: ZoneId,
  ): List<LoofitBodyPartDurationSnapshot> {
    val start = LoofitWorkoutDate.today(zoneId)
      .minusDays((LoofitWidgetLayoutContract.BodyPartDuration.rangeDays - 1).toLong())
    val totals = mutableMapOf<String, Int>()
    sessions.forEach { session ->
      val day = LoofitWorkoutDate.localDateKey(session.startedAt, zoneId)
        ?.let(java.time.LocalDate::parse) ?: return@forEach
      if (day < start) return@forEach
      session.parts.map { it.name }.toSet().forEach { name ->
        totals[name] = totals.getOrDefault(name, 0) + session.durationSeconds
      }
    }
    return totals.map { LoofitBodyPartDurationSnapshot(it.key, it.value) }
      .sortedWith(compareByDescending<LoofitBodyPartDurationSnapshot> { it.durationSeconds }
        .thenBy { it.bodyPartName })
  }

  private fun surfaceHashes(
    theme: LoofitWidgetTheme,
    active: LoofitWorkoutSessionSnapshot?,
    next: LoofitWorkoutTargetSnapshot?,
    today: List<LoofitWorkoutSessionSnapshot>,
    daily: List<LoofitWorkoutDailyAggregate>,
    recent: List<LoofitWorkoutSessionSnapshot>,
    details: List<LoofitWorkoutDailyDetail>,
    durations: List<LoofitBodyPartDurationSnapshot>,
    progress: LoofitRoutineProgressSnapshot?,
  ): Map<String, String> {
    val themeJson = JSONObject(theme.dictionary()).toString()
    val control = hash("$themeJson|$active|$next|$today")
    val heatmap = hash("$themeJson|$daily|$recent")
    val detailed = hash("$themeJson|$daily|$details")
    val duration = hash("$themeJson|$durations")
    val routine = hash("$themeJson|$progress")
    return mapOf(
      LoofitWidgetKinds.CONTROL to control,
      LoofitWidgetKinds.HEATMAP_WEEK to heatmap,
      LoofitWidgetKinds.HEATMAP_MONTH to heatmap,
      LoofitWidgetKinds.HEATMAP_SIX_MONTHS to heatmap,
      LoofitWidgetKinds.CURRENT_MONTH to heatmap,
      LoofitWidgetKinds.FOUR_WEEK_EXPANDED to detailed,
      LoofitWidgetKinds.ROUTINE_PROGRESS to routine,
      LoofitWidgetKinds.BODY_PART_DURATION to duration,
      LoofitWidgetKinds.LOCK_WORKOUT to control,
      LoofitWidgetKinds.LOCK_THREE_WEEK to heatmap,
      LoofitWidgetKinds.LOCK_NEXT_THREE_WEEK to heatmap,
      LoofitWidgetKinds.LOCK_ROUTINE_PROGRESS to routine,
    )
  }

  private fun hash(value: String): String = MessageDigest.getInstance("SHA-256")
    .digest(value.toByteArray())
    .joinToString("") { "%02x".format(it) }
}

private fun Cursor.sessionBuilder(): AndroidSessionBuilder = AndroidSessionBuilder(
  id = getLong(0),
  routineId = longOrNull(1),
  routineDayId = longOrNull(2),
  alias = stringOrNull(3).orEmpty(),
  startedAt = stringOrNull(4).orEmpty(),
  endedAt = stringOrNull(5),
  durationSeconds = getInt(6),
)

private fun Cursor.part(
  idIndex: Int,
  nameIndex: Int,
  colorIndex: Int,
  sortIndex: Int,
): LoofitWorkoutPartSnapshot? {
  val name = stringOrNull(nameIndex) ?: return null
  val color = stringOrNull(colorIndex) ?: return null
  return LoofitWorkoutPartSnapshot(longOrNull(idIndex), name, color, getInt(sortIndex))
}

private fun Cursor.longOrNull(index: Int): Long? = if (isNull(index)) null else getLong(index)

private fun Cursor.stringOrNull(index: Int): String? = if (isNull(index)) null else getString(index)

private fun JSONObject.stringMap(): Map<String, Any?> = keys().asSequence().associateWith { opt(it) }
