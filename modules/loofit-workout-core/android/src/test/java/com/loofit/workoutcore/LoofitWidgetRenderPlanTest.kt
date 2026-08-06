package com.loofit.workoutcore

import android.appwidget.AppWidgetManager
import android.content.Context
import android.content.res.Configuration
import android.graphics.Bitmap
import android.os.Bundle
import android.util.SizeF
import androidx.test.core.app.ApplicationProvider
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertTrue
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import org.robolectric.annotation.GraphicsMode
import java.io.File
import java.nio.ByteBuffer
import java.security.MessageDigest
import java.time.LocalDate
import java.time.ZoneId
import java.time.ZonedDateTime

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
@GraphicsMode(GraphicsMode.Mode.NATIVE)
class LoofitWidgetRenderPlanTest {
  private val context: Context = ApplicationProvider.getApplicationContext()
  private val now = ZonedDateTime.parse("2026-07-18T20:32:10+09:00[Asia/Seoul]")

  @Test
  fun everyAndroidVariantBuildsFromTheCanonicalRecipe() {
    val snapshot = sampleSnapshot(ControlFixture.IDLE)
    val plans = LoofitAndroidWidgetVariant.entries.associateWith { variant ->
      LoofitWidgetRenderPlanBuilder.build(variant, snapshot, viewport(variant), now)
    }

    assertEquals(LoofitAndroidWidgetVariant.entries.toSet(), plans.keys)
    assertEquals(
      LoofitWidgetLayoutContract.contentPadding * 164f /
        LoofitWidgetLayoutContract.ContentMargins.homeReferenceShortestEdge,
      plans.getValue(LoofitAndroidWidgetVariant.CONTROL).contentPaddingDp,
      0.001f,
    )
    assertEquals(
      LoofitWidgetLayoutContract.Radius.container,
      plans.getValue(LoofitAndroidWidgetVariant.HEATMAP_WEEK).cornerRadiusDp,
    )
    assertEquals(
      0f,
      plans.getValue(LoofitAndroidWidgetVariant.LOCK_THREE_WEEK).cornerRadiusDp,
    )
    assertTrue(plans.getValue(LoofitAndroidWidgetVariant.CONTROL).content is LoofitControlRenderPlan)
    assertTrue(plans.getValue(LoofitAndroidWidgetVariant.ROUTINE_PROGRESS).content is LoofitRoutineRenderPlan)
    assertTrue(plans.getValue(LoofitAndroidWidgetVariant.BODY_PART_DURATION).content is LoofitBodyPartDurationRenderPlan)
    assertTrue(plans.getValue(LoofitAndroidWidgetVariant.HEATMAP_WEEK).content is LoofitHeatmapRenderPlan)
  }

  @Test
  fun launcherExactSizesRemainTwoDimensionalInsteadOfUsingOnlyMinimumBounds() {
    val options = Bundle().apply {
      putParcelableArrayList(
        AppWidgetManager.OPTION_APPWIDGET_SIZES,
        arrayListOf(SizeF(164f, 188f), SizeF(310f, 110f), SizeF(164f, 188f)),
      )
    }

    assertEquals(
      listOf(SizeF(164f, 188f), SizeF(310f, 110f)),
      LoofitAndroidWidgetRenderer.exactSizes(options),
    )
    assertEquals(
      LoofitWidgetViewport(164, 188),
      LoofitAndroidWidgetRenderer.viewport(
        LoofitAndroidWidgetVariant.HEATMAP_WEEK,
        SizeF(164f, 188f),
      ),
    )
  }

  @Test
  fun legacySizeRangeUsesTheCurrentOrientationPair() {
    val options = Bundle().apply {
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_WIDTH, 164)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_WIDTH, 310)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MIN_HEIGHT, 110)
      putInt(AppWidgetManager.OPTION_APPWIDGET_MAX_HEIGHT, 188)
    }

    assertEquals(
      LoofitWidgetViewport(164, 188),
      LoofitAndroidWidgetRenderer.fallbackViewport(
        Configuration.ORIENTATION_PORTRAIT,
        LoofitAndroidWidgetVariant.HEATMAP_WEEK,
        options,
      ),
    )
    assertEquals(
      LoofitWidgetViewport(310, 110),
      LoofitAndroidWidgetRenderer.fallbackViewport(
        Configuration.ORIENTATION_LANDSCAPE,
        LoofitAndroidWidgetVariant.HEATMAP_WEEK,
        options,
      ),
    )
  }

  @Test
  fun controlPlansMatchTheRnAndSwiftStateContract() {
    val idle = controlPlan(ControlFixture.IDLE)
    assertEquals(LoofitControlState.IDLE, idle.state)
    assertEquals(LoofitWidgetLayoutContract.Control.Copy.idle, idle.eyebrow)
    assertEquals("Pull", idle.title)
    assertEquals("등 · 이두", idle.detail)
    assertEquals(LoofitWidgetLayoutContract.Control.Copy.start, idle.action?.label)

    val active = controlPlan(ControlFixture.ACTIVE)
    assertEquals(LoofitControlState.ACTIVE, active.state)
    assertEquals(LoofitWidgetLayoutContract.Control.Copy.active, active.eyebrow)
    assertEquals("Pull", active.title)
    assertEquals("등 · 이두", active.detail)
    assertEquals("42:10", active.elapsed)
    assertEquals("complete", active.action?.command)
    assertEquals(91L, active.action?.expectedSessionId)

    val completed = controlPlan(ControlFixture.COMPLETED)
    assertEquals(LoofitControlState.COMPLETED, completed.state)
    assertEquals(LoofitWidgetLayoutContract.Control.Copy.completed, completed.eyebrow)
    assertEquals("Push · Pull", completed.title)
    assertEquals("가슴 · 어깨 · 삼두 · 등 · 이두", completed.detail)
    assertEquals("1시간 56분", completed.duration)
    assertEquals("오후 6:40 – 오후 8:08", completed.timeRange)
    assertEquals(null, completed.action)
  }

  @Test
  fun heatmapPlansUseTheSameRangesFootersAndThresholds() {
    val snapshot = sampleSnapshot(ControlFixture.IDLE)
    val week = heatmapPlan(LoofitAndroidWidgetVariant.HEATMAP_WEEK, snapshot)
    assertEquals(7, week.days.size)
    assertEquals(LocalDate.parse("2026-07-12"), week.days.first().date)
    assertEquals(LocalDate.parse("2026-07-18"), week.days.last().date)
    assertEquals(listOf("횟수", "총 시간", "평균"), week.stats.map { it.first })
    assertEquals(LoofitWidgetLayoutContract.Heatmap.WeekFooter.recentLabel, week.recentLabel)

    val month = heatmapPlan(LoofitAndroidWidgetVariant.HEATMAP_MONTH, snapshot)
    assertEquals(35, month.days.size)
    assertEquals(LocalDate.parse("2026-06-14"), month.days.first().date)
    assertEquals(LocalDate.parse("2026-07-18"), month.days.last().date)

    val currentMonth = heatmapPlan(LoofitAndroidWidgetVariant.CURRENT_MONTH, snapshot)
    assertEquals(35, currentMonth.days.size)
    assertEquals(4, currentMonth.days.count { !it.inRange })
    assertTrue(currentMonth.title.startsWith("7월 · "))

    val previousLock = heatmapPlan(LoofitAndroidWidgetVariant.LOCK_THREE_WEEK, snapshot)
    val nextLock = heatmapPlan(LoofitAndroidWidgetVariant.LOCK_NEXT_THREE_WEEK, snapshot)
    assertEquals(21, previousLock.days.size)
    assertEquals(21, nextLock.days.size)
    assertTrue(nextLock.days.any { !it.inRange })
    assertEquals(listOf(1_800, 3_600, 5_400), LoofitWidgetLayoutContract.Heatmap.bucketThresholdSeconds.toList())
    assertEquals(listOf(0.24f, 0.48f, 0.74f, 1f), LoofitWidgetLayoutContract.Heatmap.bucketAccentWeights.toList())
  }

  @Test
  fun routinePlanUsesThreeCenteredRowsWithoutLegacyIndicators() {
    val home = LoofitWidgetRenderPlanBuilder.build(
      LoofitAndroidWidgetVariant.ROUTINE_PROGRESS,
      sampleSnapshot(ControlFixture.IDLE),
      viewport(LoofitAndroidWidgetVariant.ROUTINE_PROGRESS),
      now,
    ).content as LoofitRoutineRenderPlan
    assertEquals(listOf("Push", "Pull", "하체"), home.items.map { it.title })
    assertEquals(listOf(false, true, false), home.items.map { it.isCurrent })
    assertEquals("가슴 · 어깨 · 삼두 · 1시간 8분", home.items[0].metadata)
    assertFalse(home.items.any { it.title.startsWith("●") || it.title.startsWith("○") })

    val lock = LoofitWidgetRenderPlanBuilder.build(
      LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS,
      sampleSnapshot(ControlFixture.IDLE),
      viewport(LoofitAndroidWidgetVariant.LOCK_ROUTINE_PROGRESS),
      now,
    ).content as LoofitRoutineRenderPlan
    assertTrue(lock.isLockScreen)
    assertTrue(lock.items.all { it.metadata.isEmpty() })
  }

  @Test
  fun visualGoldensCoverAllVariantsThemesStatesAndDensityPolicies() {
    val dark = sampleSnapshot(ControlFixture.IDLE)
    val light = dark.copy(theme = lightTheme())
    val cases = buildList {
      LoofitAndroidWidgetVariant.entries.forEach { variant ->
        add(VisualCase("dark_${variant.name.lowercase()}", variant, dark, viewport(variant), context))
        add(VisualCase("light_${variant.name.lowercase()}", variant, light, viewport(variant), context))
      }
      for (state in listOf(ControlFixture.ACTIVE, ControlFixture.COMPLETED)) {
        add(
          VisualCase(
            "dark_control_${state.name.lowercase()}",
            LoofitAndroidWidgetVariant.CONTROL,
            sampleSnapshot(state),
            viewport(LoofitAndroidWidgetVariant.CONTROL),
            context,
          ),
        )
        add(
          VisualCase(
            "dark_lock_workout_${state.name.lowercase()}",
            LoofitAndroidWidgetVariant.LOCK_WORKOUT,
            sampleSnapshot(state),
            viewport(LoofitAndroidWidgetVariant.LOCK_WORKOUT),
            context,
          ),
        )
      }
      val empty = emptySnapshot()
      for (variant in listOf(
        LoofitAndroidWidgetVariant.HEATMAP_WEEK,
        LoofitAndroidWidgetVariant.ROUTINE_PROGRESS,
        LoofitAndroidWidgetVariant.BODY_PART_DURATION,
      )) {
        add(VisualCase("empty_${variant.name.lowercase()}", variant, empty, viewport(variant), context))
      }
      add(
        VisualCase(
          "resized_month_110x110",
          LoofitAndroidWidgetVariant.HEATMAP_MONTH,
          dark,
          LoofitWidgetViewport(110, 110),
          context,
        ),
      )
      add(
        VisualCase(
          "font_130_routine_progress",
          LoofitAndroidWidgetVariant.ROUTINE_PROGRESS,
          dark,
          viewport(LoofitAndroidWidgetVariant.ROUTINE_PROGRESS),
          contextWithFontScale(1.3f),
        ),
      )
    }

    val reportDirectory = File("build/reports/loofit-widget-goldens").apply { mkdirs() }
    val actual = cases.associate { visualCase ->
      val plan = LoofitWidgetRenderPlanBuilder.build(
        visualCase.variant,
        visualCase.snapshot,
        visualCase.viewport,
        now,
      )
      val bitmap = LoofitWidgetBitmapRenderer.render(visualCase.context, plan)
      File(reportDirectory, "${visualCase.name}.png").outputStream().use { stream ->
        bitmap.compress(Bitmap.CompressFormat.PNG, 100, stream)
      }
      visualCase.name to bitmapHash(bitmap)
    }
    File(reportDirectory, "hashes.txt").writeText(
      actual.entries.joinToString("\n") { (name, hash) -> "\"$name\" to \"$hash\"," },
    )

    assertEquals(EXPECTED_VISUAL_HASHES, actual)
  }

  private fun controlPlan(fixture: ControlFixture): LoofitControlRenderPlan =
    LoofitWidgetRenderPlanBuilder.build(
      LoofitAndroidWidgetVariant.CONTROL,
      sampleSnapshot(fixture),
      viewport(LoofitAndroidWidgetVariant.CONTROL),
      now,
    ).content as LoofitControlRenderPlan

  private fun heatmapPlan(
    variant: LoofitAndroidWidgetVariant,
    snapshot: LoofitWorkoutSnapshot,
  ): LoofitHeatmapRenderPlan = LoofitWidgetRenderPlanBuilder.build(
    variant,
    snapshot,
    viewport(variant),
    now,
  ).content as LoofitHeatmapRenderPlan

  private fun viewport(variant: LoofitAndroidWidgetVariant): LoofitWidgetViewport {
    val spec = when (variant) {
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
    return LoofitWidgetViewport(spec.width.toInt(), spec.height.toInt())
  }

  private fun sampleSnapshot(control: ControlFixture): LoofitWorkoutSnapshot {
    val pushParts = listOf(
      part(1, "가슴", 0),
      part(2, "어깨", 1),
      part(3, "삼두", 2),
    )
    val pullParts = listOf(part(4, "등", 0), part(5, "이두", 1))
    val legParts = listOf(part(6, "하체", 0))
    val push = completedSession(
      id = 81,
      title = "Push",
      detail = "가슴 · 어깨 · 삼두",
      startedAt = "2026-07-18T09:40:00Z",
      endedAt = "2026-07-18T10:48:00Z",
      durationSeconds = 4_080,
      parts = pushParts,
    )
    val pull = completedSession(
      id = 82,
      title = "Pull",
      detail = "등 · 이두",
      startedAt = "2026-07-18T10:22:00Z",
      endedAt = "2026-07-18T11:08:00Z",
      durationSeconds = 2_880,
      parts = pullParts,
    )
    val active = if (control == ControlFixture.ACTIVE) {
      LoofitWorkoutSessionSnapshot(
        id = 91,
        routineId = 1,
        routineDayId = 2,
        title = "Pull",
        detail = "등 · 이두",
        startedAt = "2026-07-18T10:50:00Z",
        endedAt = null,
        durationSeconds = 0,
        parts = pullParts,
      )
    } else {
      null
    }
    val completedToday = if (control == ControlFixture.COMPLETED) listOf(push, pull) else emptyList()
    val rangeStart = now.toLocalDate().minusDays(219)
    val daily = (0 until 220).map { index ->
      val date = rangeStart.plusDays(index.toLong())
      val duration = when {
        index % 11 == 0 -> 5_700
        index % 5 == 0 -> 3_900
        index % 3 == 0 -> 2_400
        else -> 0
      }
      LoofitWorkoutDailyAggregate(
        dateKey = date.toString(),
        workoutCount = if (duration > 0) 1 else 0,
        durationSeconds = duration,
      )
    }
    val routineItems = listOf(
      LoofitRoutineProgressItemSnapshot(1, "Push", pushParts, push),
      LoofitRoutineProgressItemSnapshot(2, "Pull", pullParts, pull),
      LoofitRoutineProgressItemSnapshot(
        3,
        "",
        legParts,
        completedSession(
          83,
          "하체",
          "하체",
          "2026-07-14T10:00:00Z",
          "2026-07-14T10:56:00Z",
          3_360,
          legParts,
        ),
      ),
    )
    return LoofitWorkoutSnapshot(
      revision = 42,
      generatedAt = now.toInstant().toString(),
      timeZoneIdentifier = now.zone.id,
      theme = LoofitWidgetTheme(),
      activeSession = active,
      nextWorkout = LoofitWorkoutTargetSnapshot(
        routineId = 1,
        routineDayId = 2,
        title = "Pull",
        detail = "등 · 이두",
        parts = pullParts,
      ),
      latestCompletedToday = completedToday.lastOrNull(),
      completedToday = completedToday,
      dailyCompleted = daily,
      recentCompleted = listOf(push, pull),
      dailyDetails = daily.mapIndexed { index, aggregate ->
        LoofitWorkoutDailyDetail(
          aggregate.dateKey,
          if (aggregate.durationSeconds > 0) {
            when (index % 3) {
              0 -> listOf("가슴", "어깨", "삼두")
              1 -> listOf("등", "이두")
              else -> listOf("하체")
            }
          } else {
            emptyList()
          },
        )
      },
      bodyPartDurations = listOf(
        LoofitBodyPartDurationSnapshot("가슴", 23_100),
        LoofitBodyPartDurationSnapshot("등", 20_400),
        LoofitBodyPartDurationSnapshot("하체", 15_300),
        LoofitBodyPartDurationSnapshot("어깨", 9_000),
      ),
      routineProgress = LoofitRoutineProgressSnapshot(2, routineItems),
      surfaceHashes = LoofitWidgetKinds.all.associateWith { "hash-$it" },
    )
  }

  private fun emptySnapshot(): LoofitWorkoutSnapshot = sampleSnapshot(ControlFixture.IDLE).copy(
    nextWorkout = null,
    dailyCompleted = emptyList(),
    recentCompleted = emptyList(),
    dailyDetails = emptyList(),
    bodyPartDurations = emptyList(),
    routineProgress = null,
  )

  private fun lightTheme(): LoofitWidgetTheme = LoofitWidgetTheme().copy(
    background = "#F5F5F6",
    labelColor = "#6A6A71",
    brandColor = "#A2A2A8",
    titleColor = "#17171A",
    detailColor = "#6A6A71",
    secondaryButtonBackground = "#EDEDEF",
    secondaryButtonText = "#17171A",
    heatmapBackground = "#F5F5F6",
    heatmapTitleColor = "#6A6A71",
    heatmapBrandColor = "#A2A2A8",
    heatmapFooterValueColor = "#3A3A40",
    heatmapWeekdayLabelColor = "#78787F",
    heatmapWeekendLabelColor = "#C0392B",
    heatmapDayLabelColor = "#78787F",
    heatmapBaseColor = "#FFFFFF",
    heatmapEmptyColor = "#E7E7EB",
    heatmapGapColor = "#00000000",
    todayIndicatorColor = "#000000",
  )

  private fun part(id: Long, name: String, order: Int) =
    LoofitWorkoutPartSnapshot(id, name, "#CFF56A", order)

  private fun completedSession(
    id: Long,
    title: String,
    detail: String,
    startedAt: String,
    endedAt: String,
    durationSeconds: Int,
    parts: List<LoofitWorkoutPartSnapshot>,
  ) = LoofitWorkoutSessionSnapshot(
    id = id,
    routineId = 1,
    routineDayId = id,
    title = title,
    detail = detail,
    startedAt = startedAt,
    endedAt = endedAt,
    durationSeconds = durationSeconds,
    parts = parts,
  )

  private fun contextWithFontScale(scale: Float): Context {
    val configuration = Configuration(context.resources.configuration).apply { fontScale = scale }
    return context.createConfigurationContext(configuration)
  }

  private fun bitmapHash(bitmap: Bitmap): String {
    val buffer = ByteBuffer.allocate(bitmap.byteCount)
    bitmap.copyPixelsToBuffer(buffer)
    val digest = MessageDigest.getInstance("SHA-256")
    digest.update(bitmap.width.toString().toByteArray())
    digest.update(bitmap.height.toString().toByteArray())
    digest.update(buffer.array())
    return digest.digest().joinToString("") { byte -> "%02x".format(byte) }
  }

  private data class VisualCase(
    val name: String,
    val variant: LoofitAndroidWidgetVariant,
    val snapshot: LoofitWorkoutSnapshot,
    val viewport: LoofitWidgetViewport,
    val context: Context,
  )

  private enum class ControlFixture { IDLE, ACTIVE, COMPLETED }

  companion object {
    private val EXPECTED_VISUAL_HASHES = mapOf(
      "dark_control" to "77142c7d036ac018472e3094fcf7c117c588d8e6ad359dfde589c229af5df358",
      "light_control" to "bcebb97950959b45549004d4d580b338d33ed019f27f5507fd0bcae5b604b51c",
      "dark_heatmap_week" to "f6e81999be14cd512d8bb09e061473cfd4f2a02b7afab45d559d239ac5e7048f",
      "light_heatmap_week" to "05c6b3362fea7a3aa876282af462c6c0ee90dc3f68beaa67c64eb0ef15f6b61d",
      "dark_heatmap_month" to "ad7872009201de84da20972f940dbad34a29551fc8ef5b3049d87ab6cb5b2b80",
      "light_heatmap_month" to "2eb7f6e341e22941444c273dfafca8f2b20cb0cf5c4e8465c73ee6b2e5279adf",
      "dark_heatmap_six_months" to "42de5d2eb7cafa5d6449224c799165ea4d4e6d78fc818657248a3a28f1876831",
      "light_heatmap_six_months" to "fc1c0cec881d1e3cc90ea9d46cef6ea532fabae73bd4cf89418004e062267a08",
      "dark_current_month" to "d3fcbf800a96f31933cf22353f7b2dab30378420c008a4eaddda8b75d9123c47",
      "light_current_month" to "049ec392942a4b18f42f77c29cb807df3a2cf935d6f01b8274fab393810b05d1",
      "dark_four_week_expanded" to "68299cf2c7fb2514947a6fe7a90720aeeff93ccc4894e26394f303659ebd60ba",
      "light_four_week_expanded" to "95e1f07a6247901a35217ca30ca8cd799f65a693dbf4ed8c3d7f7ae6cd855c2b",
      "dark_routine_progress" to "5ed9c684f805acbb9cfe029abfa80399297914ee5f57deb2ceb020304bf22535",
      "light_routine_progress" to "f66b44050f90ca4e0480e3f74723a62e4c26284451539287c244028d05bf400f",
      "dark_body_part_duration" to "6d236c9c4f8831c9c4efb6df28c46c02a2a5329951ffb6f572fc3ba6e2c9c9a8",
      "light_body_part_duration" to "1b7b127a72a58c34f653e602679902bcd646142683ad623b501f9800c8c79e16",
      "dark_lock_workout" to "fe5435e09b238d5a457f3b53ccdfdafc30815c27383f6012d05b36cdbd17758a",
      "light_lock_workout" to "fe5435e09b238d5a457f3b53ccdfdafc30815c27383f6012d05b36cdbd17758a",
      "dark_lock_three_week" to "a933e962011f7ac4e839ab42a37dd5b860b17ee022df3c0bf9ac52c64c6eab09",
      "light_lock_three_week" to "a933e962011f7ac4e839ab42a37dd5b860b17ee022df3c0bf9ac52c64c6eab09",
      "dark_lock_next_three_week" to "5651435ec4a0c28e9148afcd4a505b215de6edd6a2ae6d65708cff16f4260ff9",
      "light_lock_next_three_week" to "5651435ec4a0c28e9148afcd4a505b215de6edd6a2ae6d65708cff16f4260ff9",
      "dark_lock_routine_progress" to "9e83d080741b7e8ce3b4a8de89fb1c0a19e508eeb42d3b24f842b4a6b9872ee1",
      "light_lock_routine_progress" to "9e83d080741b7e8ce3b4a8de89fb1c0a19e508eeb42d3b24f842b4a6b9872ee1",
      "dark_control_active" to "9ce92059d4448c37122e06d01803707d980132e8cdb68dfa67159d1e0e0e8212",
      "dark_lock_workout_active" to "6187c8753c4241bc0c3992b9bcea0015c9440f7f606349447db8c694acf1103c",
      "dark_control_completed" to "fd2463d6bfee7b3f5adfc36b5597d8588257dd5b4cf4beb5141c814e9220d81d",
      "dark_lock_workout_completed" to "2fc3a401b3f3bff662d6ff84bfa12a49ea4f1a0aa79a17795dd6bd32ac6a9a01",
      "empty_heatmap_week" to "82cd98cd87b78f0cc11d70f1264df4cd796c13601174dec198b1b3ed8ef5f24b",
      "empty_routine_progress" to "432e0372261a1840a54606f13474ecc1ca67424a8d1a0e2c7218d261f56e9dd6",
      "empty_body_part_duration" to "e297974818670a7280076d58d2d6546b2e849989b3856098c49b51a7e5883d9f",
      "resized_month_110x110" to "1c7648d482dd57efd622ac51328bad577110e4b72cfad7470382db7fae19be8a",
      "font_130_routine_progress" to "343506e9472235ea8e3d98149428aa2517b1bb0074df71c381908fae1268471a",
    )
  }
}
