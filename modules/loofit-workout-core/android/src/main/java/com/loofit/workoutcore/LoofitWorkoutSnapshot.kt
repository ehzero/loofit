package com.loofit.workoutcore

import org.json.JSONArray
import org.json.JSONObject

internal data class LoofitWorkoutSessionSnapshot(
  val id: Long,
  val routineId: Long?,
  val routineDayId: Long?,
  val title: String,
  val detail: String,
  val startedAt: String,
  val endedAt: String?,
  val durationSeconds: Int,
  val parts: List<LoofitWorkoutPartSnapshot>,
) {
  companion object
}

internal data class LoofitWorkoutDailyAggregate(
  val dateKey: String,
  val workoutCount: Int,
  val durationSeconds: Int,
) {
  companion object
}

internal data class LoofitWorkoutDailyDetail(
  val dateKey: String,
  val bodyPartNames: List<String>,
) {
  companion object
}

internal data class LoofitBodyPartDurationSnapshot(
  val bodyPartName: String,
  val durationSeconds: Int,
) {
  companion object
}

internal data class LoofitRoutineProgressItemSnapshot(
  val routineDayId: Long,
  val title: String,
  val parts: List<LoofitWorkoutPartSnapshot>,
  val latestCompleted: LoofitWorkoutSessionSnapshot?,
) {
  companion object
}

internal data class LoofitRoutineProgressSnapshot(
  val currentRoutineDayId: Long?,
  val items: List<LoofitRoutineProgressItemSnapshot>,
) {
  companion object
}

internal data class LoofitWorkoutSnapshot(
  val revision: Long,
  val generatedAt: String,
  val timeZoneIdentifier: String,
  val theme: LoofitWidgetTheme,
  val activeSession: LoofitWorkoutSessionSnapshot?,
  val nextWorkout: LoofitWorkoutTargetSnapshot?,
  val latestCompletedToday: LoofitWorkoutSessionSnapshot?,
  val completedToday: List<LoofitWorkoutSessionSnapshot>,
  val dailyCompleted: List<LoofitWorkoutDailyAggregate>,
  val recentCompleted: List<LoofitWorkoutSessionSnapshot>,
  val dailyDetails: List<LoofitWorkoutDailyDetail>,
  val bodyPartDurations: List<LoofitBodyPartDurationSnapshot>,
  val routineProgress: LoofitRoutineProgressSnapshot?,
  val surfaceHashes: Map<String, String>,
) {
  fun json(): JSONObject = JSONObject().apply {
    put("revision", revision)
    put("generatedAt", generatedAt)
    put("timeZoneIdentifier", timeZoneIdentifier)
    put("theme", JSONObject(theme.dictionary()))
    put("activeSession", activeSession?.json() ?: JSONObject.NULL)
    put("nextWorkout", nextWorkout?.json() ?: JSONObject.NULL)
    put("latestCompletedToday", latestCompletedToday?.json() ?: JSONObject.NULL)
    put("completedToday", completedToday.jsonArray { it.json() })
    put("dailyCompleted", dailyCompleted.jsonArray { it.json() })
    put("recentCompleted", recentCompleted.jsonArray { it.json() })
    put("dailyDetails", dailyDetails.jsonArray { it.json() })
    put("bodyPartDurations", bodyPartDurations.jsonArray { it.json() })
    put("routineProgress", routineProgress?.json() ?: JSONObject.NULL)
    put("surfaceHashes", JSONObject(surfaceHashes))
  }

  companion object {
    fun fromJson(value: JSONObject): LoofitWorkoutSnapshot = LoofitWorkoutSnapshot(
      revision = value.optLong("revision"),
      generatedAt = value.optString("generatedAt"),
      timeZoneIdentifier = value.optString("timeZoneIdentifier"),
      theme = LoofitWidgetTheme.fromMap(value.getJSONObject("theme").stringMap()),
      activeSession = value.optionalObject("activeSession")?.let(LoofitWorkoutSessionSnapshot::fromJson),
      nextWorkout = value.optionalObject("nextWorkout")?.let(LoofitWorkoutTargetSnapshot::fromJson),
      latestCompletedToday = value.optionalObject("latestCompletedToday")
        ?.let(LoofitWorkoutSessionSnapshot::fromJson),
      completedToday = value.optJSONArray("completedToday").objects(LoofitWorkoutSessionSnapshot::fromJson),
      dailyCompleted = value.optJSONArray("dailyCompleted").objects(LoofitWorkoutDailyAggregate::fromJson),
      recentCompleted = value.optJSONArray("recentCompleted").objects(LoofitWorkoutSessionSnapshot::fromJson),
      dailyDetails = value.optJSONArray("dailyDetails").objects(LoofitWorkoutDailyDetail::fromJson),
      bodyPartDurations = value.optJSONArray("bodyPartDurations").objects(LoofitBodyPartDurationSnapshot::fromJson),
      routineProgress = value.optionalObject("routineProgress")?.let(LoofitRoutineProgressSnapshot::fromJson),
      surfaceHashes = value.optJSONObject("surfaceHashes")?.stringMap()
        ?.mapValues { it.value?.toString().orEmpty() }
        .orEmpty(),
    )
  }
}

private fun LoofitWorkoutPartSnapshot.json(): JSONObject = JSONObject().apply {
  put("id", id ?: JSONObject.NULL)
  put("name", name)
  put("color", color)
  put("sortOrder", sortOrder)
}

private fun LoofitWorkoutTargetSnapshot.json(): JSONObject = JSONObject().apply {
  put("routineId", routineId)
  put("routineDayId", routineDayId)
  put("title", title)
  put("detail", detail)
  put("parts", parts.jsonArray { it.json() })
}

private fun LoofitWorkoutSessionSnapshot.json(): JSONObject = JSONObject().apply {
  put("id", id)
  put("routineId", routineId ?: JSONObject.NULL)
  put("routineDayId", routineDayId ?: JSONObject.NULL)
  put("title", title)
  put("detail", detail)
  put("startedAt", startedAt)
  put("endedAt", endedAt ?: JSONObject.NULL)
  put("durationSeconds", durationSeconds)
  put("parts", parts.jsonArray { it.json() })
}

private fun LoofitWorkoutDailyAggregate.json(): JSONObject = JSONObject().apply {
  put("dateKey", dateKey)
  put("workoutCount", workoutCount)
  put("durationSeconds", durationSeconds)
}

private fun LoofitWorkoutDailyDetail.json(): JSONObject = JSONObject().apply {
  put("dateKey", dateKey)
  put("bodyPartNames", JSONArray(bodyPartNames))
}

private fun LoofitBodyPartDurationSnapshot.json(): JSONObject = JSONObject().apply {
  put("bodyPartName", bodyPartName)
  put("durationSeconds", durationSeconds)
}

private fun LoofitRoutineProgressItemSnapshot.json(): JSONObject = JSONObject().apply {
  put("routineDayId", routineDayId)
  put("title", title)
  put("parts", parts.jsonArray { it.json() })
  put("latestCompleted", latestCompleted?.json() ?: JSONObject.NULL)
}

private fun LoofitRoutineProgressSnapshot.json(): JSONObject = JSONObject().apply {
  put("currentRoutineDayId", currentRoutineDayId ?: JSONObject.NULL)
  put("items", items.jsonArray { it.json() })
}

private fun LoofitWorkoutPartSnapshot.Companion.fromJson(value: JSONObject) = LoofitWorkoutPartSnapshot(
  id = value.optionalLong("id"),
  name = value.optString("name"),
  color = value.optString("color"),
  sortOrder = value.optInt("sortOrder"),
)

private fun LoofitWorkoutTargetSnapshot.Companion.fromJson(value: JSONObject) = LoofitWorkoutTargetSnapshot(
  routineId = value.optLong("routineId"),
  routineDayId = value.optLong("routineDayId"),
  title = value.optString("title"),
  detail = value.optString("detail"),
  parts = value.optJSONArray("parts").objects(LoofitWorkoutPartSnapshot::fromJson),
)

private fun LoofitWorkoutSessionSnapshot.Companion.fromJson(value: JSONObject) = LoofitWorkoutSessionSnapshot(
  id = value.optLong("id"),
  routineId = value.optionalLong("routineId"),
  routineDayId = value.optionalLong("routineDayId"),
  title = value.optString("title"),
  detail = value.optString("detail"),
  startedAt = value.optString("startedAt"),
  endedAt = value.optionalString("endedAt"),
  durationSeconds = value.optInt("durationSeconds"),
  parts = value.optJSONArray("parts").objects(LoofitWorkoutPartSnapshot::fromJson),
)

private fun LoofitWorkoutDailyAggregate.Companion.fromJson(value: JSONObject) =
  LoofitWorkoutDailyAggregate(
    dateKey = value.optString("dateKey"),
    workoutCount = value.optInt("workoutCount"),
    durationSeconds = value.optInt("durationSeconds"),
  )

private fun LoofitWorkoutDailyDetail.Companion.fromJson(value: JSONObject) = LoofitWorkoutDailyDetail(
  dateKey = value.optString("dateKey"),
  bodyPartNames = value.optJSONArray("bodyPartNames").strings(),
)

private fun LoofitBodyPartDurationSnapshot.Companion.fromJson(value: JSONObject) =
  LoofitBodyPartDurationSnapshot(
    bodyPartName = value.optString("bodyPartName"),
    durationSeconds = value.optInt("durationSeconds"),
  )

private fun LoofitRoutineProgressItemSnapshot.Companion.fromJson(value: JSONObject) =
  LoofitRoutineProgressItemSnapshot(
    routineDayId = value.optLong("routineDayId"),
    title = value.optString("title"),
    parts = value.optJSONArray("parts").objects(LoofitWorkoutPartSnapshot::fromJson),
    latestCompleted = value.optionalObject("latestCompleted")
      ?.let(LoofitWorkoutSessionSnapshot::fromJson),
  )

private fun LoofitRoutineProgressSnapshot.Companion.fromJson(value: JSONObject) =
  LoofitRoutineProgressSnapshot(
    currentRoutineDayId = value.optionalLong("currentRoutineDayId"),
    items = value.optJSONArray("items").objects(LoofitRoutineProgressItemSnapshot::fromJson),
  )

private fun <T> List<T>.jsonArray(transform: (T) -> Any): JSONArray = JSONArray().apply {
  this@jsonArray.forEach { put(transform(it)) }
}

private fun JSONObject.optionalObject(key: String): JSONObject? =
  if (isNull(key)) null else optJSONObject(key)

private fun JSONObject.optionalLong(key: String): Long? = if (isNull(key)) null else optLong(key)

private fun JSONObject.optionalString(key: String): String? = if (isNull(key)) null else optString(key)

private fun JSONObject.stringMap(): Map<String, Any?> = keys().asSequence().associateWith { opt(it) }

private fun <T> JSONArray?.objects(transform: (JSONObject) -> T): List<T> =
  if (this == null) emptyList() else (0 until length()).map { transform(getJSONObject(it)) }

private fun JSONArray?.strings(): List<String> =
  if (this == null) emptyList() else (0 until length()).map { optString(it) }
