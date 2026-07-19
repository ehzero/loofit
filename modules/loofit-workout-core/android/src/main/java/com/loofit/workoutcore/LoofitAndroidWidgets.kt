package com.loofit.workoutcore

import android.app.PendingIntent
import android.appwidget.AppWidgetManager
import android.appwidget.AppWidgetProvider
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.content.res.Configuration
import android.os.Build
import android.os.Bundle
import android.os.SystemClock
import android.util.SizeF
import android.util.TypedValue
import android.view.View
import android.widget.RemoteViews
import java.time.Duration
import java.time.Instant
import kotlin.math.max
import kotlin.math.roundToInt

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

  override fun onAppWidgetOptionsChanged(
    context: Context,
    appWidgetManager: AppWidgetManager,
    appWidgetId: Int,
    newOptions: Bundle,
  ) {
    super.onAppWidgetOptionsChanged(context, appWidgetManager, appWidgetId, newOptions)
    LoofitAndroidWidgetRenderer.update(
      context,
      appWidgetManager,
      intArrayOf(appWidgetId),
      variant,
      LoofitWorkoutSnapshotStore.load(context),
    )
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

internal object LoofitAndroidWidgetRenderer {
  fun update(
    context: Context,
    manager: AppWidgetManager,
    ids: IntArray,
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
  ) {
    ids.forEach { id ->
      manager.updateAppWidget(
        id,
        views(context, variant, snapshot, manager.getAppWidgetOptions(id)),
      )
    }
  }

  internal fun views(
    context: Context,
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
    options: Bundle = Bundle(),
  ): RemoteViews {
    val exactSizes = exactSizes(options)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S && exactSizes.isNotEmpty()) {
      return RemoteViews(
        exactSizes.associateWith { size ->
          views(context, variant, snapshot, viewport(variant, size))
        },
      )
    }

    return views(
      context,
      variant,
      snapshot,
      fallbackViewport(context.resources.configuration.orientation, variant, options),
    )
  }

  private fun views(
    context: Context,
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot?,
    viewport: LoofitWidgetViewport,
  ): RemoteViews {
    val plan = LoofitWidgetRenderPlanBuilder.build(variant, snapshot, viewport)
    return when (variant) {
      LoofitAndroidWidgetVariant.CONTROL -> homeControlViews(context, plan)
      LoofitAndroidWidgetVariant.LOCK_WORKOUT -> lockControlViews(context, plan)
      else -> staticViews(context, plan)
    }
  }

  private fun staticViews(context: Context, plan: LoofitWidgetRenderPlan): RemoteViews =
    RemoteViews(context.packageName, R.layout.loofit_widget_static).apply {
      setImageViewBitmap(R.id.loofit_widget_canvas, LoofitWidgetBitmapRenderer.render(context, plan))
      setOnClickPendingIntent(R.id.loofit_widget_root, openAppIntent(context))
    }

  private fun homeControlViews(
    context: Context,
    plan: LoofitWidgetRenderPlan,
  ): RemoteViews {
    val content = plan.content as LoofitControlRenderPlan
    val theme = plan.theme
    val views = RemoteViews(context.packageName, R.layout.loofit_widget_control)
    views.setImageViewBitmap(
      R.id.loofit_widget_background_image,
      LoofitWidgetBitmapRenderer.roundedRect(
        context,
        plan.viewport.widthDp,
        plan.viewport.heightDp,
        plan.cornerRadiusDp,
        plan.background,
      ),
    )
    val padding = dp(context, plan.contentPaddingDp)
    views.setViewPadding(R.id.loofit_widget_content, padding, padding, padding, padding)
    views.setOnClickPendingIntent(R.id.loofit_widget_root, openAppIntent(context))
    views.setTextViewText(R.id.loofit_widget_eyebrow, content.eyebrow)
    views.setTextColor(
      R.id.loofit_widget_eyebrow,
      LoofitWidgetBitmapRenderer.parseColor(
        if (content.state == LoofitControlState.ACTIVE) theme.accent else theme.detailColor,
      ),
    )
    val active = content.state == LoofitControlState.ACTIVE
    views.setViewVisibility(R.id.loofit_widget_active_dot, if (active) View.VISIBLE else View.GONE)
    if (active) {
      views.setInt(
        R.id.loofit_widget_active_dot,
        "setColorFilter",
        LoofitWidgetBitmapRenderer.parseColor(theme.accent),
      )
    }

    views.setTextViewText(R.id.loofit_widget_title, content.title)
    views.setTextColor(R.id.loofit_widget_title, LoofitWidgetBitmapRenderer.parseColor(theme.titleColor))
    views.setTextViewText(R.id.loofit_widget_detail, content.detail)
    views.setTextColor(R.id.loofit_widget_detail, LoofitWidgetBitmapRenderer.parseColor(theme.detailColor))
    views.setTextColor(R.id.loofit_widget_timer, LoofitWidgetBitmapRenderer.parseColor(theme.titleColor))
    views.setViewVisibility(R.id.loofit_widget_title, if (active) View.GONE else View.VISIBLE)
    views.setViewVisibility(R.id.loofit_widget_timer, if (active) View.VISIBLE else View.GONE)
    content.startedAt?.let { startedAt ->
      val elapsed = Duration.between(startedAt, Instant.now()).seconds.coerceAtLeast(0)
      views.setChronometer(
        R.id.loofit_widget_timer,
        SystemClock.elapsedRealtime() - elapsed * 1_000,
        null,
        true,
      )
    }

    val action = content.action
    views.setViewVisibility(R.id.loofit_widget_action, if (action != null) View.VISIBLE else View.GONE)
    views.setViewVisibility(
      R.id.loofit_widget_completed_footer,
      if (content.state == LoofitControlState.COMPLETED) View.VISIBLE else View.GONE,
    )
    if (action != null) {
      val innerWidth = max(1, (plan.viewport.widthDp - plan.contentPaddingDp * 2).roundToInt())
      views.setImageViewBitmap(
        R.id.loofit_widget_action_background,
        LoofitWidgetBitmapRenderer.roundedRect(
          context,
          innerWidth,
          LoofitWidgetLayoutContract.Control.buttonHeight.roundToInt(),
          LoofitWidgetLayoutContract.Control.buttonRadius,
          action.background,
        ),
      )
      views.setTextViewText(R.id.loofit_widget_action_label, action.label)
      views.setTextColor(
        R.id.loofit_widget_action_label,
        LoofitWidgetBitmapRenderer.parseColor(action.foreground),
      )
      views.setOnClickPendingIntent(
        R.id.loofit_widget_action,
        action.pendingIntent(context),
      )
    }
    views.setTextViewText(R.id.loofit_widget_duration, content.duration)
    views.setTextColor(R.id.loofit_widget_duration, LoofitWidgetBitmapRenderer.parseColor(theme.accent))
    views.setTextViewText(R.id.loofit_widget_range, content.timeRange)
    views.setTextColor(R.id.loofit_widget_range, LoofitWidgetBitmapRenderer.parseColor(theme.detailColor))
    applyControlTextSizes(views)
    return views
  }

  private fun lockControlViews(
    context: Context,
    plan: LoofitWidgetRenderPlan,
  ): RemoteViews {
    val content = plan.content as LoofitControlRenderPlan
    val views = RemoteViews(context.packageName, R.layout.loofit_widget_lock_control)
    val active = content.state == LoofitControlState.ACTIVE
    views.setViewVisibility(R.id.loofit_widget_title, if (active) View.GONE else View.VISIBLE)
    views.setViewVisibility(R.id.loofit_widget_timer, if (active) View.VISIBLE else View.GONE)
    views.setTextViewText(R.id.loofit_widget_title, content.title)
    views.setTextViewText(R.id.loofit_widget_detail, content.detail)
    content.startedAt?.let { startedAt ->
      val elapsed = Duration.between(startedAt, Instant.now()).seconds.coerceAtLeast(0)
      views.setChronometer(
        R.id.loofit_widget_timer,
        SystemClock.elapsedRealtime() - elapsed * 1_000,
        null,
        true,
      )
    }
    views.setOnClickPendingIntent(
      R.id.loofit_widget_root,
      content.action?.pendingIntent(context) ?: openAppIntent(context),
    )
    views.setTextViewTextSize(
      R.id.loofit_widget_title,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.LockScreen.rectangularTitleSize,
    )
    views.setTextViewTextSize(
      R.id.loofit_widget_timer,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.LockScreen.rectangularTitleSize,
    )
    views.setTextViewTextSize(
      R.id.loofit_widget_detail,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.LockScreen.rectangularDetailSize,
    )
    return views
  }

  private fun applyControlTextSizes(views: RemoteViews) {
    views.setTextViewTextSize(
      R.id.loofit_widget_eyebrow,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.Text.Label.size,
    )
    views.setTextViewTextSize(
      R.id.loofit_widget_title,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.Control.titleSize,
    )
    views.setTextViewTextSize(
      R.id.loofit_widget_timer,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.Control.timerSize,
    )
    views.setTextViewTextSize(
      R.id.loofit_widget_detail,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.Control.detailSize,
    )
    views.setTextViewTextSize(
      R.id.loofit_widget_action_label,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.Control.buttonTextSize,
    )
    views.setTextViewTextSize(
      R.id.loofit_widget_duration,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.Control.durationSize,
    )
    views.setTextViewTextSize(
      R.id.loofit_widget_range,
      TypedValue.COMPLEX_UNIT_SP,
      LoofitWidgetLayoutContract.Control.rangeSize,
    )
  }

  @Suppress("DEPRECATION")
  internal fun exactSizes(options: Bundle): List<SizeF> {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.S) return emptyList()
    return options.getParcelableArrayList<SizeF>(AppWidgetManager.OPTION_APPWIDGET_SIZES)
      .orEmpty()
      .asSequence()
      .filter { it.width > 0f && it.height > 0f }
      .distinctBy { it.width to it.height }
      .toList()
  }

  internal fun viewport(
    variant: LoofitAndroidWidgetVariant,
    size: SizeF,
  ): LoofitWidgetViewport = LoofitWidgetViewport(
    widthDp = size.width.roundToInt().coerceAtLeast(if (variant.isAccessory()) 120 else 72),
    heightDp = size.height.roundToInt().coerceAtLeast(if (variant.isAccessory()) 48 else 72),
  )

  internal fun fallbackViewport(
    orientation: Int,
    variant: LoofitAndroidWidgetVariant,
    options: Bundle,
  ): LoofitWidgetViewport {
    val fallback = variant.defaultViewport()
    val widthKey = if (orientation == Configuration.ORIENTATION_LANDSCAPE) {
      AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH
    } else {
      AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH
    }
    val heightKey = if (orientation == Configuration.ORIENTATION_LANDSCAPE) {
      AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT
    } else {
      AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT
    }
    val width = options.getInt(widthKey, fallback.width.roundToInt())
      .takeIf { it > 0 } ?: fallback.width.roundToInt()
    val height = options.getInt(heightKey, fallback.height.roundToInt())
      .takeIf { it > 0 } ?: fallback.height.roundToInt()
    return LoofitWidgetViewport(
      widthDp = width.coerceAtLeast(if (variant.isAccessory()) 120 else 72),
      heightDp = height.coerceAtLeast(if (variant.isAccessory()) 48 else 72),
    )
  }

  private fun LoofitAndroidWidgetVariant.defaultViewport(): LoofitWidgetViewportSpec = when (this) {
    LoofitAndroidWidgetVariant.HEATMAP_SIX_MONTHS,
    LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED ->
      LoofitWidgetLayoutContract.AndroidPlatform.PreviewViewports.homeMedium
    LoofitAndroidWidgetVariant.LOCK_WORKOUT,
    LoofitAndroidWidgetVariant.LOCK_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS ->
      LoofitWidgetLayoutContract.AndroidPlatform.PreviewViewports.accessoryRectangular
    else -> LoofitWidgetLayoutContract.AndroidPlatform.PreviewViewports.homeSmall
  }

  internal fun LoofitAndroidWidgetVariant.isAccessory(): Boolean = when (this) {
    LoofitAndroidWidgetVariant.LOCK_WORKOUT,
    LoofitAndroidWidgetVariant.LOCK_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS -> true
    else -> false
  }

  private fun LoofitWidgetActionPlan.pendingIntent(context: Context): PendingIntent =
    command?.let { commandIntent(context, it, expectedSessionId) } ?: openAppIntent(context)

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

  private fun dp(context: Context, value: Float): Int =
    TypedValue.applyDimension(
      TypedValue.COMPLEX_UNIT_DIP,
      value,
      context.resources.displayMetrics,
    ).roundToInt()
}
