package com.loofit.workoutcore

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LoofitAndroidWidgetRendererTest {
  private val context: Context = ApplicationProvider.getApplicationContext()

  @Test
  fun everyWidgetHasDistinctPickerMetadataAndPreview() {
    val providerInfos = listOf(
      R.xml.loofit_widget_control_info,
      R.xml.loofit_widget_week_info,
      R.xml.loofit_widget_month_info,
      R.xml.loofit_widget_six_months_info,
      R.xml.loofit_widget_current_month_info,
      R.xml.loofit_widget_four_week_info,
      R.xml.loofit_widget_routine_progress_info,
      R.xml.loofit_widget_body_part_duration_info,
      R.xml.loofit_widget_lock_workout_info,
      R.xml.loofit_widget_lock_three_week_info,
      R.xml.loofit_widget_lock_next_three_week_info,
      R.xml.loofit_widget_lock_routine_progress_info,
    )
    val previewLayouts = mutableSetOf<Int>()
    val descriptions = mutableSetOf<Int>()
    val androidNamespace = "http://schemas.android.com/apk/res/android"

    providerInfos.forEach { providerInfo ->
      context.resources.getXml(providerInfo).use { parser ->
        while (parser.eventType != org.xmlpull.v1.XmlPullParser.START_TAG) {
          parser.next()
        }
        previewLayouts += parser.getAttributeResourceValue(androidNamespace, "previewLayout", 0)
        descriptions += parser.getAttributeResourceValue(androidNamespace, "description", 0)
      }
    }

    assertEquals(12, previewLayouts.size)
    assertEquals(12, descriptions.size)
    assertTrue(previewLayouts.none { it == 0 })
    assertTrue(descriptions.none { it == 0 })
  }

  @Test
  fun lockScreenWidgetsRequestAOneRowLauncherFootprint() {
    val providerInfos = listOf(
      R.xml.loofit_widget_lock_workout_info,
      R.xml.loofit_widget_lock_three_week_info,
      R.xml.loofit_widget_lock_next_three_week_info,
      R.xml.loofit_widget_lock_routine_progress_info,
    )
    val androidNamespace = "http://schemas.android.com/apk/res/android"
    val expected = LoofitWidgetLayoutContract.AndroidPlatform.ProviderSizing.accessoryRectangular

    providerInfos.forEach { providerInfo ->
      context.resources.getXml(providerInfo).use { parser ->
        while (parser.eventType != org.xmlpull.v1.XmlPullParser.START_TAG) {
          parser.next()
        }
        assertEquals(expected.targetCellWidth, parser.getAttributeIntValue(androidNamespace, "targetCellWidth", 0))
        assertEquals(expected.targetCellHeight, parser.getAttributeIntValue(androidNamespace, "targetCellHeight", 0))
        assertTrue(
          parser.getAttributeValue(androidNamespace, "minWidth") in
            setOf("${expected.minWidth}dp", "${expected.minWidth}.0dip"),
        )
        assertTrue(
          parser.getAttributeValue(androidNamespace, "minHeight") in
            setOf("${expected.minHeight}dp", "${expected.minHeight}.0dip"),
        )
      }
    }
  }

  @Test
  fun allHeatmapVariantsRenderAtWidgetSize() {
    val snapshot = sampleSnapshot()
    LoofitAndroidWidgetVariant.entries
      .filter { it.name.contains("HEATMAP") || it.name.contains("MONTH") || it.name.contains("WEEK") }
      .forEach { variant ->
        val viewport = LoofitWidgetViewport(300, 140)
        val plan = LoofitWidgetRenderPlanBuilder.build(
          variant,
          snapshot,
          viewport,
          ZonedDateTime.parse("2026-07-18T12:00:00+09:00[Asia/Seoul]"),
        )
        val bitmap = LoofitWidgetBitmapRenderer.render(context, plan)
        assertEquals(
          "$variant width",
          (300 * context.resources.displayMetrics.density).toInt(),
          bitmap.width,
        )
        assertNotNull("$variant rendered", bitmap)
      }
  }

  @Test
  fun semanticSnapshotRoundTripsThroughAtomicStore() {
    val snapshot = sampleSnapshot()
    LoofitWorkoutSnapshotStore.file(context).parentFile?.deleteRecursively()
    LoofitWorkoutSnapshotStore.save(context, snapshot)
    val restored = LoofitWorkoutSnapshotStore.load(context)
    assertEquals(snapshot.revision, restored?.revision)
    assertEquals(snapshot.dailyCompleted, restored?.dailyCompleted)
    assertEquals(snapshot.bodyPartDurations, restored?.bodyPartDurations)
  }

  @Test
  fun bodyPartDurationBarsRender() {
    val viewport = LoofitWidgetViewport(140, 80)
    val plan = LoofitWidgetRenderPlanBuilder.build(
      LoofitAndroidWidgetVariant.BODY_PART_DURATION,
      sampleSnapshot(),
      viewport,
      ZonedDateTime.parse("2026-07-18T12:00:00+09:00[Asia/Seoul]"),
    )
    val bitmap = LoofitWidgetBitmapRenderer.render(context, plan)
    assertEquals((140 * context.resources.displayMetrics.density).toInt(), bitmap.width)
    assertEquals((80 * context.resources.displayMetrics.density).toInt(), bitmap.height)
  }

  private fun sampleSnapshot(): LoofitWorkoutSnapshot {
    val today = LocalDate.now()
    val daily = (0 until 35).map { offset ->
      LoofitWorkoutDailyAggregate(
        dateKey = today.minusDays((34 - offset).toLong()).toString(),
        workoutCount = if (offset % 3 == 0) 1 else 0,
        durationSeconds = if (offset % 3 == 0) 1_800 + offset * 60 else 0,
      )
    }
    return LoofitWorkoutSnapshot(
      revision = 42,
      generatedAt = LoofitWorkoutDate.nowIso8601(),
      timeZoneIdentifier = ZoneId.systemDefault().id,
      theme = LoofitWidgetTheme(),
      activeSession = null,
      nextWorkout = null,
      latestCompletedToday = null,
      completedToday = emptyList(),
      dailyCompleted = daily,
      recentCompleted = emptyList(),
      dailyDetails = daily.map {
        LoofitWorkoutDailyDetail(it.dateKey, if (it.workoutCount > 0) listOf("가슴") else emptyList())
      },
      bodyPartDurations = listOf(
        LoofitBodyPartDurationSnapshot("가슴", 7_200),
        LoofitBodyPartDurationSnapshot("등", 3_600),
      ),
      routineProgress = null,
      surfaceHashes = LoofitWidgetKinds.all.associateWith { "hash-$it" },
    )
  }
}
