package com.loofit.workoutcore

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.YearMonth
import java.time.temporal.ChronoUnit
import kotlin.math.floor
import kotlin.math.max
import kotlin.math.min

internal object LoofitHeatmapBitmapRenderer {
  fun render(
    context: Context,
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot,
    widthDp: Int,
    heightDp: Int,
  ): Bitmap {
    val density = context.resources.displayMetrics.density
    val width = max(1, (widthDp * density).toInt())
    val height = max(1, (heightDp * density).toInt())
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val values = snapshot.dailyCompleted.associateBy { LocalDate.parse(it.dateKey) }
    val details = snapshot.dailyDetails.associateBy { LocalDate.parse(it.dateKey) }
    val theme = snapshot.theme
    val today = LocalDate.now()

    if (variant == LoofitAndroidWidgetVariant.HEATMAP_SIX_MONTHS) {
      renderSixMonths(canvas, width, height, today, values, theme, density)
      return bitmap
    }

    val range = dateRange(variant, today)
    val columns = LoofitWidgetLayoutContract.calendarColumns
    val rows = max(1, (range.size + columns - 1) / columns)
    val weekdayHeight = if (variant.isLockScreen()) 13f * density else 15f * density
    val gap = if (variant.isLockScreen()) 2f * density else 3f * density
    val cellWidth = (width - gap * (columns - 1)) / columns
    val cellHeight = (height - weekdayHeight - gap * rows) / rows
    val size = min(cellWidth, cellHeight).coerceAtLeast(2f * density)
    val xOffset = (width - (size * columns + gap * (columns - 1))) / 2f
    val yOffset = weekdayHeight + gap
    val labelPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textAlign = Paint.Align.CENTER
      textSize = if (variant.isLockScreen()) 8f * density else 9f * density
      typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val labels = listOf("일", "월", "화", "수", "목", "금", "토")
    labels.forEachIndexed { index, label ->
      labelPaint.color = parseColor(
        if (index == 0 || index == 6) theme.heatmapWeekendLabelColor
        else theme.heatmapWeekdayLabelColor,
      )
      if (variant.isLockScreen() && (index == 0 || index == 6)) labelPaint.alpha = 160
      canvas.drawText(
        label,
        xOffset + index * (size + gap) + size / 2f,
        weekdayHeight - 2f * density,
        labelPaint,
      )
      labelPaint.alpha = 255
    }

    val cellPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    val dayPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textAlign = Paint.Align.CENTER
      textSize = if (variant == LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED) {
        min(9f * density, size * 0.28f)
      } else {
        min(10f * density, size * 0.36f)
      }
      typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val detailPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      textAlign = Paint.Align.CENTER
      textSize = min(7f * density, size * 0.2f)
    }
    val radius = min(5f * density, size * 0.24f)
    range.forEachIndexed { index, date ->
      val row = index / columns
      val column = index % columns
      val left = xOffset + column * (size + gap)
      val top = yOffset + row * (size + gap)
      val rect = RectF(left, top, left + size, top + size)
      val aggregate = values[date]
      val isFuture = date > today
      val isOutsideMonth = variant == LoofitAndroidWidgetVariant.CURRENT_MONTH &&
        date.month != today.month
      val fill = when {
        isFuture || isOutsideMonth -> Color.TRANSPARENT
        aggregate == null || aggregate.durationSeconds <= 0 -> parseColor(theme.heatmapEmptyColor)
        else -> bucketColor(theme.accent, aggregate.durationSeconds)
      }
      if (Color.alpha(fill) > 0) {
        cellPaint.style = Paint.Style.FILL
        cellPaint.color = fill
        canvas.drawRoundRect(rect, radius, radius, cellPaint)
      }

      if (!variant.hidesDayLabels()) {
        dayPaint.color = when {
          isOutsideMonth -> parseColor(theme.heatmapDayLabelColor)
          aggregate == null || aggregate.durationSeconds <= 0 -> parseColor(theme.heatmapDayLabelColor)
          aggregate.durationSeconds >= 3_600 -> parseColor(theme.accentText)
          else -> parseColor(theme.titleColor)
        }
        val dayY = if (variant == LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED) {
          top + size * 0.38f
        } else {
          top + size / 2f - (dayPaint.ascent() + dayPaint.descent()) / 2f
        }
        canvas.drawText(date.dayOfMonth.toString(), left + size / 2f, dayY, dayPaint)
      }

      if (variant == LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED) {
        val bodyParts = details[date]?.bodyPartNames.orEmpty().joinToString("·")
        if (bodyParts.isNotBlank()) {
          detailPaint.color = if ((aggregate?.durationSeconds ?: 0) >= 3_600) {
            parseColor(theme.accentText)
          } else {
            parseColor(theme.titleColor)
          }
          canvas.drawText(
            ellipsize(bodyParts, detailPaint, size - 3f * density),
            left + size / 2f,
            top + size * 0.76f,
            detailPaint,
          )
        }
      }

      if (date == today) {
        cellPaint.style = Paint.Style.STROKE
        cellPaint.strokeWidth = max(1.5f * density, size * 0.06f)
        cellPaint.color = parseColor(theme.todayIndicatorColor)
        canvas.drawRoundRect(rect, radius, radius, cellPaint)
      }
    }
    return bitmap
  }

  private fun renderSixMonths(
    canvas: Canvas,
    width: Int,
    height: Int,
    today: LocalDate,
    values: Map<LocalDate, LoofitWorkoutDailyAggregate>,
    theme: LoofitWidgetTheme,
    density: Float,
  ) {
    val monthStart = YearMonth.from(today)
      .minusMonths((LoofitWidgetLayoutContract.Heatmap.sixMonthRangeMonths - 1).toLong())
      .atDay(1)
    val start = monthStart.previousOrSameSunday()
    val days = ChronoUnit.DAYS.between(start, today).toInt() + 1
    val columns = max(1, (days + 6) / 7)
    val gap = 2f * density
    val size = min(
      (width - gap * (columns - 1)) / columns,
      (height - gap * 6) / 7f,
    ).coerceAtLeast(1.5f * density)
    val xOffset = (width - (size * columns + gap * (columns - 1))) / 2f
    val yOffset = (height - (size * 7 + gap * 6)) / 2f
    val paint = Paint(Paint.ANTI_ALIAS_FLAG)
    val radius = min(2f * density, size * 0.35f)
    repeat(days) { index ->
      val date = start.plusDays(index.toLong())
      if (date < monthStart) return@repeat
      val column = index / 7
      val row = index % 7
      val aggregate = values[date]
      paint.color = if (aggregate == null) {
        parseColor(theme.heatmapEmptyColor)
      } else {
        bucketColor(theme.accent, aggregate.durationSeconds)
      }
      paint.style = Paint.Style.FILL
      val left = xOffset + column * (size + gap)
      val top = yOffset + row * (size + gap)
      canvas.drawRoundRect(RectF(left, top, left + size, top + size), radius, radius, paint)
      if (date == today) {
        paint.style = Paint.Style.STROKE
        paint.strokeWidth = max(1f * density, size * 0.12f)
        paint.color = parseColor(theme.todayIndicatorColor)
        canvas.drawRoundRect(RectF(left, top, left + size, top + size), radius, radius, paint)
      }
    }
  }

  private fun dateRange(
    variant: LoofitAndroidWidgetVariant,
    today: LocalDate,
  ): List<LocalDate> {
    val start: LocalDate
    val count: Int
    when (variant) {
      LoofitAndroidWidgetVariant.HEATMAP_WEEK -> {
        start = today.minusDays((LoofitWidgetLayoutContract.Heatmap.weekRangeDays - 1).toLong())
        count = LoofitWidgetLayoutContract.Heatmap.weekRangeDays
      }
      LoofitAndroidWidgetVariant.HEATMAP_MONTH -> {
        start = today.previousOrSameSunday()
          .minusWeeks((LoofitWidgetLayoutContract.Heatmap.monthRangeWeeks - 1).toLong())
        count = LoofitWidgetLayoutContract.Heatmap.monthRangeWeeks * 7
      }
      LoofitAndroidWidgetVariant.CURRENT_MONTH -> {
        val month = YearMonth.from(today)
        start = month.atDay(1).previousOrSameSunday()
        val end = month.atEndOfMonth().nextOrSameSaturday()
        count = min(42, ChronoUnit.DAYS.between(start, end).toInt() + 1)
      }
      LoofitAndroidWidgetVariant.FOUR_WEEK_EXPANDED -> {
        start = today.previousOrSameSunday()
          .minusWeeks((LoofitWidgetLayoutContract.Heatmap.fourWeekExpandedRangeWeeks - 1).toLong())
        count = LoofitWidgetLayoutContract.Heatmap.fourWeekExpandedRangeWeeks * 7
      }
      LoofitAndroidWidgetVariant.LOCK_THREE_WEEK -> {
        start = today.previousOrSameSunday()
          .minusWeeks((LoofitWidgetLayoutContract.LockScreen.threeWeekCalendarRangeWeeks - 1).toLong())
        count = LoofitWidgetLayoutContract.LockScreen.threeWeekCalendarRangeWeeks * 7
      }
      LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK -> {
        start = today.previousOrSameSunday()
        count = LoofitWidgetLayoutContract.LockScreen.nextThreeWeekCalendarRangeWeeks * 7
      }
      else -> {
        start = today.minusDays(6)
        count = 7
      }
    }
    return List(count) { start.plusDays(it.toLong()) }
  }

  private fun LoofitAndroidWidgetVariant.isLockScreen(): Boolean = when (this) {
    LoofitAndroidWidgetVariant.LOCK_THREE_WEEK,
    LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK -> true
    else -> false
  }

  private fun LoofitAndroidWidgetVariant.hidesDayLabels(): Boolean =
    this == LoofitAndroidWidgetVariant.HEATMAP_SIX_MONTHS

  private fun LocalDate.previousOrSameSunday(): LocalDate =
    minusDays((dayOfWeek.value % 7).toLong())

  private fun LocalDate.nextOrSameSaturday(): LocalDate =
    plusDays(((DayOfWeek.SATURDAY.value - dayOfWeek.value + 7) % 7).toLong())

  private fun bucketColor(accent: String, durationSeconds: Int): Int {
    val color = parseColor(accent)
    val alpha = when {
      durationSeconds < 1_800 -> 0.35f
      durationSeconds < 3_600 -> 0.55f
      durationSeconds < 7_200 -> 0.78f
      else -> 1f
    }
    return Color.argb(
      floor(Color.alpha(color) * alpha).toInt(),
      Color.red(color),
      Color.green(color),
      Color.blue(color),
    )
  }

  private fun ellipsize(value: String, paint: Paint, maxWidth: Float): String {
    if (paint.measureText(value) <= maxWidth) return value
    var candidate = value
    while (candidate.length > 1 && paint.measureText("$candidate…") > maxWidth) {
      candidate = candidate.dropLast(1)
    }
    return "$candidate…"
  }

  private fun parseColor(value: String): Int = runCatching { Color.parseColor(value) }
    .getOrDefault(Color.WHITE)
}
