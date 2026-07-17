package com.loofit.workoutcore

internal sealed interface LoofitWorkoutCommand {
  data object StartNext : LoofitWorkoutCommand
  data class StartRoutine(val routineDayId: Long) : LoofitWorkoutCommand
  data class ChangeParts(
    val expectedSessionId: Long,
    val bodyPartIds: List<Long>,
    val updateRoutine: Boolean,
  ) : LoofitWorkoutCommand
  data class Complete(val expectedSessionId: Long) : LoofitWorkoutCommand
  data class Cancel(val expectedSessionId: Long) : LoofitWorkoutCommand
}

internal enum class LoofitWorkoutCommandStatus(val rawValue: String) {
  APPLIED("applied"),
  NOOP("noop"),
  STALE("stale"),
  REJECTED("rejected"),
}

internal enum class LoofitWorkoutPublicationStatus(val rawValue: String) {
  PUBLISHED("published"),
  PENDING("pending"),
  SKIPPED("skipped"),
}

internal data class LoofitWorkoutMutationOutcome(
  val status: LoofitWorkoutCommandStatus,
  val sessionId: Long?,
)

internal data class LoofitWorkoutCommandResult(
  val status: LoofitWorkoutCommandStatus,
  val sessionId: Long?,
  val desiredRevision: Long,
  val publishedRevision: Long,
  val publicationStatus: LoofitWorkoutPublicationStatus,
  val publicationError: String? = null,
) {
  fun dictionary(): Map<String, Any?> = mapOf(
    "status" to status.rawValue,
    "sessionId" to sessionId,
    "desiredRevision" to desiredRevision,
    "publishedRevision" to publishedRevision,
    "publicationStatus" to publicationStatus.rawValue,
    "publicationError" to publicationError,
  )
}

internal data class LoofitWorkoutPartSnapshot(
  val id: Long?,
  val name: String,
  val color: String,
  val sortOrder: Int,
) {
  companion object
}

internal data class LoofitWorkoutTargetSnapshot(
  val routineId: Long,
  val routineDayId: Long,
  val title: String,
  val detail: String,
  val parts: List<LoofitWorkoutPartSnapshot>,
) {
  companion object
}

internal data class LoofitWidgetTheme(
  val brandName: String = "루핏",
  val accent: String = "#CFF56A",
  val accentText: String = "#0B0B0B",
  val background: String = "#141418",
  val labelColor: String = "#8A8A90",
  val brandColor: String = "#6B6B70",
  val titleColor: String = "#F4F4F2",
  val detailColor: String = "#8A8A90",
  val secondaryButtonBackground: String = "#26262B",
  val secondaryButtonText: String = "#F4F4F2",
  val heatmapBackground: String = "#141418",
  val heatmapTitleColor: String = "#8A8A90",
  val heatmapBrandColor: String = "#6B6B70",
  val heatmapFooterValueColor: String = "#D7D7D3",
  val heatmapWeekdayLabelColor: String = "#6B6B70",
  val heatmapWeekendLabelColor: String = "#C87A7A",
  val heatmapDayLabelColor: String = "#9A9AA0",
  val heatmapBaseColor: String = "#16161A",
  val heatmapEmptyColor: String = "#1B1B1F",
  val heatmapGapColor: String = "#00000000",
  val todayIndicatorColor: String = "#FFFFFF",
) {
  fun dictionary(): Map<String, String> = mapOf(
    "brandName" to brandName,
    "accent" to accent,
    "accentText" to accentText,
    "background" to background,
    "labelColor" to labelColor,
    "brandColor" to brandColor,
    "titleColor" to titleColor,
    "detailColor" to detailColor,
    "secondaryButtonBackground" to secondaryButtonBackground,
    "secondaryButtonText" to secondaryButtonText,
    "heatmapBackground" to heatmapBackground,
    "heatmapTitleColor" to heatmapTitleColor,
    "heatmapBrandColor" to heatmapBrandColor,
    "heatmapFooterValueColor" to heatmapFooterValueColor,
    "heatmapWeekdayLabelColor" to heatmapWeekdayLabelColor,
    "heatmapWeekendLabelColor" to heatmapWeekendLabelColor,
    "heatmapDayLabelColor" to heatmapDayLabelColor,
    "heatmapBaseColor" to heatmapBaseColor,
    "heatmapEmptyColor" to heatmapEmptyColor,
    "heatmapGapColor" to heatmapGapColor,
    "todayIndicatorColor" to todayIndicatorColor,
  )

  companion object {
    fun fromMap(value: Map<String, Any?>): LoofitWidgetTheme {
      val defaults = LoofitWidgetTheme()
      fun string(key: String, fallback: String): String =
        (value[key] as? String)?.takeIf { it.isNotBlank() } ?: fallback
      return LoofitWidgetTheme(
        brandName = string("brandName", defaults.brandName),
        accent = string("accent", defaults.accent),
        accentText = string("accentText", defaults.accentText),
        background = string("background", defaults.background),
        labelColor = string("labelColor", defaults.labelColor),
        brandColor = string("brandColor", defaults.brandColor),
        titleColor = string("titleColor", defaults.titleColor),
        detailColor = string("detailColor", defaults.detailColor),
        secondaryButtonBackground = string(
          "secondaryButtonBackground",
          defaults.secondaryButtonBackground,
        ),
        secondaryButtonText = string("secondaryButtonText", defaults.secondaryButtonText),
        heatmapBackground = string("heatmapBackground", defaults.heatmapBackground),
        heatmapTitleColor = string("heatmapTitleColor", defaults.heatmapTitleColor),
        heatmapBrandColor = string("heatmapBrandColor", defaults.heatmapBrandColor),
        heatmapFooterValueColor = string(
          "heatmapFooterValueColor",
          defaults.heatmapFooterValueColor,
        ),
        heatmapWeekdayLabelColor = string(
          "heatmapWeekdayLabelColor",
          defaults.heatmapWeekdayLabelColor,
        ),
        heatmapWeekendLabelColor = string(
          "heatmapWeekendLabelColor",
          defaults.heatmapWeekendLabelColor,
        ),
        heatmapDayLabelColor = string("heatmapDayLabelColor", defaults.heatmapDayLabelColor),
        heatmapBaseColor = string("heatmapBaseColor", defaults.heatmapBaseColor),
        heatmapEmptyColor = string("heatmapEmptyColor", defaults.heatmapEmptyColor),
        heatmapGapColor = string("heatmapGapColor", defaults.heatmapGapColor),
        todayIndicatorColor = string("todayIndicatorColor", defaults.todayIndicatorColor),
      )
    }
  }
}
