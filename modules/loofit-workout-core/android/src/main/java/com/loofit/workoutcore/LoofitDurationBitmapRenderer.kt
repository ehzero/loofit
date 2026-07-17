package com.loofit.workoutcore

import android.content.Context
import android.graphics.Bitmap
import android.graphics.Canvas
import android.graphics.Color
import android.graphics.Paint
import android.graphics.RectF
import kotlin.math.max

internal object LoofitDurationBitmapRenderer {
  fun render(
    context: Context,
    snapshot: LoofitWorkoutSnapshot,
    widthDp: Int,
    heightDp: Int,
  ): Bitmap {
    val density = context.resources.displayMetrics.density
    val width = max(1, (widthDp * density).toInt())
    val height = max(1, (heightDp * density).toInt())
    val bitmap = Bitmap.createBitmap(width, height, Bitmap.Config.ARGB_8888)
    val canvas = Canvas(bitmap)
    val rows = snapshot.bodyPartDurations
      .take(LoofitWidgetLayoutContract.BodyPartDuration.visibleItemLimit)
    if (rows.isEmpty()) return bitmap
    val rowHeight = height.toFloat() / rows.size
    val textPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor(snapshot.theme.titleColor)
      textSize = 10f * density
      typeface = android.graphics.Typeface.create(android.graphics.Typeface.DEFAULT, android.graphics.Typeface.BOLD)
    }
    val durationPaint = Paint(Paint.ANTI_ALIAS_FLAG).apply {
      color = parseColor(snapshot.theme.detailColor)
      textSize = 9f * density
      textAlign = Paint.Align.RIGHT
    }
    val barPaint = Paint(Paint.ANTI_ALIAS_FLAG)
    val maximum = rows.maxOf { it.durationSeconds }.coerceAtLeast(1)
    rows.forEachIndexed { index, row ->
      val top = rowHeight * index
      val baseline = top + 12f * density
      canvas.drawText(row.bodyPartName, 0f, baseline, textPaint)
      canvas.drawText(formatDuration(row.durationSeconds), width.toFloat(), baseline, durationPaint)
      val barTop = top + 18f * density
      val barHeight = 5f * density
      barPaint.color = parseColor(snapshot.theme.secondaryButtonBackground)
      canvas.drawRoundRect(
        RectF(0f, barTop, width.toFloat(), barTop + barHeight),
        barHeight / 2f,
        barHeight / 2f,
        barPaint,
      )
      barPaint.color = parseColor(snapshot.theme.accent)
      canvas.drawRoundRect(
        RectF(
          0f,
          barTop,
          width * (row.durationSeconds.toFloat() / maximum),
          barTop + barHeight,
        ),
        barHeight / 2f,
        barHeight / 2f,
        barPaint,
      )
    }
    return bitmap
  }

  private fun formatDuration(seconds: Int): String {
    val minutes = seconds / 60
    val hours = minutes / 60
    return if (hours > 0) "${hours}시간 ${minutes % 60}분" else "${minutes}분"
  }

  private fun parseColor(value: String): Int = runCatching { Color.parseColor(value) }
    .getOrDefault(Color.WHITE)
}
