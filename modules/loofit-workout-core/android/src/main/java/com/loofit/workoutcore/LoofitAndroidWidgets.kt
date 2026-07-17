package com.loofit.workoutcore

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.SystemClock
import android.text.SpannableStringBuilder
import android.text.Spanned
import android.text.style.ForegroundColorSpan
import android.view.View
import android.widget.RemoteViews

enum class LoofitAndroidWidgetVariant(
  val kind: String,
  val title: String,
) {
  CONTROL(LoofitWidgetKinds.CONTROL, "다음 운동"),
  HEATMAP_WEEK(LoofitWidgetKinds.HEATMAP_WEEK, "지난 7일"),
  HEATMAP_MONTH(LoofitWidgetKinds.HEATMAP_MONTH, "지난 5주"),
  HEATMAP_SIX_MONTHS(LoofitWidgetKinds.HEATMAP_SIX_MONTHS, "지난 6개월"),
  CURRENT_MONTH(LoofitWidgetKinds.CURRENT_MONTH, "이번 달"),
  FOUR_WEEK_EXPANDED(LoofitWidgetKinds.FOUR_WEEK_EXPANDED, "지난 4주 상세"),
  ROUTINE_PROGRESS(LoofitWidgetKinds.ROUTINE_PROGRESS, "루틴 진행"),
  BODY_PART_DURATION(LoofitWidgetKinds.BODY_PART_DURATION, "최근 30일 부위별 운동 시간"),
  LOCK_WORKOUT(LoofitWidgetKinds.LOCK_WORKOUT, "다음 운동"),
  LOCK_THREE_WEEK(LoofitWidgetKinds.LOCK_THREE_WEEK, "지난 3주"),
  LOCK_NEXT_THREE_WEEK(LoofitWidgetKinds.LOCK_NEXT_THREE_WEEK, "다음 3주"),
  LOCK_ROUTINE_PROGRESS(LoofitWidgetKinds.LOCK_ROUTINE_PROGRESS, "루틴 진행"),
}

abstract class LoofitBaseWidgetProvider(
  private val variant: LoofitAndroidWidgetVariant,
) : AppWidgetProvider() {
  override fun onUpdate(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetIds: IntArray,
  ) {
    LoofitAndroidWidgetRenderer.update(
      context,
      appWidgetManager,
      appWidgetIds,
      variant,
      LoofitWorkoutSnapshotStore.load(context),
    )
    LoofitWidgetReconcileScheduler.request(context)
  }

  override fun onEnabled(context: Context) {
    super.onEnabled(context)
    LoofitWidgetReconcileScheduler.request(context, force = true)
  }
}

class WorkoutControlWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.CONTROL)
class HeatmapWeekWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.HEATMAP_WEEK)
class HeatmapMonthWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.HEATMAP_MONTH)
class HeatmapYearWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.HEATMAP_SIX_MONTHS)
class CurrentMonthCalendarWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.CURRENT_MONTH)
class HeatmapFourWeekExpandedWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED)
class RoutineProgressWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.ROUTINE_PROGRESS)
class BodyPartDurationWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.BODY_PART_DURATION)
class WorkoutLockScreenWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.LOCK_WORKOUT)
class ThreeWeekCalendarLockScreenWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.LOCK_THREE_WEEK)
class NextThreeWeekCalendarLockScreenWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK)
class RoutineProgressLockScreenWidgetProvider : LoofitBaseWidgetProvider(LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS)

internal object LoofitAndroidSurfacePublisher {
  fun publish(
    context: Context,
    previous: LoofitWorkoutSnapshot?,
    current: LoofitWorkoutSnapshot,
  ) {
    LoofitWorkoutNotification.reconcile(context, current)
    LoofitDayChangeScheduler.schedule(context)
    val reloadAll = previous?.timeZoneIdentifier != current.timeZoneIdentifier
    LoofitAndroidWidgetVariant.entries.forEach { variant ->
      if (reloadAll || previous?.surfaceHashes?.get(variant.kind) != current.surfaceHashes[variant.kind]) {
        updateVariant(context, variant, current)
      }
    }
  }

  fun updateAll(context: Context, snapshot: LoofitWorkoutSnapshot?) {
    LoofitAndroidWidgetVariant.entries.forEach { updateVariant(context, it, snapshot) }
  }

  private fun updateVariant(
    context: Context,
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
  ) {
    val manager = AppWidgetManager.getInstance(context)
    val component = ComponentName(context, providerClass(variant))
    val ids = manager.getAppWidgetIds(component)
    if (ids.isNotEmpty()) {
      LoofitAndroidWidgetRenderer.update(context, manager, ids, variant, snapshot)
    }
  }

  private fun providerClass(variant: LoofitAndroidWidgetVariant): Class<out AppWidgetProvider> =
    when (variant) {
      LoofitAndroidWidgetVariant.CONTROL -> WorkoutControlWidgetProvider::class.java
      LoofitAndroidWidgetVariant.HEATMAP_WEEK -> HeatmapWeekWidgetProvider::class.java
      LoofitAndroidWidgetVariant.HEATMAP_MONTH -> HeatmapMonthWidgetProvider::class.java
      LoofitAndroidWidgetVariant.HEATMAP_SIX_MONTHS -> HeatmapYearWidgetProvider::class.java
      LoofitAndroidWidgetVariant.CURRENT_MONTH -> CurrentMonthCalendarWidgetProvider::class.java
      LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED -> HeatmapFourWeekExpandedWidgetProvider::class.java
      LoofitAndroidWidgetVariant.ROUTINE_PROGRESS -> RoutineProgressWidgetProvider::class.java
      LoofitAndroidWidgetVariant.BODY_PART_DURATION -> BodyPartDurationWidgetProvider::class.java
      LoofitAndroidWidgetVariant.LOCK_WORKOUT -> WorkoutLockScreenWidgetProvider::class.java
      LoofitAndroidWidgetVariant.LOCK_THREE_WEEK -> ThreeWeekCalendarLockScreenWidgetProvider::class.java
      LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK -> NextThreeWeekCalendarLockScreenWidgetProvider::class.java
      LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS -> RoutineProgressLockScreenWidgetProvider::class.java
    }
}

private object LoofitAndroidWidgetRenderer {
  fun update(
    context: Context,
    manager: AppWidgetManager,
    ids: IntArray,
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
  ) {
    ids.forEach { id ->
      manager.updateAppWidget(id, views(context, variant, snapshot, manager.getAppWidgetOptions(id)))
    }
  }

  private fun views(
    context: Context,
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
    options: android.os.Bundle,
  ): RemoteViews {
    val layout = if (variant.isLockVariant()) {
      R.layout.loofit_widget_lock
    } else {
      R.layout.loofit_widget
    }
    val views = RemoteViews(context.packageName, layout)
    val theme = snapshot?.theme ?: LoofitWidgetTheme()
    views.setTextViewText(R.id.loofit_widget_brand, theme.brandName)
    views.setTextViewText(R.id.loofit_widget_label, variant.title)
    views.setTextColor(R.id.loofit_widget_brand, parseColor(theme.brandColor))
    views.setTextColor(R.id.loofit_widget_label, parseColor(theme.labelColor))
    views.setTextColor(R.id.loofit_widget_title, parseColor(theme.titleColor))
    views.setTextColor(R.id.loofit_widget_detail, parseColor(theme.detailColor))
    views.setTextColor(R.id.loofit_widget_stats, parseColor(theme.detailColor))
    views.setInt(R.id.loofit_widget_root, "setBackgroundColor", parseColor(theme.background))
    views.setOnClickPendingIntent(R.id.loofit_widget_root, openAppIntent(context))
    views.setViewVisibility(R.id.loofit_widget_timer, View.GONE)
    views.setViewVisibility(R.id.loofit_widget_action, View.GONE)
    views.setViewVisibility(R.id.loofit_widget_visual, View.GONE)
    views.setViewVisibility(R.id.loofit_widget_title, View.VISIBLE)

    if (snapshot == null) {
      views.setTextViewText(R.id.loofit_widget_title, "앱에서 루핏을 열어주세요")
      views.setTextViewText(R.id.loofit_widget_detail, "운동 기록을 불러오면 여기에 표시됩니다.")
      views.setTextViewText(R.id.loofit_widget_stats, "")
      return views
    }

    when (variant) {
      LoofitAndroidWidgetVariant.CONTROL,
      LoofitAndroidWidgetVariant.LOCK_WORKOUT -> bindControl(context, views, snapshot)
      LoofitAndroidWidgetVariant.ROUTINE_PROGRESS,
      LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS -> bindRoutine(views, variant, snapshot)
      LoofitAndroidWidgetVariant.BODY_PART_DURATION -> bindDurations(
        context,
        views,
        snapshot,
        options,
      )
      else -> bindHeatmap(context, views, variant, snapshot, options)
    }
    return views
  }

  private fun bindControl(
    context: Context,
    views: RemoteViews,
    snapshot: LoofitWorkoutSnapshot,
  ) {
    val active = snapshot.activeSession
    when {
      active != null -> {
        views.setTextViewText(R.id.loofit_widget_label, "운동 중")
        views.setTextViewText(R.id.loofit_widget_title, active.title)
        views.setTextViewText(R.id.loofit_widget_detail, active.detail)
        views.setTextViewText(R.id.loofit_widget_stats, "오늘 ${snapshot.completedToday.size}회 완료")
        views.setViewVisibility(R.id.loofit_widget_timer, View.VISIBLE)
        views.setChronometer(
          R.id.loofit_widget_timer,
          SystemClock.elapsedRealtime() - LoofitWorkoutDate.elapsedSeconds(active.startedAt) * 1_000,
          null,
          true,
        )
        views.setTextViewText(R.id.loofit_widget_action, "운동 종료")
        views.setViewVisibility(R.id.loofit_widget_action, View.VISIBLE)
        views.setOnClickPendingIntent(
          R.id.loofit_widget_action,
          commandIntent(context, "complete", active.id),
        )
      }
      snapshot.latestCompletedToday != null -> {
        val completed = snapshot.latestCompletedToday
        views.setTextViewText(R.id.loofit_widget_label, "오늘 운동 완료")
        views.setTextViewText(R.id.loofit_widget_title, completed.title)
        views.setTextViewText(R.id.loofit_widget_detail, formatDuration(completed.durationSeconds))
        views.setTextViewText(R.id.loofit_widget_stats, "오늘 ${snapshot.completedToday.size}회")
      }
      snapshot.nextWorkout != null -> {
        views.setTextViewText(R.id.loofit_widget_label, "다음 운동")
        views.setTextViewText(R.id.loofit_widget_title, snapshot.nextWorkout.title)
        views.setTextViewText(R.id.loofit_widget_detail, snapshot.nextWorkout.detail)
        views.setTextViewText(R.id.loofit_widget_stats, "")
        views.setTextViewText(R.id.loofit_widget_action, "운동 시작")
        views.setViewVisibility(R.id.loofit_widget_action, View.VISIBLE)
        views.setOnClickPendingIntent(R.id.loofit_widget_action, commandIntent(context, "startNext", null))
      }
      else -> {
        views.setTextViewText(R.id.loofit_widget_title, "루틴을 만들어주세요")
        views.setTextViewText(R.id.loofit_widget_detail, "앱에서 첫 운동을 설정할 수 있습니다.")
        views.setTextViewText(R.id.loofit_widget_stats, "")
      }
    }
  }

  private fun bindHeatmap(
    context: Context,
    views: RemoteViews,
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot,
    options: android.os.Bundle,
  ) {
    val days = when (variant) {
      LoofitAndroidWidgetVariant.HEATMAP_WEEK -> LoofitWidgetLayoutContract.Heatmap.weekRangeDays
      LoofitAndroidWidgetVariant.HEATMAP_MONTH,
      LoofitAndroidWidgetVariant.CURRENT_MONTH,
      LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED ->
        LoofitWidgetLayoutContract.Heatmap.monthRangeWeeks * LoofitWidgetLayoutContract.calendarColumns
      LoofitAndroidWidgetVariant.LOCK_THREE_WEEK,
      LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK -> 21
      else -> LoofitWidgetLayoutContract.Heatmap.sixMonthRangeMonths * 31
    }
    val values = snapshot.dailyCompleted.takeLast(days)
    val count = values.sumOf { it.workoutCount }
    val duration = values.sumOf { it.durationSeconds }
    val defaultWidth = if (variant == LoofitAndroidWidgetVariant.HEATMAP_SIX_MONTHS ||
      variant == LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED) 300 else 140
    val defaultHeight = if (variant.isLockVariant()) 70 else 112
    val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, defaultWidth)
      .coerceAtLeast(100)
    val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, defaultHeight)
      .minus(if (variant.isLockVariant()) 20 else 52)
      .coerceAtLeast(42)
    views.setImageViewBitmap(
      R.id.loofit_widget_visual,
      LoofitHeatmapBitmapRenderer.render(context, variant, snapshot, width, height),
    )
    views.setViewVisibility(R.id.loofit_widget_title, View.GONE)
    views.setViewVisibility(R.id.loofit_widget_visual, View.VISIBLE)
    views.setTextViewText(R.id.loofit_widget_detail, "$count 회 · 총 ${formatDuration(duration)}")
    views.setTextViewText(
      R.id.loofit_widget_stats,
      if (variant.isLockVariant()) "" else "내 루틴대로, 운동을 가볍게 기록하세요.",
    )
  }

  private fun bindRoutine(
    views: RemoteViews,
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot,
  ) {
    val progress = snapshot.routineProgress
    val items = progress?.items
      ?.centeredAround(progress.currentRoutineDayId, LoofitWidgetLayoutContract.RoutineProgress.visibleItemLimit)
      .orEmpty()
    if (items.isEmpty()) {
      views.setTextViewText(R.id.loofit_widget_title, "루틴을 만들어주세요")
      views.setTextViewText(R.id.loofit_widget_detail, "앱에서 첫 운동을 설정할 수 있습니다.")
      views.setTextViewText(R.id.loofit_widget_stats, "")
      return
    }

    if (variant == LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS) {
      val text = items.joinToString("   ") { item ->
        "${item.displayTitle()}\n${relativeDay(item.latestCompleted?.startedAt)}"
      }
      views.setTextViewText(R.id.loofit_widget_title, text)
      views.setTextViewText(R.id.loofit_widget_detail, "")
      views.setTextViewText(R.id.loofit_widget_stats, "")
      return
    }

    val text = SpannableStringBuilder()
    items.forEachIndexed { index, item ->
      if (index > 0) text.append('\n')
      val start = text.length
      val isCurrent = item.routineDayId == progress?.currentRoutineDayId
      val relative = relativeDay(item.latestCompleted?.startedAt)
      val parts = if (item.title.isBlank()) "" else item.parts.joinToString(" · ") { it.name }
      val duration = item.latestCompleted?.let { formatDuration(it.durationSeconds) }.orEmpty()
      val metadata = listOf(relative, parts, duration).filter(String::isNotBlank).joinToString(" · ")
      text.append(if (isCurrent) "● " else "○ ")
      text.append(item.displayTitle())
      if (metadata.isNotBlank()) text.append("\n   $metadata")
      text.setSpan(
        ForegroundColorSpan(
          parseColor(if (isCurrent) snapshot.theme.accent else snapshot.theme.detailColor),
        ),
        start,
        text.length,
        Spanned.SPAN_EXCLUSIVE_EXCLUSIVE,
      )
    }
    views.setTextViewText(R.id.loofit_widget_title, text)
    views.setTextViewText(R.id.loofit_widget_detail, "")
    views.setTextViewText(R.id.loofit_widget_stats, "")
  }

  private fun bindDurations(
    context: Context,
    views: RemoteViews,
    snapshot: LoofitWorkoutSnapshot,
    options: android.os.Bundle,
  ) {
    val rows = snapshot.bodyPartDurations.take(LoofitWidgetLayoutContract.BodyPartDuration.visibleItemLimit)
    if (rows.isEmpty()) {
      views.setTextViewText(R.id.loofit_widget_title, "아직 기록 없음")
      views.setTextViewText(R.id.loofit_widget_detail, "운동을 완료하면 부위별 시간이 표시됩니다.")
      views.setTextViewText(R.id.loofit_widget_stats, "")
      return
    }
    val width = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 140).coerceAtLeast(100)
    val height = options.getInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 112)
      .minus(48)
      .coerceAtLeast(60)
    views.setImageViewBitmap(
      R.id.loofit_widget_visual,
      LoofitDurationBitmapRenderer.render(context, snapshot, width, height),
    )
    views.setViewVisibility(R.id.loofit_widget_title, View.GONE)
    views.setViewVisibility(R.id.loofit_widget_visual, View.VISIBLE)
    views.setTextViewText(R.id.loofit_widget_detail, "완료한 운동의 전체 시간을 부위별로 합산합니다.")
    views.setTextViewText(R.id.loofit_widget_stats, "")
  }

  private fun parseColor(value: String): Int = runCatching { android.graphics.Color.parseColor(value) }
    .getOrDefault(android.graphics.Color.WHITE)

  private fun openAppIntent(context: Context): PendingIntent {
    val launch = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
    return PendingIntent.getActivity(
      context,
      7_001,
      launch,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun commandIntent(
    context: Context,
    command: String,
    expectedSessionId: Long?,
  ): PendingIntent {
    val intent = Intent(context, LoofitWorkoutActionReceiver::class.java)
      .setAction("${context.packageName}.LOOFIT_WORKOUT_COMMAND")
      .putExtra(LoofitWorkoutActionReceiver.EXTRA_COMMAND, command)
    if (expectedSessionId != null) {
      intent.putExtra(LoofitWorkoutActionReceiver.EXTRA_SESSION_ID, expectedSessionId)
    }
    return PendingIntent.getBroadcast(
      context,
      (command.hashCode() * 31 + (expectedSessionId ?: 0L).hashCode()),
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
  }

  private fun formatDuration(seconds: Int): String {
    val minutes = seconds / 60
    val hours = minutes / 60
    return if (hours > 0) "${hours}시간 ${minutes % 60}분" else "${minutes}분"
  }

  private fun relativeDay(startedAt: String?): String {
    val date = startedAt?.let(LoofitWorkoutDate::parse)
      ?.atZone(java.time.ZoneId.systemDefault())
      ?.toLocalDate()
      ?: return "아직 기록 없음"
    val days = java.time.temporal.ChronoUnit.DAYS.between(date, java.time.LocalDate.now())
    return when (days) {
      0L -> "오늘"
      1L -> "어제"
      else -> "${days.coerceAtLeast(0)}일 전"
    }
  }

  private fun LoofitRoutineProgressItemSnapshot.displayTitle(): String =
    title.trim().ifBlank { parts.joinToString(" · ") { it.name } }

  private fun List<LoofitRoutineProgressItemSnapshot>.centeredAround(
    currentId: Long?,
    limit: Int,
  ): List<LoofitRoutineProgressItemSnapshot> {
    if (size <= limit) return this
    val currentIndex = indexOfFirst { it.routineDayId == currentId }.coerceAtLeast(0)
    val start = (currentIndex - limit / 2).coerceIn(0, size - limit)
    return subList(start, start + limit)
  }

  private fun LoofitAndroidWidgetVariant.isLockVariant(): Boolean = when (this) {
    LoofitAndroidWidgetVariant.LOCK_WORKOUT,
    LoofitAndroidWidgetVariant.LOCK_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS -> true
    else -> false
  }
}
