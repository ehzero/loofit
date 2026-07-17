package com.loofit.workoutcore

import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

internal object LoofitWorkoutDate {
  fun nowIso8601(): String = Instant.now().toString()

  fun parse(value: String): Instant? = runCatching { Instant.parse(value) }.getOrNull()

  fun localDateKey(value: String, zoneId: ZoneId = ZoneId.systemDefault()): String? =
    parse(value)?.atZone(zoneId)?.toLocalDate()?.toString()

  fun today(zoneId: ZoneId = ZoneId.systemDefault()): LocalDate = LocalDate.now(zoneId)

  fun elapsedSeconds(startedAt: String): Long = runCatching {
    (Instant.now().toEpochMilli() - Instant.parse(startedAt).toEpochMilli()).coerceAtLeast(0) / 1_000
  }.getOrDefault(0)
}
