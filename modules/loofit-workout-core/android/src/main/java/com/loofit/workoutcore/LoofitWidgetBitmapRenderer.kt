package com.loofit.workoutcore

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import android.graphics.Typeface
import android.text.TextPaint
import java.time.LocalDate
import kotlin.math.ceil
import kotlin.math.max
import kotlin.math.min

internal object LoofitWidgetBitmapRenderer {
  fun render(context: Context, plan: LoofitWidgetRenderPlan): Bitmap {
    val metrics = context.resources.displayMetrics
    val density = metrics.density
    val width = max(1, (plan.viewport.widthDp * density).toInt())
    val height = max(1, (plan.viewport.heightDp * density).toInt())
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    canvas.scale(density, density)
    val painter = Painter(canvas, context.resources.configuration.fontScale)
    painter.background(plan)
    when (val content = plan.content) {
      is LoofitHeatmapRenderPlan -> painter.heatmap(plan, content)
      is LoofitRoutineRenderPlan -> painter.routine(plan, content)
      is LoofitBodyPartDurationRenderPlan -> painter.bodyPartDuration(plan, content)
      is LoofitControlRenderPlan -> painter.controlPlaceholder(plan, content)
    }
    return bitmap
  }

  fun roundedRect(
    context: Context,
    widthDp: Int,
    heightDp: Int,
    radiusDp: Float,
    color: String,
  ): Bitmap {
    val density = context.resources.displayMetrics.density
    val bitmap = Bitmap.createBitmap(
      max(1, (widthDp * density).toInt()),
      max(1, (heightDp * density).toInt()),
      Bitmap.Config.ARGB_8888,
    )
    Canvas(bitmap).apply {
      scale(density, density)
      drawRoundRect(
        RectF(0f, 0f, widthDp.toFloat(), heightDp.toFloat()),
        radiusDp,
        radiusDp,
        Paint(Paint.ANTI_ALIAS_FLAG).apply { this.color = parseColor(color) },
      )
    }
    return bitmap
  }

  private class Painter(
    private val canvas: Canvas,
    private val fontScale: Float,
  ) {
    private val fill = Paint(Paint.ANTI_ALIAS_FLAG)

    fun background(plan: LoofitWidgetRenderPlan) {
      val color = parseColor(plan.background)
      if (Color.alpha(color) == 0) return
      fill.style = Paint.Style.FILL
      fill.color = color
      canvas.drawRoundRect(
        RectF(0f, 0f, plan.viewport.widthDp.toFloat(), plan.viewport.heightDp.toFloat()),
        plan.cornerRadiusDp,
        plan.cornerRadiusDp,
        fill,
      )
    }

    fun controlPlaceholder(plan: LoofitWidgetRenderPlan, content: LoofitControlRenderPlan) {
      // Dynamic control widgets use RemoteViews for their Chronometer and actions.
      // This path is intentionally useful for deterministic picker/golden rendering.
      val left = plan.contentPaddingDp
      val right = plan.viewport.widthDp - plan.contentPaddingDp
      val top = plan.contentPaddingDp
      val bottom = plan.viewport.heightDp - plan.contentPaddingDp
      val lock = plan.surface == LoofitWidgetSurface.ACCESSORY
      if (lock) {
        val blockHeight = LoofitWidgetLayoutContract.LockScreen.rectangularTitleLineHeight +
          LoofitWidgetLayoutContract.Spacing.xs +
          LoofitWidgetLayoutContract.LockScreen.rectangularDetailLineHeight
        val blockTop = top + ((bottom - top) - blockHeight) / 2
        val title = if (content.state == LoofitControlState.ACTIVE) content.elapsed else content.title
        drawTextLine(
          title,
          (left + right) / 2,
          blockTop,
          right - left,
          LoofitWidgetLayoutContract.LockScreen.rectangularTitleLineHeight,
          LoofitWidgetLayoutContract.LockScreen.rectangularTitleSize,
          LoofitWidgetLayoutContract.LockScreen.rectangularTitleWeight,
          Color.WHITE,
          Paint.Align.CENTER,
          minimumScale = LoofitWidgetLayoutContract.LockScreen.rectangularTitleMinimumScaleFactor,
        )
        drawTextLine(
          content.detail,
          (left + right) / 2,
          blockTop + LoofitWidgetLayoutContract.LockScreen.rectangularTitleLineHeight +
            LoofitWidgetLayoutContract.Spacing.xs,
          right - left,
          LoofitWidgetLayoutContract.LockScreen.rectangularDetailLineHeight,
          LoofitWidgetLayoutContract.LockScreen.rectangularDetailSize,
          LoofitWidgetLayoutContract.LockScreen.rectangularDetailWeight,
          withAlpha(Color.WHITE, 0.64f),
          Paint.Align.CENTER,
          minimumScale = LoofitWidgetLayoutContract.LockScreen.rectangularDetailMinimumScaleFactor,
        )
        return
      }

      val theme = plan.theme
      val eyebrowLeft = if (content.state == LoofitControlState.ACTIVE) {
        val radius = LoofitWidgetLayoutContract.Control.activeDotSize / 2
        fill.style = Paint.Style.FILL
        fill.color = parseColor(theme.accent)
        canvas.drawCircle(left + radius, top + LoofitWidgetLayoutContract.Text.Label.lineHeight / 2, radius, fill)
        left + LoofitWidgetLayoutContract.Control.activeDotSize +
          LoofitWidgetLayoutContract.Control.activeDotGap
      } else {
        left
      }
      drawTextLine(
        content.eyebrow,
        eyebrowLeft,
        top,
        right - left,
        LoofitWidgetLayoutContract.Text.Label.lineHeight,
        LoofitWidgetLayoutContract.Text.Label.size,
        LoofitWidgetLayoutContract.Text.Label.weight,
        parseColor(if (content.state == LoofitControlState.ACTIVE) theme.accent else theme.detailColor),
      )
      val bodyHeight = if (content.state == LoofitControlState.COMPLETED) {
        LoofitWidgetLayoutContract.Control.titleLineHeight + LoofitWidgetLayoutContract.Control.bodyGap +
          LoofitWidgetLayoutContract.Control.detailLineHeight
      } else {
        LoofitWidgetLayoutContract.Control.timerLineHeight + LoofitWidgetLayoutContract.Control.bodyGap +
          LoofitWidgetLayoutContract.Control.detailLineHeight
      }
      val actionHeight = if (content.action != null) LoofitWidgetLayoutContract.Control.buttonHeight else {
        LoofitWidgetLayoutContract.Control.durationLineHeight +
          LoofitWidgetLayoutContract.Control.footerGap + LoofitWidgetLayoutContract.Control.rangeLineHeight
      }
      val bodyTop = top + (bottom - top - bodyHeight - actionHeight) / 2f
      val mainText = when {
        content.state == LoofitControlState.ACTIVE -> content.elapsed
        else -> content.title
      }
      val mainSize = if (content.state == LoofitControlState.ACTIVE) {
        LoofitWidgetLayoutContract.Control.timerSize
      } else {
        LoofitWidgetLayoutContract.Control.titleSize
      }
      val mainLineHeight = if (content.state == LoofitControlState.ACTIVE) {
        LoofitWidgetLayoutContract.Control.timerLineHeight
      } else {
        LoofitWidgetLayoutContract.Control.titleLineHeight
      }
      drawTextLine(
        mainText,
        left,
        bodyTop,
        right - left,
        mainLineHeight,
        mainSize,
        LoofitWidgetLayoutContract.FontWeight.bold,
        parseColor(theme.titleColor),
        minimumScale = if (content.state == LoofitControlState.ACTIVE) {
          LoofitWidgetLayoutContract.Control.timerMinimumScaleFactor
        } else {
          LoofitWidgetLayoutContract.Control.titleMinimumScaleFactor
        },
      )
      drawTextLine(
        content.detail,
        left,
        bodyTop + mainLineHeight + LoofitWidgetLayoutContract.Control.bodyGap,
        right - left,
        LoofitWidgetLayoutContract.Control.detailLineHeight,
        LoofitWidgetLayoutContract.Control.detailSize,
        LoofitWidgetLayoutContract.Control.detailWeight,
        parseColor(theme.detailColor),
      )
      content.action?.let { action ->
        drawRoundedRect(
          left,
          bottom - LoofitWidgetLayoutContract.Control.buttonHeight,
          right,
          bottom,
          LoofitWidgetLayoutContract.Control.buttonRadius,
          parseColor(action.background),
        )
        drawTextLine(
          action.label,
          (left + right) / 2,
          bottom - LoofitWidgetLayoutContract.Control.buttonHeight,
          right - left,
          LoofitWidgetLayoutContract.Control.buttonHeight,
          LoofitWidgetLayoutContract.Control.buttonTextSize,
          LoofitWidgetLayoutContract.Control.buttonTextWeight,
          parseColor(action.foreground),
          Paint.Align.CENTER,
        )
      } ?: run {
        drawTextLine(
          content.duration,
          left,
          bottom - actionHeight,
          right - left,
          LoofitWidgetLayoutContract.Control.durationLineHeight,
          LoofitWidgetLayoutContract.Control.durationSize,
          LoofitWidgetLayoutContract.Control.durationWeight,
          parseColor(theme.accent),
        )
        drawTextLine(
          content.timeRange,
          left,
          bottom - LoofitWidgetLayoutContract.Control.rangeLineHeight,
          right - left,
          LoofitWidgetLayoutContract.Control.rangeLineHeight,
          LoofitWidgetLayoutContract.Control.rangeSize,
          LoofitWidgetLayoutContract.Control.rangeWeight,
          parseColor(theme.detailColor),
        )
      }
    }

    fun routine(plan: LoofitWidgetRenderPlan, content: LoofitRoutineRenderPlan) {
      val left = plan.contentPaddingDp
      val right = plan.viewport.widthDp - plan.contentPaddingDp
      val top = plan.contentPaddingDp
      val bottom = plan.viewport.heightDp - plan.contentPaddingDp
      if (content.items.isEmpty()) {
        drawTextLine(
          LoofitWidgetLayoutContract.LockScreen.routineRequired,
          (left + right) / 2,
          (top + bottom - LoofitWidgetLayoutContract.RoutineProgress.metadataLineHeight) / 2,
          right - left,
          LoofitWidgetLayoutContract.RoutineProgress.metadataLineHeight,
          LoofitWidgetLayoutContract.RoutineProgress.metadataSize,
          LoofitWidgetLayoutContract.RoutineProgress.metadataWeight,
          if (content.isLockScreen) withAlpha(Color.WHITE, 0.52f) else parseColor(plan.theme.heatmapWeekdayLabelColor),
          Paint.Align.CENTER,
        )
        return
      }
      if (content.isLockScreen) {
        drawLockRoutine(left, right, top, bottom, content)
      } else {
        drawHomeRoutine(left, right, top, bottom, plan, content)
      }
    }

    private fun drawHomeRoutine(
      left: Float,
      right: Float,
      top: Float,
      bottom: Float,
      plan: LoofitWidgetRenderPlan,
      content: LoofitRoutineRenderPlan,
    ) {
      val blockHeight = LoofitWidgetLayoutContract.RoutineProgress.splitLineHeight +
        LoofitWidgetLayoutContract.Spacing.xs +
        LoofitWidgetLayoutContract.RoutineProgress.metadataLineHeight
      val spacing = if (content.items.size > 1) {
        ((bottom - top) - blockHeight * content.items.size) / (content.items.size - 1)
      } else {
        0f
      }
      content.items.forEachIndexed { index, item ->
        val y = top + index * (blockHeight + spacing)
        val color = parseColor(
          if (item.isCurrent) plan.theme.accent else plan.theme.heatmapWeekdayLabelColor,
        )
        val relativeWidth = measureText(
          item.relativeDay,
          LoofitWidgetLayoutContract.RoutineProgress.metadataSize,
          LoofitWidgetLayoutContract.RoutineProgress.metadataWeight,
        )
        drawTextLine(
          item.title,
          left,
          y,
          max(0f, right - left - relativeWidth - LoofitWidgetLayoutContract.Spacing.sm),
          LoofitWidgetLayoutContract.RoutineProgress.splitLineHeight,
          LoofitWidgetLayoutContract.RoutineProgress.splitSize,
          LoofitWidgetLayoutContract.RoutineProgress.splitWeight,
          color,
        )
        drawTextLine(
          item.relativeDay,
          right,
          y,
          relativeWidth,
          LoofitWidgetLayoutContract.RoutineProgress.splitLineHeight,
          LoofitWidgetLayoutContract.RoutineProgress.metadataSize,
          LoofitWidgetLayoutContract.RoutineProgress.metadataWeight,
          color,
          Paint.Align.RIGHT,
        )
        drawTextLine(
          item.metadata,
          left,
          y + LoofitWidgetLayoutContract.RoutineProgress.splitLineHeight +
            LoofitWidgetLayoutContract.Spacing.xs,
          right - left,
          LoofitWidgetLayoutContract.RoutineProgress.metadataLineHeight,
          LoofitWidgetLayoutContract.RoutineProgress.metadataSize,
          LoofitWidgetLayoutContract.RoutineProgress.metadataWeight,
          color,
        )
      }
    }

    private fun drawLockRoutine(
      left: Float,
      right: Float,
      top: Float,
      bottom: Float,
      content: LoofitRoutineRenderPlan,
    ) {
      val gap = LoofitWidgetLayoutContract.RoutineProgress.LockScreen.columnGap
      val width = (right - left - gap * (content.items.size - 1)) / content.items.size
      val blockHeight = LoofitWidgetLayoutContract.RoutineProgress.LockScreen.workoutLineHeight +
        LoofitWidgetLayoutContract.RoutineProgress.LockScreen.itemGap +
        LoofitWidgetLayoutContract.RoutineProgress.LockScreen.relativeDayLineHeight
      val y = top + ((bottom - top) - blockHeight) / 2
      content.items.forEachIndexed { index, item ->
        val center = left + index * (width + gap) + width / 2
        val color = if (item.isCurrent) Color.WHITE else withAlpha(Color.WHITE, 0.52f)
        drawTextLine(
          item.title,
          center,
          y,
          width,
          LoofitWidgetLayoutContract.RoutineProgress.LockScreen.workoutLineHeight,
          LoofitWidgetLayoutContract.RoutineProgress.LockScreen.workoutSize,
          LoofitWidgetLayoutContract.RoutineProgress.LockScreen.workoutWeight,
          color,
          Paint.Align.CENTER,
        )
        drawTextLine(
          item.relativeDay,
          center,
          y + LoofitWidgetLayoutContract.RoutineProgress.LockScreen.workoutLineHeight +
            LoofitWidgetLayoutContract.RoutineProgress.LockScreen.itemGap,
          width,
          LoofitWidgetLayoutContract.RoutineProgress.LockScreen.relativeDayLineHeight,
          LoofitWidgetLayoutContract.RoutineProgress.LockScreen.relativeDaySize,
          LoofitWidgetLayoutContract.RoutineProgress.LockScreen.relativeDayWeight,
          color,
          Paint.Align.CENTER,
        )
      }
    }

    fun bodyPartDuration(
      plan: LoofitWidgetRenderPlan,
      content: LoofitBodyPartDurationRenderPlan,
    ) {
      val left = plan.contentPaddingDp
      val right = plan.viewport.widthDp - plan.contentPaddingDp
      val top = plan.contentPaddingDp
      val bottom = plan.viewport.heightDp - plan.contentPaddingDp
      drawTextLine(
        content.title,
        left,
        top,
        right - left,
        LoofitWidgetLayoutContract.BodyPartDuration.titleLineHeight,
        LoofitWidgetLayoutContract.BodyPartDuration.titleSize,
        LoofitWidgetLayoutContract.BodyPartDuration.titleWeight,
        parseColor(plan.theme.titleColor),
      )
      if (content.items.isEmpty()) {
        drawTextLine(
          LoofitWidgetLayoutContract.Heatmap.WeekFooter.emptyRecentLabel,
          (left + right) / 2,
          (top + bottom - LoofitWidgetLayoutContract.BodyPartDuration.bodyPartLineHeight) / 2,
          right - left,
          LoofitWidgetLayoutContract.BodyPartDuration.bodyPartLineHeight,
          LoofitWidgetLayoutContract.BodyPartDuration.bodyPartSize,
          LoofitWidgetLayoutContract.BodyPartDuration.bodyPartWeight,
          parseColor(plan.theme.heatmapWeekdayLabelColor),
          Paint.Align.CENTER,
        )
        return
      }
      val listTop = top + LoofitWidgetLayoutContract.BodyPartDuration.titleLineHeight +
        LoofitWidgetLayoutContract.Spacing.md
      val blockHeight = LoofitWidgetLayoutContract.BodyPartDuration.bodyPartLineHeight +
        LoofitWidgetLayoutContract.Spacing.xs +
        LoofitWidgetLayoutContract.BodyPartDuration.barHeight
      val spacing = if (content.items.size > 1) {
        ((bottom - listTop) - blockHeight * content.items.size) / (content.items.size - 1)
      } else {
        0f
      }
      content.items.forEachIndexed { index, item ->
        val y = listTop + index * (blockHeight + spacing)
        val durationWidth = measureText(
          item.duration,
          LoofitWidgetLayoutContract.BodyPartDuration.durationSize,
          LoofitWidgetLayoutContract.BodyPartDuration.durationWeight,
        )
        drawTextLine(
          item.title,
          left,
          y,
          max(0f, right - left - durationWidth - LoofitWidgetLayoutContract.Spacing.sm),
          LoofitWidgetLayoutContract.BodyPartDuration.bodyPartLineHeight,
          LoofitWidgetLayoutContract.BodyPartDuration.bodyPartSize,
          LoofitWidgetLayoutContract.BodyPartDuration.bodyPartWeight,
          parseColor(plan.theme.titleColor),
        )
        drawTextLine(
          item.duration,
          right,
          y,
          durationWidth,
          LoofitWidgetLayoutContract.BodyPartDuration.bodyPartLineHeight,
          LoofitWidgetLayoutContract.BodyPartDuration.durationSize,
          LoofitWidgetLayoutContract.BodyPartDuration.durationWeight,
          parseColor(plan.theme.detailColor),
          Paint.Align.RIGHT,
        )
        val barTop = y + LoofitWidgetLayoutContract.BodyPartDuration.bodyPartLineHeight +
          LoofitWidgetLayoutContract.Spacing.xs
        drawRoundedRect(
          left,
          barTop,
          right,
          barTop + LoofitWidgetLayoutContract.BodyPartDuration.barHeight,
          LoofitWidgetLayoutContract.BodyPartDuration.barRadius,
          parseColor(plan.theme.secondaryButtonBackground),
        )
        drawRoundedRect(
          left,
          barTop,
          left + (right - left) * item.fraction.coerceIn(0f, 1f),
          barTop + LoofitWidgetLayoutContract.BodyPartDuration.barHeight,
          LoofitWidgetLayoutContract.BodyPartDuration.barRadius,
          parseColor(plan.theme.accent),
        )
      }
    }

    fun heatmap(plan: LoofitWidgetRenderPlan, content: LoofitHeatmapRenderPlan) {
      when (content.kind) {
        LoofitHeatmapPlanKind.STANDARD -> {
          if (content.rendererSpec?.style == LoofitHeatmapStyle.COMPACT) {
            sixMonth(plan, content)
          } else {
            detailedHeatmap(plan, content)
          }
        }
        LoofitHeatmapPlanKind.CURRENT_MONTH -> currentMonth(plan, content)
        LoofitHeatmapPlanKind.FOUR_WEEK_EXPANDED -> expandedFourWeek(plan, content)
        LoofitHeatmapPlanKind.LOCK_SCREEN -> lockScreenHeatmap(plan, content)
      }
    }

    private fun detailedHeatmap(plan: LoofitWidgetRenderPlan, content: LoofitHeatmapRenderPlan) {
      val spec = requireNotNull(content.rendererSpec)
      val padding = plan.contentPaddingDp
      val rows = ceil(content.days.size / spec.columns.toFloat()).toInt().coerceAtLeast(1)
      val gap = spec.cellGap
      val innerWidth = plan.viewport.widthDp - padding * 2
      val widthCell = (innerWidth - gap * (spec.columns - 1)) / spec.columns
      val height = plan.viewport.heightDp - padding * 2 - spec.reservedHeaderHeight -
        spec.reservedFooterHeight - gap * rows
      val cell = max(0f, min(widthCell, height / (rows + LoofitWidgetLayoutContract.Heatmap.weekdayLabelHeightInCells)))
      val labels = if (spec.calendarAlignment == LoofitHeatmapCalendarAlignment.ROLLING_DAYS) {
        content.days.take(spec.columns).map { weekdayLabel(it.date) }
      } else {
        LoofitWidgetLayoutContract.Heatmap.weekdayLabels
      }
      drawWeekdays(
        labels = labels,
        left = padding,
        top = padding,
        cellWidth = cell,
        cellHeight = cell,
        gap = gap,
        theme = plan.theme,
      )
      val gridTop = padding + cell + gap
      content.days.forEachIndexed { index, day ->
        val row = index / spec.columns
        val column = index % spec.columns
        drawHomeHeatmapCell(
          day = day,
          left = padding + column * (cell + gap),
          top = gridTop + row * (cell + gap),
          width = cell,
          height = cell,
          radius = spec.cellRadius,
          labelSize = spec.cellLabelSize,
          labelMinimumScale = spec.cellLabelMinimumScaleFactor,
          theme = plan.theme,
          showLabel = true,
        )
      }
      val gridBottom = gridTop + rows * cell + (rows - 1) * gap
      when (spec.calendarAlignment) {
        LoofitHeatmapCalendarAlignment.ROLLING_DAYS -> weekFooter(plan, content, gridBottom)
        LoofitHeatmapCalendarAlignment.CALENDAR_WEEKS -> monthFooter(plan, content, gridBottom)
        else -> Unit
      }
    }

    private fun weekFooter(
      plan: LoofitWidgetRenderPlan,
      content: LoofitHeatmapRenderPlan,
      gridBottom: Float,
    ) {
      val left = plan.contentPaddingDp
      val right = plan.viewport.widthDp - plan.contentPaddingDp
      val bottom = plan.viewport.heightDp - plan.contentPaddingDp
      val footerHeight = max(0f, bottom - gridBottom)
      val topStatsHeight = LoofitWidgetLayoutContract.Heatmap.WeekFooter.statValueSize + 3f
      val averageHeight = topStatsHeight
      val recentRows = max(content.recent.size, 1)
      val recentHeight = LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentLabelSize + 2f +
        recentRows * LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentValueSize +
        (recentRows - 1) * LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentRowGap
      val fixed = topStatsHeight + averageHeight + recentHeight
      val spacer = max(0f, (footerHeight - fixed) / 3f)
      var y = gridBottom + spacer
      drawStat(content.stats.getOrNull(0), left, y, (right - left) * 0.36f, plan.theme)
      drawStat(
        content.stats.getOrNull(1),
        left + (right - left) * 0.36f + LoofitWidgetLayoutContract.Heatmap.WeekFooter.topRowGap,
        y,
        (right - left) * 0.64f - LoofitWidgetLayoutContract.Heatmap.WeekFooter.topRowGap,
        plan.theme,
      )
      y += topStatsHeight + spacer
      drawStat(content.stats.getOrNull(2), left, y, right - left, plan.theme)
      y += averageHeight + spacer
      drawTextLine(
        content.recentLabel,
        left,
        y,
        right - left,
        LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentLabelSize + 2f,
        LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentLabelSize,
        LoofitWidgetLayoutContract.FontWeight.bold,
        parseColor(plan.theme.heatmapBrandColor),
      )
      y += LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentLabelSize + 2f
      if (content.recent.isEmpty()) {
        drawTextLine(
          LoofitWidgetLayoutContract.Heatmap.WeekFooter.emptyRecentLabel,
          left,
          y,
          right - left,
          LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentValueSize,
          LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentValueSize,
          LoofitWidgetLayoutContract.FontWeight.bold,
          parseColor(plan.theme.heatmapFooterValueColor),
        )
      } else {
        content.recent.forEach { recent ->
          val metaWidth = measureText(
            recent.relativeDay,
            LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentMetaSize,
            LoofitWidgetLayoutContract.FontWeight.medium,
          )
          drawTextLine(
            recent.title,
            left,
            y,
            right - left - metaWidth - LoofitWidgetLayoutContract.Heatmap.WeekFooter.statGap,
            LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentValueSize,
            LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentValueSize,
            LoofitWidgetLayoutContract.FontWeight.bold,
            parseColor(plan.theme.heatmapFooterValueColor),
          )
          drawTextLine(
            recent.relativeDay,
            right,
            y,
            metaWidth,
            LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentValueSize,
            LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentMetaSize,
            LoofitWidgetLayoutContract.FontWeight.medium,
            parseColor(plan.theme.heatmapBrandColor),
            Paint.Align.RIGHT,
          )
          y += LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentValueSize +
            LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentRowGap
        }
      }
    }

    private fun drawStat(
      stat: Pair<String, String>?,
      left: Float,
      top: Float,
      width: Float,
      theme: LoofitWidgetTheme,
    ) {
      if (stat == null) return
      val labelWidth = measureText(
        stat.first,
        LoofitWidgetLayoutContract.Heatmap.WeekFooter.statLabelSize,
        LoofitWidgetLayoutContract.FontWeight.medium,
      )
      drawTextLine(
        stat.first,
        left,
        top,
        labelWidth,
        LoofitWidgetLayoutContract.Heatmap.WeekFooter.statValueSize + 3f,
        LoofitWidgetLayoutContract.Heatmap.WeekFooter.statLabelSize,
        LoofitWidgetLayoutContract.FontWeight.medium,
        parseColor(theme.heatmapBrandColor),
      )
      drawTextLine(
        stat.second,
        left + labelWidth + LoofitWidgetLayoutContract.Heatmap.WeekFooter.statGap,
        top,
        max(0f, width - labelWidth - LoofitWidgetLayoutContract.Heatmap.WeekFooter.statGap),
        LoofitWidgetLayoutContract.Heatmap.WeekFooter.statValueSize + 3f,
        LoofitWidgetLayoutContract.Heatmap.WeekFooter.statValueSize,
        LoofitWidgetLayoutContract.FontWeight.bold,
        parseColor(theme.heatmapFooterValueColor),
        minimumScale = LoofitWidgetLayoutContract.Heatmap.WeekFooter.statValueMinimumScale,
      )
    }

    private fun monthFooter(
      plan: LoofitWidgetRenderPlan,
      content: LoofitHeatmapRenderPlan,
      gridBottom: Float,
    ) {
      val value = "${content.count}회${LoofitWidgetLayoutContract.Heatmap.MonthFooter.separator}" +
        "${LoofitWidgetLayoutContract.Heatmap.MonthFooter.totalDurationPrefix}" +
        LoofitWidgetRenderPlanBuilder.formatDuration(content.durationSeconds)
      val bottom = plan.viewport.heightDp - plan.contentPaddingDp
      val lineHeight = LoofitWidgetLayoutContract.Text.Brand.lineHeight
      drawTextLine(
        value,
        plan.contentPaddingDp,
        gridBottom + max(0f, (bottom - gridBottom - lineHeight) / 2),
        plan.viewport.widthDp - plan.contentPaddingDp * 2,
        lineHeight,
        LoofitWidgetLayoutContract.Heatmap.year.headerFontSize,
        LoofitWidgetLayoutContract.FontWeight.light,
        withAlpha(parseColor(plan.theme.detailColor), LoofitWidgetLayoutContract.Opacity.muted),
        minimumScale = LoofitWidgetLayoutContract.MinimumScale.dense,
      )
    }

    private fun currentMonth(plan: LoofitWidgetRenderPlan, content: LoofitHeatmapRenderPlan) {
      val padding = plan.contentPaddingDp
      val gap = LoofitWidgetLayoutContract.CurrentMonth.cellGap
      val columns = LoofitWidgetLayoutContract.calendarColumns
      val rows = ceil(content.days.size / columns.toFloat()).toInt().coerceAtLeast(1)
      val widthCell = (plan.viewport.widthDp - padding * 2 - gap * (columns - 1)) / columns
      val headerHeight = LoofitWidgetLayoutContract.CurrentMonth.headerLineHeight
      val gridHeight = plan.viewport.heightDp - padding * 2 - headerHeight -
        LoofitWidgetLayoutContract.CurrentMonth.headerGap - gap * rows
      val cell = max(0f, min(widthCell, gridHeight / (rows + 1)))
      drawTextLine(
        content.title,
        padding,
        padding,
        plan.viewport.widthDp - padding * 2,
        headerHeight,
        LoofitWidgetLayoutContract.CurrentMonth.headerFontSize,
        LoofitWidgetLayoutContract.FontWeight.medium,
        parseColor(plan.theme.detailColor),
        minimumScale = LoofitWidgetLayoutContract.CurrentMonth.headerMinimumScaleFactor,
      )
      val weekdayTop = padding + headerHeight + LoofitWidgetLayoutContract.CurrentMonth.headerGap
      drawWeekdays(
        LoofitWidgetLayoutContract.Heatmap.weekdayLabels,
        padding,
        weekdayTop,
        cell,
        cell,
        gap,
        plan.theme,
      )
      val gridTop = weekdayTop + cell + gap
      content.days.forEachIndexed { index, day ->
        val row = index / columns
        val column = index % columns
        val left = padding + column * (cell + gap)
        val top = gridTop + row * (cell + gap)
        val outside = !day.inRange
        if (!outside) {
          drawHomeHeatmapCell(
            day,
            left,
            top,
            cell,
            cell,
            LoofitWidgetLayoutContract.CurrentMonth.cellRadius,
            LoofitWidgetLayoutContract.CurrentMonth.cellLabelSize,
            LoofitWidgetLayoutContract.CurrentMonth.cellLabelMinimumScaleFactor,
            plan.theme,
            showLabel = true,
            today = day.date == content.today,
            todayWidth = LoofitWidgetLayoutContract.CurrentMonth.todayIndicatorWidth,
          )
        } else if (LoofitWidgetLayoutContract.CurrentMonth.outsideMonthDateLabelOnly) {
          drawTextLine(
            day.date.dayOfMonth.toString(),
            left + cell / 2,
            top,
            cell,
            cell,
            LoofitWidgetLayoutContract.CurrentMonth.cellLabelSize,
            LoofitWidgetLayoutContract.FontWeight.bold,
            parseColor(plan.theme.heatmapWeekdayLabelColor),
            Paint.Align.CENTER,
            minimumScale = LoofitWidgetLayoutContract.CurrentMonth.cellLabelMinimumScaleFactor,
          )
        }
      }
    }

    private fun expandedFourWeek(plan: LoofitWidgetRenderPlan, content: LoofitHeatmapRenderPlan) {
      val padding = plan.contentPaddingDp
      val spec = LoofitWidgetLayoutContract.FourWeekExpanded
      val rows = ceil(content.days.size / spec.columns.toFloat()).toInt().coerceAtLeast(1)
      val width = plan.viewport.widthDp - padding * 2 - spec.cellGap * (spec.columns - 1)
      val cellWidth = width / spec.columns
      val cellHeight = max(
        0f,
        plan.viewport.heightDp - padding * 2 - spec.weekdayHeaderHeight - spec.cellGap * rows,
      ) / rows
      drawWeekdays(
        LoofitWidgetLayoutContract.Heatmap.weekdayLabels,
        padding,
        padding,
        cellWidth,
        spec.weekdayHeaderHeight,
        spec.cellGap,
        plan.theme,
      )
      val gridTop = padding + spec.weekdayHeaderHeight + spec.cellGap
      content.days.forEachIndexed { index, day ->
        val row = index / spec.columns
        val column = index % spec.columns
        val left = padding + column * (cellWidth + spec.cellGap)
        val top = gridTop + row * (cellHeight + spec.cellGap)
        val color = heatmapFill(plan.theme, day)
        drawRoundedRect(left, top, left + cellWidth, top + cellHeight, spec.cellRadius, color)
        val labelColor = heatmapLabelColor(plan.theme, day)
        val names = content.bodyPartsByDate[day.dateKey].orEmpty()
          .joinToString(spec.bodyPartSeparator)
        val contentHeight = spec.cellLabelLineHeight + if (names.isBlank()) 0f else {
          spec.cellContentGap + spec.bodyPartLabelLineHeight
        }
        val contentTop = top + (cellHeight - contentHeight) / 2
        drawTextLine(
          day.date.dayOfMonth.toString(),
          left + cellWidth / 2,
          contentTop,
          cellWidth,
          spec.cellLabelLineHeight,
          spec.cellLabelSize,
          LoofitWidgetLayoutContract.FontWeight.bold,
          labelColor,
          Paint.Align.CENTER,
          minimumScale = spec.cellLabelMinimumScaleFactor,
        )
        if (names.isNotBlank()) {
          drawTextLine(
            names,
            left + cellWidth / 2,
            contentTop + spec.cellLabelLineHeight + spec.cellContentGap,
            max(0f, cellWidth - 2f),
            spec.bodyPartLabelLineHeight,
            spec.bodyPartLabelSize,
            LoofitWidgetLayoutContract.FontWeight.medium,
            withAlpha(labelColor, spec.bodyPartLabelOpacity),
            Paint.Align.CENTER,
          )
        }
      }
    }

    private data class SixMonthSlot(
      val day: LoofitHeatmapDayPlan?,
      val gap: Boolean,
    )

    private data class SixMonthColumn(
      val slots: List<SixMonthSlot>,
      val monthLabel: String,
    )

    private fun sixMonth(plan: LoofitWidgetRenderPlan, content: LoofitHeatmapRenderPlan) {
      val spec = requireNotNull(content.rendererSpec)
      val columns = sixMonthColumns(content.days)
      val padding = plan.contentPaddingDp
      val gap = spec.cellGap
      val rows = LoofitWidgetLayoutContract.calendarColumns
      val width = plan.viewport.widthDp - padding * 2 - gap * max(columns.size - 1, 0)
      val height = plan.viewport.heightDp - padding * 2 - spec.reservedHeaderHeight -
        gap * (rows - 1) - LoofitWidgetLayoutContract.Heatmap.SixMonth.monthHeaderBottomGap
      val cell = max(0f, min(width / max(columns.size, 1), height / rows))
      drawTextLine(
        content.title,
        padding,
        padding,
        plan.viewport.widthDp - padding * 2,
        spec.headerLineHeight,
        spec.headerFontSize,
        LoofitWidgetLayoutContract.FontWeight.medium,
        parseColor(plan.theme.detailColor),
        minimumScale = spec.headerMinimumScaleFactor,
      )
      val gridTop = padding + spec.reservedHeaderHeight
      columns.forEachIndexed { columnIndex, column ->
        val left = padding + columnIndex * (cell + gap)
        drawTextLine(
          column.monthLabel,
          left,
          gridTop,
          max(cell, measureText(
            column.monthLabel,
            LoofitWidgetLayoutContract.Heatmap.SixMonth.monthLabelSize,
            LoofitWidgetLayoutContract.FontWeight.bold,
          )),
          LoofitWidgetLayoutContract.Heatmap.SixMonth.monthLabelHeight,
          LoofitWidgetLayoutContract.Heatmap.SixMonth.monthLabelSize,
          LoofitWidgetLayoutContract.FontWeight.bold,
          parseColor(plan.theme.heatmapWeekdayLabelColor),
        )
        val cellsTop = gridTop + LoofitWidgetLayoutContract.Heatmap.SixMonth.monthLabelHeight +
          LoofitWidgetLayoutContract.Heatmap.SixMonth.monthHeaderBottomGap
        column.slots.forEachIndexed { rowIndex, slot ->
          if (!slot.gap && slot.day != null) {
            drawRoundedRect(
              left,
              cellsTop + rowIndex * (cell + gap),
              left + cell,
              cellsTop + rowIndex * (cell + gap) + cell,
              spec.cellRadius,
              heatmapFill(
                plan.theme,
                slot.day,
                showLeadingCalendarCells = spec.showLeadingCalendarCells,
              ),
            )
          }
        }
      }
    }

    private fun sixMonthColumns(days: List<LoofitHeatmapDayPlan>): List<SixMonthColumn> {
      val slots = mutableListOf<SixMonthSlot>()
      var hasSeenFirstMonth = false
      days.forEach { day ->
        val monthStart = day.inRange && day.date.dayOfMonth == 1
        if (monthStart) {
          if (hasSeenFirstMonth) {
            repeat(LoofitWidgetLayoutContract.Heatmap.monthBoundaryGapSlots) {
              slots += SixMonthSlot(day = null, gap = true)
            }
          } else {
            hasSeenFirstMonth = true
          }
        }
        slots += SixMonthSlot(day = day, gap = false)
      }
      val columns = slots.chunked(LoofitWidgetLayoutContract.calendarColumns)
      val labels = MutableList(columns.size) { "" }
      columns.forEachIndexed { columnIndex, column ->
        val monthIndex = column.indexOfFirst { it.day?.inRange == true && it.day.date.dayOfMonth == 1 }
        if (monthIndex >= 0) {
          val target = if (monthIndex == 0 || columnIndex + 1 >= columns.size) {
            columnIndex
          } else {
            columnIndex + 1
          }
          labels[target] = "${column[monthIndex].day!!.date.monthValue}월"
        }
      }
      return columns.mapIndexed { index, column -> SixMonthColumn(column, labels[index]) }
    }

    private fun lockScreenHeatmap(plan: LoofitWidgetRenderPlan, content: LoofitHeatmapRenderPlan) {
      val spec = LoofitWidgetLayoutContract.LockScreen.ThreeWeekCalendar
      val padding = plan.contentPaddingDp
      val rows = ceil(content.days.size / spec.columns.toFloat()).toInt().coerceAtLeast(1)
      val width = plan.viewport.widthDp - padding * 2 - spec.cellGap * (spec.columns - 1)
      val cellWidth = width / spec.columns
      val gridHeight = plan.viewport.heightDp - padding * 2 - spec.weekdayLabelLineHeight -
        spec.cellGap * rows
      val cellHeight = max(0f, gridHeight / rows)
      LoofitWidgetLayoutContract.Heatmap.weekdayLabels.forEachIndexed { index, label ->
        val color = if (spec.dimmedWeekdayLabels.contains(label)) {
          withAlpha(Color.WHITE, spec.dimmedWeekdayOpacity)
        } else {
          Color.WHITE
        }
        drawTextLine(
          label,
          padding + index * (cellWidth + spec.cellGap) + cellWidth / 2,
          padding,
          cellWidth,
          spec.weekdayLabelLineHeight,
          spec.weekdayLabelSize,
          LoofitWidgetLayoutContract.FontWeight.bold,
          color,
          Paint.Align.CENTER,
        )
      }
      val gridTop = padding + spec.weekdayLabelLineHeight + spec.cellGap
      content.days.forEachIndexed { index, day ->
        val row = index / spec.columns
        val column = index % spec.columns
        val left = padding + column * (cellWidth + spec.cellGap)
        val top = gridTop + row * (cellHeight + spec.cellGap)
        val level = heatLevel(day.durationSeconds)
        if (level > 0) {
          val opacity = spec.bucketOpacities[(level - 1).coerceAtMost(spec.bucketOpacities.lastIndex)]
          drawRoundedRect(
            left,
            top,
            left + cellWidth,
            top + cellHeight,
            spec.cellRadius,
            withAlpha(Color.WHITE, opacity),
          )
        }
        if (day.date == content.today) {
          strokeRoundedRect(
            left,
            top,
            left + cellWidth,
            top + cellHeight,
            spec.cellRadius,
            spec.todayIndicatorWidth,
            parseColor(spec.todayIndicatorColor),
          )
        }
        drawTextLine(
          day.date.dayOfMonth.toString(),
          left + cellWidth / 2,
          top,
          cellWidth,
          cellHeight,
          spec.cellLabelSize,
          LoofitWidgetLayoutContract.FontWeight.bold,
          if (level >= LoofitWidgetLayoutContract.Heatmap.strongCellLabelMinimumBucket) Color.BLACK else Color.WHITE,
          Paint.Align.CENTER,
          minimumScale = spec.cellLabelMinimumScaleFactor,
        )
      }
    }

    private fun drawWeekdays(
      labels: List<String>,
      left: Float,
      top: Float,
      cellWidth: Float,
      cellHeight: Float,
      gap: Float,
      theme: LoofitWidgetTheme,
    ) {
      labels.forEachIndexed { index, label ->
        val color = if (LoofitWidgetLayoutContract.Heatmap.weekendWeekdayLabels.contains(label)) {
          parseColor(theme.heatmapWeekendLabelColor)
        } else {
          parseColor(theme.heatmapWeekdayLabelColor)
        }
        drawTextLine(
          label,
          left + index * (cellWidth + gap) + cellWidth / 2,
          top,
          cellWidth,
          cellHeight,
          LoofitWidgetLayoutContract.Text.Calendar.weekdaySize,
          LoofitWidgetLayoutContract.Text.Calendar.weekdayWeight,
          color,
          Paint.Align.CENTER,
        )
      }
    }

    private fun drawHomeHeatmapCell(
      day: LoofitHeatmapDayPlan,
      left: Float,
      top: Float,
      width: Float,
      height: Float,
      radius: Float,
      labelSize: Float,
      labelMinimumScale: Float,
      theme: LoofitWidgetTheme,
      showLabel: Boolean,
      today: Boolean = false,
      todayWidth: Float = 0f,
    ) {
      val fillColor = heatmapFill(theme, day)
      if (Color.alpha(fillColor) > 0) {
        drawRoundedRect(left, top, left + width, top + height, radius, fillColor)
      }
      if (today) {
        strokeRoundedRect(
          left,
          top,
          left + width,
          top + height,
          radius,
          todayWidth,
          parseColor(theme.todayIndicatorColor),
        )
      }
      if (showLabel) {
        drawTextLine(
          day.date.dayOfMonth.toString(),
          left + width / 2,
          top,
          width,
          height,
          labelSize,
          LoofitWidgetLayoutContract.FontWeight.bold,
          heatmapLabelColor(theme, day),
          Paint.Align.CENTER,
          minimumScale = labelMinimumScale,
        )
      }
    }

    private fun heatmapFill(
      theme: LoofitWidgetTheme,
      day: LoofitHeatmapDayPlan,
      showLeadingCalendarCells: Boolean = false,
    ): Int {
      if (!day.inRange) {
        return parseColor(if (showLeadingCalendarCells) theme.heatmapEmptyColor else theme.heatmapGapColor)
      }
      val level = heatLevel(day.durationSeconds)
      if (level == 0) return parseColor(theme.heatmapEmptyColor)
      val weight = LoofitWidgetLayoutContract.Heatmap.bucketAccentWeights[level - 1]
      return mixColor(parseColor(theme.accent), parseColor(theme.heatmapBaseColor), weight)
    }

    private fun heatmapLabelColor(theme: LoofitWidgetTheme, day: LoofitHeatmapDayPlan): Int = when {
      day.durationSeconds >= LoofitWidgetLayoutContract.Heatmap.strongCellLabelMinimumDurationSeconds ->
        parseColor(theme.accentText)
      day.durationSeconds > 0 -> parseColor(theme.titleColor)
      else -> parseColor(theme.heatmapWeekdayLabelColor)
    }

    private fun drawRoundedRect(
      left: Float,
      top: Float,
      right: Float,
      bottom: Float,
      radius: Float,
      color: Int,
    ) {
      if (right <= left || bottom <= top || Color.alpha(color) == 0) return
      fill.style = Paint.Style.FILL
      fill.color = color
      canvas.drawRoundRect(RectF(left, top, right, bottom), radius, radius, fill)
    }

    private fun strokeRoundedRect(
      left: Float,
      top: Float,
      right: Float,
      bottom: Float,
      radius: Float,
      width: Float,
      color: Int,
    ) {
      if (width <= 0f) return
      fill.style = Paint.Style.STROKE
      fill.strokeWidth = width
      fill.color = color
      val inset = width / 2
      canvas.drawRoundRect(
        RectF(left + inset, top + inset, right - inset, bottom - inset),
        radius,
        radius,
        fill,
      )
      fill.style = Paint.Style.FILL
    }

    private fun drawTextLine(
      value: String,
      x: Float,
      top: Float,
      maxWidth: Float,
      lineHeight: Float,
      size: Float,
      weight: Int,
      color: Int,
      align: Paint.Align = Paint.Align.LEFT,
      minimumScale: Float = 1f,
    ) {
      if (value.isBlank() || maxWidth <= 0f || lineHeight <= 0f || size <= 0f) return
      val paint = textPaint(size, weight, color, align)
      val measuredWidth = paint.measureText(value)
      if (measuredWidth > maxWidth && minimumScale < 1f) {
        val fittedScale = (maxWidth / measuredWidth).coerceIn(minimumScale, 1f)
        paint.textSize *= fittedScale
      }
      val text = ellipsize(value, paint, maxWidth)
      val metrics = paint.fontMetrics
      val baseline = top + (lineHeight - (metrics.descent + metrics.ascent)) / 2f
      canvas.drawText(text, x, baseline, paint)
    }

    private fun measureText(value: String, size: Float, weight: Int): Float =
      textPaint(size, weight, Color.WHITE, Paint.Align.LEFT).measureText(value)

    private fun textPaint(
      size: Float,
      weight: Int,
      color: Int,
      align: Paint.Align,
    ): TextPaint = TextPaint(Paint.ANTI_ALIAS_FLAG).apply {
      this.textSize = size * fontScale
      this.color = color
      textAlign = align
      typeface = if (weight >= 700) Typeface.DEFAULT_BOLD else Typeface.DEFAULT
    }

    private fun ellipsize(value: String, paint: Paint, maxWidth: Float): String {
      if (paint.measureText(value) <= maxWidth) return value
      val ellipsis = "…"
      var low = 0
      var high = value.length
      while (low < high) {
        val middle = (low + high + 1) / 2
        if (paint.measureText(value.substring(0, middle) + ellipsis) <= maxWidth) {
          low = middle
        } else {
          high = middle - 1
        }
      }
      return value.substring(0, low) + ellipsis
    }

    private fun weekdayLabel(date: LocalDate): String =
      LoofitWidgetLayoutContract.Heatmap.weekdayLabels[date.dayOfWeek.value % 7]
  }

  private fun heatLevel(durationSeconds: Int): Int {
    if (durationSeconds <= 0) return 0
    LoofitWidgetLayoutContract.Heatmap.bucketThresholdSeconds.forEachIndexed { index, threshold ->
      if (durationSeconds < threshold) return index + 1
    }
    return LoofitWidgetLayoutContract.Heatmap.bucketAccentWeights.size
  }

  private fun mixColor(first: Int, second: Int, weight: Float): Int {
    val clamped = weight.coerceIn(0f, 1f)
    return Color.argb(
      (Color.alpha(first) * clamped + Color.alpha(second) * (1 - clamped)).toInt(),
      (Color.red(first) * clamped + Color.red(second) * (1 - clamped)).toInt(),
      (Color.green(first) * clamped + Color.green(second) * (1 - clamped)).toInt(),
      (Color.blue(first) * clamped + Color.blue(second) * (1 - clamped)).toInt(),
    )
  }

  private fun withAlpha(color: Int, opacity: Float): Int =
    Color.argb((Color.alpha(color) * opacity.coerceIn(0f, 1f)).toInt(), Color.red(color), Color.green(color), Color.blue(color))

  internal fun parseColor(value: String): Int = runCatching { Color.parseColor(value) }
    .getOrDefault(Color.TRANSPARENT)
}
