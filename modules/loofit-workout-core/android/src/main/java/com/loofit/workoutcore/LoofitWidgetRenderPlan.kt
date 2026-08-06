package com.loofit.workoutcore

import java.time.Instant
import java.time.LocalDate
import java.time.YearMonth
import java.time.ZoneId
import java.time.ZonedDateTime
import java.time.format.DateTimeFormatter
import java.time.temporal.ChronoUnit
import java.util.Locale
import kotlin.math.min

internal enum class LoofitWidgetSurface { HOME, ACCESSORY }

internal data class LoofitWidgetViewport(
  val widthDp: Int,
  val heightDp: Int,
) {
  val shortestEdgeDp: Int get() = min(widthDp, heightDp)
}

internal sealed interface LoofitWidgetContentPlan

internal enum class LoofitControlState { IDLE, ACTIVE, COMPLETED }

internal data class LoofitWidgetActionPlan(
  val command: String?,
  val expectedSessionId: Long?,
  val label: String,
  val background: String,
  val foreground: String,
)

internal data class LoofitControlRenderPlan(
  val state: LoofitControlState,
  val eyebrow: String,
  val title: String,
  val detail: String,
  val duration: String,
  val timeRange: String,
  val startedAt: Instant?,
  val elapsed: String,
  val action: LoofitWidgetActionPlan?,
) : LoofitWidgetContentPlan

internal data class LoofitHeatmapDayPlan(
  val date: LocalDate,
  val workoutCount: Int,
  val durationSeconds: Int,
  val inRange: Boolean,
) {
  val dateKey: String get() = date.toString()
}

internal enum class LoofitHeatmapPlanKind {
  STANDARD,
  CURRENT_MONTH,
  FOUR_WEEK_EXPANDED,
  LOCK_SCREEN,
}

internal data class LoofitHeatmapRecentPlan(
  val title: String,
  val relativeDay: String,
)

internal data class LoofitHeatmapRenderPlan(
  val kind: LoofitHeatmapPlanKind,
  val rendererSpec: LoofitHeatmapRendererSpec?,
  val days: List<LoofitHeatmapDayPlan>,
  val columns: Int,
  val title: String,
  val count: Int,
  val durationSeconds: Int,
  val stats: List<Pair<String, String>>,
  val recentLabel: String,
  val recent: List<LoofitHeatmapRecentPlan>,
  val bodyPartsByDate: Map<String, List<String>>,
  val isUpcoming: Boolean,
  val today: LocalDate,
) : LoofitWidgetContentPlan

internal data class LoofitRoutineItemPlan(
  val id: Long,
  val title: String,
  val relativeDay: String,
  val metadata: String,
  val isCurrent: Boolean,
)

internal data class LoofitRoutineRenderPlan(
  val items: List<LoofitRoutineItemPlan>,
  val isLockScreen: Boolean,
) : LoofitWidgetContentPlan

internal data class LoofitBodyPartDurationItemPlan(
  val title: String,
  val durationSeconds: Int,
  val duration: String,
  val fraction: Float,
)

internal data class LoofitBodyPartDurationRenderPlan(
  val title: String,
  val items: List<LoofitBodyPartDurationItemPlan>,
) : LoofitWidgetContentPlan

internal data class LoofitWidgetRenderPlan(
  val variant: LoofitAndroidWidgetVariant,
  val surface: LoofitWidgetSurface,
  val viewport: LoofitWidgetViewport,
  val contentPaddingDp: Float,
  val cornerRadiusDp: Float,
  val background: String,
  val theme: LoofitWidgetTheme,
  val content: LoofitWidgetContentPlan,
)

internal object LoofitWidgetRenderPlanBuilder {
  fun build(
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
    viewport: LoofitWidgetViewport,
    now: ZonedDateTime = ZonedDateTime.now(),
  ): LoofitWidgetRenderPlan {
    val theme = snapshot?.theme ?: LoofitWidgetTheme()
    val surface = if (variant.isAccessory()) LoofitWidgetSurface.ACCESSORY else LoofitWidgetSurface.HOME
    val contentPadding = when (surface) {
      LoofitWidgetSurface.HOME -> homeContentPadding(viewport)
      LoofitWidgetSurface.ACCESSORY -> accessoryContentPadding(variant)
    }
    val content = when (variant) {
      LoofitAndroidWidgetVariant.CONTROL,
      LoofitAndroidWidgetVariant.LOCK_WORKOUT -> control(variant, snapshot, theme, now)
      LoofitAndroidWidgetVariant.ROUTINE_PROGRESS,
      LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS -> routine(variant, snapshot, now)
      LoofitAndroidWidgetVariant.BODY_PART_DURATION -> bodyPartDuration(snapshot)
      else -> heatmap(variant, snapshot, now.toLocalDate())
    }
    return LoofitWidgetRenderPlan(
      variant = variant,
      surface = surface,
      viewport = viewport,
      contentPaddingDp = contentPadding,
      cornerRadiusDp = if (surface == LoofitWidgetSurface.HOME) {
        LoofitWidgetLayoutContract.Radius.container
      } else {
        0f
      },
      background = if (surface == LoofitWidgetSurface.HOME) theme.background else "#00000000",
      theme = theme,
      content = content,
    )
  }

  private fun homeContentPadding(viewport: LoofitWidgetViewport): Float {
    if (viewport.shortestEdgeDp <= 0) return LoofitWidgetLayoutContract.contentPadding
    return LoofitWidgetLayoutContract.contentPadding * viewport.shortestEdgeDp /
      LoofitWidgetLayoutContract.ContentMargins.homeReferenceShortestEdge
  }

  private fun accessoryContentPadding(variant: LoofitAndroidWidgetVariant): Float = when (variant) {
    LoofitAndroidWidgetVariant.LOCK_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK ->
      LoofitWidgetLayoutContract.LockScreen.ThreeWeekCalendar.contentPadding
    LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS ->
      LoofitWidgetLayoutContract.RoutineProgress.LockScreen.contentPadding
    else -> 0f
  }

  private fun control(
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
    theme: LoofitWidgetTheme,
    now: ZonedDateTime,
  ): LoofitControlRenderPlan {
    val presentation = workoutPresentation(snapshot, now)
    if (variant == LoofitAndroidWidgetVariant.LOCK_WORKOUT) {
      return lockScreenControl(presentation, theme, now.toInstant())
    }
    return when (presentation.state) {
      LoofitControlState.ACTIVE -> LoofitControlRenderPlan(
        state = presentation.state,
        eyebrow = LoofitWidgetLayoutContract.Control.Copy.active,
        title = presentation.title,
        detail = presentation.detail.ifBlank { presentation.title },
        duration = "",
        timeRange = "",
        startedAt = presentation.startedAt,
        elapsed = formatElapsed(presentation.startedAt, now.toInstant()),
        action = LoofitWidgetActionPlan(
          command = "complete",
          expectedSessionId = presentation.sessionId,
          label = LoofitWidgetLayoutContract.Control.Copy.end,
          background = theme.secondaryButtonBackground,
          foreground = theme.secondaryButtonText,
        ),
      )
      LoofitControlState.COMPLETED -> LoofitControlRenderPlan(
        state = presentation.state,
        eyebrow = LoofitWidgetLayoutContract.Control.Copy.completed,
        title = presentation.title,
        detail = presentation.detail,
        duration = formatDuration(presentation.durationSeconds),
        timeRange = presentation.timeRange,
        startedAt = null,
        elapsed = "",
        action = null,
      )
      LoofitControlState.IDLE -> LoofitControlRenderPlan(
        state = presentation.state,
        eyebrow = LoofitWidgetLayoutContract.Control.Copy.idle,
        title = presentation.title,
        detail = presentation.detail,
        duration = "",
        timeRange = "",
        startedAt = null,
        elapsed = "",
        action = LoofitWidgetActionPlan(
          command = if (presentation.canStart) "startNext" else null,
          expectedSessionId = null,
          label = if (presentation.canStart) {
            LoofitWidgetLayoutContract.Control.Copy.start
          } else {
            LoofitWidgetLayoutContract.Control.Copy.routineRequired
          },
          background = theme.accent,
          foreground = theme.accentText,
        ),
      )
    }
  }

  private fun lockScreenControl(
    presentation: WorkoutPresentation,
    theme: LoofitWidgetTheme,
    now: Instant,
  ): LoofitControlRenderPlan = when (presentation.state) {
    LoofitControlState.ACTIVE -> LoofitControlRenderPlan(
      state = presentation.state,
      eyebrow = LoofitWidgetLayoutContract.LockScreen.active,
      title = "",
      detail = presentation.title,
      duration = "",
      timeRange = "",
      startedAt = presentation.startedAt,
      elapsed = formatElapsed(presentation.startedAt, now),
      action = LoofitWidgetActionPlan(
        command = "complete",
        expectedSessionId = presentation.sessionId,
        label = LoofitWidgetLayoutContract.Control.Copy.end,
        background = theme.secondaryButtonBackground,
        foreground = theme.secondaryButtonText,
      ),
    )
    LoofitControlState.COMPLETED -> LoofitControlRenderPlan(
      state = presentation.state,
      eyebrow = LoofitWidgetLayoutContract.LockScreen.completedEyebrow,
      title = LoofitWidgetLayoutContract.LockScreen.completedBadge,
      detail = listOf(presentation.title, formatDuration(presentation.durationSeconds))
        .filter(String::isNotBlank)
        .joinToString(LoofitWidgetLayoutContract.RoutineProgress.metadataSeparator),
      duration = "",
      timeRange = "",
      startedAt = null,
      elapsed = "",
      action = null,
    )
    LoofitControlState.IDLE -> LoofitControlRenderPlan(
      state = presentation.state,
      eyebrow = LoofitWidgetLayoutContract.LockScreen.idle,
      title = presentation.title,
      detail = presentation.detail,
      duration = "",
      timeRange = "",
      startedAt = null,
      elapsed = "",
      action = if (presentation.canStart) {
        LoofitWidgetActionPlan(
          command = "startNext",
          expectedSessionId = null,
          label = LoofitWidgetLayoutContract.Control.Copy.start,
          background = theme.accent,
          foreground = theme.accentText,
        )
      } else {
        null
      },
    )
  }

  private data class WorkoutPresentation(
    val state: LoofitControlState,
    val sessionId: Long?,
    val title: String,
    val detail: String,
    val startedAt: Instant?,
    val durationSeconds: Int,
    val timeRange: String,
    val canStart: Boolean,
  )

  private fun workoutPresentation(
    snapshot: LoofitWorkoutSnapshot?,
    now: ZonedDateTime,
  ): WorkoutPresentation {
    snapshot?.activeSession?.let { active ->
      return WorkoutPresentation(
        state = LoofitControlState.ACTIVE,
        sessionId = active.id,
        title = active.title.trim().ifBlank { formatParts(active.parts) },
        detail = active.detail,
        startedAt = LoofitWorkoutDate.parse(active.startedAt),
        durationSeconds = 0,
        timeRange = "",
        canStart = false,
      )
    }

    val completed = snapshot?.completedToday.orEmpty()
      .filter { session ->
        LoofitWorkoutDate.parse(session.startedAt)?.atZone(now.zone)?.toLocalDate() == now.toLocalDate()
      }
      .sortedBy { LoofitWorkoutDate.parse(it.startedAt) ?: Instant.EPOCH }
    if (completed.isNotEmpty()) {
      val title = uniqueJoined(completed.map { it.title })
      val parts = uniqueJoined(completed.flatMap { session -> session.parts.map { it.name } })
      val first = LoofitWorkoutDate.parse(completed.first().startedAt)
      val lastSession = completed.last()
      val last = LoofitWorkoutDate.parse(lastSession.endedAt ?: lastSession.startedAt)
      val range = if (first != null && last != null) {
        "${formatClock(first, now.zone)} – ${formatClock(last, now.zone)}"
      } else {
        ""
      }
      return WorkoutPresentation(
        state = LoofitControlState.COMPLETED,
        sessionId = null,
        title = title,
        detail = if (parts == title) "" else parts,
        startedAt = null,
        durationSeconds = completed.sumOf { it.durationSeconds },
        timeRange = range,
        canStart = false,
      )
    }

    val next = snapshot?.nextWorkout
    return WorkoutPresentation(
      state = LoofitControlState.IDLE,
      sessionId = null,
      title = next?.title?.trim()?.ifBlank { formatParts(next.parts) }
        ?: LoofitWidgetLayoutContract.Control.Copy.routineRequired,
      detail = next?.detail.orEmpty(),
      startedAt = null,
      durationSeconds = 0,
      timeRange = "",
      canStart = next != null,
    )
  }

  private fun heatmap(
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
    today: LocalDate,
  ): LoofitHeatmapRenderPlan {
    val values = snapshot?.dailyCompleted.orEmpty().associateBy { it.dateKey }
    fun day(date: LocalDate, inRange: Boolean = true): LoofitHeatmapDayPlan {
      val value = if (inRange) values[date.toString()] else null
      return LoofitHeatmapDayPlan(
        date = date,
        workoutCount = value?.workoutCount ?: 0,
        durationSeconds = value?.durationSeconds ?: 0,
        inRange = inRange,
      )
    }

    val kind: LoofitHeatmapPlanKind
    val spec: LoofitHeatmapRendererSpec?
    val dates: List<LoofitHeatmapDayPlan>
    val columns: Int
    val upcoming: Boolean
    when (variant) {
      LoofitAndroidWidgetVariant.HEATMAP_WEEK -> {
        kind = LoofitHeatmapPlanKind.STANDARD
        spec = LoofitWidgetLayoutContract.Heatmap.week
        dates = inclusiveDates(today.minusDays((spec.rangeDays - 1).toLong()), today).map(::day)
        columns = spec.columns
        upcoming = false
      }
      LoofitAndroidWidgetVariant.HEATMAP_MONTH -> {
        kind = LoofitHeatmapPlanKind.STANDARD
        spec = LoofitWidgetLayoutContract.Heatmap.month
        val start = today.previousOrSameSunday().minusWeeks((spec.rangeWeeks - 1).toLong())
        dates = inclusiveDates(start, today).map(::day)
        columns = spec.columns
        upcoming = false
      }
      LoofitAndroidWidgetVariant.HEATMAP_SIX_MONTHS -> {
        kind = LoofitHeatmapPlanKind.STANDARD
        spec = LoofitWidgetLayoutContract.Heatmap.year
        val monthStart = YearMonth.from(today).minusMonths((spec.rangeMonths - 1).toLong()).atDay(1)
        dates = inclusiveDates(monthStart.previousOrSameSunday(), today)
          .map { date -> day(date, date >= monthStart) }
        columns = 0
        upcoming = false
      }
      LoofitAndroidWidgetVariant.CURRENT_MONTH -> {
        kind = LoofitHeatmapPlanKind.CURRENT_MONTH
        spec = null
        val month = YearMonth.from(today)
        val start = month.atDay(1).previousOrSameSunday()
        val end = month.atEndOfMonth().nextOrSameSaturday()
        dates = inclusiveDates(start, end).map { date -> day(date, YearMonth.from(date) == month) }
        columns = LoofitWidgetLayoutContract.calendarColumns
        upcoming = false
      }
      LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED -> {
        kind = LoofitHeatmapPlanKind.FOUR_WEEK_EXPANDED
        spec = null
        val start = today.previousOrSameSunday()
          .minusWeeks((LoofitWidgetLayoutContract.FourWeekExpanded.rangeWeeks - 1).toLong())
        dates = inclusiveDates(start, today).map(::day)
        columns = LoofitWidgetLayoutContract.FourWeekExpanded.columns
        upcoming = false
      }
      LoofitAndroidWidgetVariant.LOCK_THREE_WEEK -> {
        kind = LoofitHeatmapPlanKind.LOCK_SCREEN
        spec = null
        val start = today.previousOrSameSunday()
          .minusWeeks((LoofitWidgetLayoutContract.LockScreen.ThreeWeekCalendar.rangeWeeks - 1).toLong())
        dates = inclusiveDates(start, start.plusDays(20)).map { date -> day(date, date <= today) }
        columns = LoofitWidgetLayoutContract.LockScreen.ThreeWeekCalendar.columns
        upcoming = false
      }
      LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK -> {
        kind = LoofitHeatmapPlanKind.LOCK_SCREEN
        spec = null
        val start = today.previousOrSameSunday()
        dates = inclusiveDates(start, start.plusDays(20)).map { date -> day(date, date <= today) }
        columns = LoofitWidgetLayoutContract.LockScreen.ThreeWeekCalendar.columns
        upcoming = true
      }
      else -> error("Unsupported heatmap variant: $variant")
    }

    val included = dates.filter { it.inRange }
    val count = included.sumOf { it.workoutCount }
    val duration = included.sumOf { it.durationSeconds }
    val average = if (count > 0) duration / count else 0
    val title = when (variant) {
      LoofitAndroidWidgetVariant.CURRENT_MONTH -> "${today.monthValue}월 · ${count}회"
      LoofitAndroidWidgetVariant.HEATMAP_SIX_MONTHS ->
        "${spec!!.title} · ${count}회 · 총 ${formatDuration(duration)} · 평균 ${formatDuration(average)}"
      else -> spec?.title.orEmpty()
    }
    val stats = if (variant == LoofitAndroidWidgetVariant.HEATMAP_WEEK) {
      LoofitWidgetLayoutContract.Heatmap.WeekFooter.statOrder.mapIndexed { index, stat ->
        val label = LoofitWidgetLayoutContract.Heatmap.WeekFooter.statLabels.getOrElse(index) { "" }
        label to when (stat) {
          LoofitHeatmapStat.COUNT -> "${count}회"
          LoofitHeatmapStat.TOTAL_DURATION -> formatDuration(duration)
          LoofitHeatmapStat.AVERAGE_DURATION -> formatDuration(average)
        }
      }
    } else {
      emptyList()
    }
    val recent = if (variant == LoofitAndroidWidgetVariant.HEATMAP_WEEK) {
      val rangeStart = today.minusDays((LoofitWidgetLayoutContract.Heatmap.week.rangeDays - 1).toLong())
      snapshot?.recentCompleted.orEmpty()
        .filter { session ->
          val date = LoofitWorkoutDate.parse(session.startedAt)?.atZone(ZoneId.systemDefault())
            ?.toLocalDate()
          date != null && date >= rangeStart && date <= today
        }
        .take(LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentLimit)
        .map { session ->
          LoofitHeatmapRecentPlan(
            title = "${session.title} · ${formatDuration(session.durationSeconds)}",
            relativeDay = relativeDay(session.startedAt, today),
          )
        }
    } else {
      emptyList()
    }
    return LoofitHeatmapRenderPlan(
      kind = kind,
      rendererSpec = spec,
      days = dates,
      columns = columns,
      title = title,
      count = count,
      durationSeconds = duration,
      stats = stats,
      recentLabel = if (variant == LoofitAndroidWidgetVariant.HEATMAP_WEEK) {
        LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentLabel
      } else {
        ""
      },
      recent = recent,
      bodyPartsByDate = snapshot?.dailyDetails.orEmpty().associate {
        it.dateKey to it.bodyPartNames
      },
      isUpcoming = upcoming,
      today = today,
    )
  }

  private fun routine(
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
    now: ZonedDateTime,
  ): LoofitRoutineRenderPlan {
    val progress = snapshot?.routineProgress
    val lock = variant == LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS
    val limit = if (lock) {
      LoofitWidgetLayoutContract.RoutineProgress.LockScreen.visibleItemLimit
    } else {
      LoofitWidgetLayoutContract.RoutineProgress.visibleItemLimit
    }
    val visible = progress?.items.orEmpty().centeredAround(progress?.currentRoutineDayId, limit)
    return LoofitRoutineRenderPlan(
      isLockScreen = lock,
      items = visible.map { item ->
        val bodyParts = routineBodyParts(item)
        val alias = item.title.trim()
        val title = alias.ifBlank { bodyParts }
        val bodyPartDetail = if (alias.isBlank() || alias == bodyParts) "" else bodyParts
        val relative = item.latestCompleted?.let { relativeDay(it.startedAt, now.toLocalDate()) }
          ?: LoofitWidgetLayoutContract.RoutineProgress.emptyRelativeDay
        val metadata = if (lock) {
          ""
        } else {
          listOf(
            bodyPartDetail,
            item.latestCompleted?.let { formatDuration(it.durationSeconds) }.orEmpty(),
          ).filter(String::isNotBlank)
            .joinToString(LoofitWidgetLayoutContract.RoutineProgress.metadataSeparator)
        }
        LoofitRoutineItemPlan(
          id = item.routineDayId,
          title = title,
          relativeDay = relative,
          metadata = metadata,
          isCurrent = item.routineDayId == progress?.currentRoutineDayId,
        )
      },
    )
  }

  private fun bodyPartDuration(
    snapshot: LoofitWorkoutSnapshot?,
  ): LoofitBodyPartDurationRenderPlan {
    val rows = snapshot?.bodyPartDurations.orEmpty()
      .sortedByDescending { it.durationSeconds }
      .take(LoofitWidgetLayoutContract.BodyPartDuration.visibleItemLimit)
    val maximum = rows.maxOfOrNull { it.durationSeconds }?.coerceAtLeast(1) ?: 1
    return LoofitBodyPartDurationRenderPlan(
      title = LoofitWidgetLayoutContract.BodyPartDuration.title,
      items = rows.map { row ->
        LoofitBodyPartDurationItemPlan(
          title = row.bodyPartName,
          durationSeconds = row.durationSeconds,
          duration = formatDuration(row.durationSeconds),
          fraction = row.durationSeconds.toFloat() / maximum,
        )
      },
    )
  }

  internal fun formatDuration(totalSeconds: Int): String {
    val seconds = totalSeconds.coerceAtLeast(0)
    val hours = seconds / 3_600
    val minutes = (seconds % 3_600) / 60
    if (hours > 0) return "${hours}시간 ${minutes}분"
    if (minutes > 0) return "${minutes}분"
    return if (seconds == 0) "0분" else "${seconds}초"
  }

  internal fun formatElapsed(startedAt: Instant?, now: Instant): String {
    val totalSeconds = startedAt?.let { ChronoUnit.SECONDS.between(it, now).coerceAtLeast(0) } ?: 0
    val hours = totalSeconds / 3_600
    val minutes = (totalSeconds % 3_600) / 60
    val seconds = totalSeconds % 60
    return if (hours > 0) {
      "%d:%02d:%02d".format(Locale.US, hours, minutes, seconds)
    } else {
      "%d:%02d".format(Locale.US, minutes, seconds)
    }
  }

  private fun formatClock(value: Instant, zone: ZoneId): String =
    DateTimeFormatter.ofPattern("a h:mm", Locale.KOREAN).format(value.atZone(zone))

  private fun relativeDay(value: String, today: LocalDate): String {
    val date = LoofitWorkoutDate.parse(value)?.atZone(ZoneId.systemDefault())?.toLocalDate()
      ?: return LoofitWidgetLayoutContract.RoutineProgress.emptyRelativeDay
    val days = ChronoUnit.DAYS.between(date, today).coerceAtLeast(0)
    return when (days) {
      0L -> "오늘"
      1L -> "어제"
      else -> "${days}일 전"
    }
  }

  private fun formatParts(parts: List<LoofitWorkoutPartSnapshot>): String = uniqueJoined(
    parts.sortedBy { it.sortOrder }.map { it.name },
  )

  private fun routineBodyParts(item: LoofitRoutineProgressItemSnapshot): String =
    formatParts(item.latestCompleted?.parts ?: item.parts)

  private fun uniqueJoined(values: List<String>): String {
    val seen = linkedSetOf<String>()
    values.map(String::trim).filter { it.isNotEmpty() }.forEach(seen::add)
    return seen.joinToString(" · ")
  }

  private fun inclusiveDates(start: LocalDate, end: LocalDate): List<LocalDate> {
    if (end < start) return emptyList()
    return List(ChronoUnit.DAYS.between(start, end).toInt() + 1) { index ->
      start.plusDays(index.toLong())
    }
  }

  private fun LocalDate.previousOrSameSunday(): LocalDate =
    minusDays((dayOfWeek.value % 7).toLong())

  private fun LocalDate.nextOrSameSaturday(): LocalDate =
    plusDays(((6 - (dayOfWeek.value % 7) + 7) % 7).toLong())

  private fun List<LoofitRoutineProgressItemSnapshot>.centeredAround(
    currentId: Long?,
    limit: Int,
  ): List<LoofitRoutineProgressItemSnapshot> {
    val count = limit.coerceAtLeast(1)
    if (size <= count) return this
    val currentIndex = indexOfFirst { it.routineDayId == currentId }.coerceAtLeast(0)
    val start = (currentIndex - count / 2).coerceIn(0, size - count)
    return subList(start, start + count)
  }

  private fun LoofitAndroidWidgetVariant.isAccessory(): Boolean = when (this) {
    LoofitAndroidWidgetVariant.LOCK_WORKOUT,
    LoofitAndroidWidgetVariant.LOCK_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS -> true
    else -> false
  }
}
