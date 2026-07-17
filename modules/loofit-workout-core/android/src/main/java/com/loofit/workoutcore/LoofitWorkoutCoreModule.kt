package com.loofit.workoutcore

import android.content.Context
import com.google.android.play.core.appupdate.AppUpdateManagerFactory
import com.google.android.play.core.install.model.UpdateAvailability
import expo.modules.kotlin.Promise
import expo.modules.kotlin.exception.CodedException
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class LoofitWorkoutCoreModule : Module() {
  private val externalCommandListener: (LoofitWorkoutCommandResult) -> Unit = { result ->
    sendEvent(EXTERNAL_COMMAND_EVENT, result.dictionary())
  }

  override fun definition() = ModuleDefinition {
    Name("LoofitWorkoutCore")

    Constant("widgetsConfigured") { true }
    Constant("widgetsDirectory") { null as String? }
    Events(EXTERNAL_COMMAND_EVENT)

    OnStartObserving(EXTERNAL_COMMAND_EVENT) {
      LoofitWorkoutCommandEvents.addListener(externalCommandListener)
    }

    OnStopObserving(EXTERNAL_COMMAND_EVENT) {
      LoofitWorkoutCommandEvents.removeListener(externalCommandListener)
    }

    AsyncFunction("executeWorkoutCommand") {
        record: Map<String, Any?>,
        _: String?,
        widgetsEnabled: Boolean,
      ->
      checkWidgetMode(widgetsEnabled)
      LoofitWorkoutPipeline.execute(context(), record.command(), widgetsEnabled).dictionary()
    }

    AsyncFunction("reconcileWorkoutSurfaces") {
        _: String?,
        widgetsEnabled: Boolean,
      ->
      checkWidgetMode(widgetsEnabled)
      LoofitWorkoutPipeline.reconcile(context(), widgetsEnabled).dictionary()
    }

    AsyncFunction("updateWidgetThemeSnapshot") {
        record: Map<String, Any?>,
        _: String?,
        widgetsEnabled: Boolean,
      ->
      checkWidgetMode(widgetsEnabled)
      LoofitWorkoutPipeline.updateTheme(
        context(),
        LoofitWidgetTheme.fromMap(record),
        widgetsEnabled,
      ).dictionary()
    }

    AsyncFunction("getAndroidUpdateInfo") { promise: Promise ->
      AppUpdateManagerFactory.create(context()).appUpdateInfo
        .addOnSuccessListener { info ->
          promise.resolve(
            mapOf(
              "updateAvailable" to
                (info.updateAvailability() == UpdateAvailability.UPDATE_AVAILABLE),
              "availableVersionCode" to info.availableVersionCode(),
            ),
          )
        }
        .addOnFailureListener { error ->
          promise.reject(
            "ERR_LOOFIT_PLAY_UPDATE",
            error.message ?: "Google Play update lookup failed.",
            error,
          )
        }
    }
  }

  private fun context(): Context = appContext.reactContext?.applicationContext
    ?: throw LoofitWorkoutCoreException("Android application context is unavailable.")

  private fun checkWidgetMode(widgetsEnabled: Boolean) {
    if (!widgetsEnabled) {
      throw LoofitWorkoutCoreException(
        "The requested widget mode does not match the installed Android build configuration.",
      )
    }
  }

  companion object {
    const val EXTERNAL_COMMAND_EVENT = "onExternalWorkoutCommand"
  }
}

private class LoofitWorkoutCoreException(message: String) : CodedException(message)

private fun Map<String, Any?>.command(): LoofitWorkoutCommand = when (this["type"] as? String) {
  "startNext" -> LoofitWorkoutCommand.StartNext
  "startRoutine" -> LoofitWorkoutCommand.StartRoutine(requiredLong("routineDayId"))
  "changeParts" -> LoofitWorkoutCommand.ChangeParts(
    expectedSessionId = requiredLong("expectedSessionId"),
    bodyPartIds = (this["bodyPartIds"] as? List<*>)
      .orEmpty()
      .map { (it as? Number)?.toLong() ?: throw LoofitWorkoutCoreException("Invalid bodyPartId.") },
    updateRoutine = this["updateRoutine"] as? Boolean ?: false,
  )
  "complete" -> LoofitWorkoutCommand.Complete(requiredLong("expectedSessionId"))
  "cancel" -> LoofitWorkoutCommand.Cancel(requiredLong("expectedSessionId"))
  else -> throw LoofitWorkoutCoreException("Unsupported workout command type.")
}

private fun Map<String, Any?>.requiredLong(key: String): Long =
  (this[key] as? Number)?.toLong()
    ?: throw LoofitWorkoutCoreException("Workout command requires $key.")
