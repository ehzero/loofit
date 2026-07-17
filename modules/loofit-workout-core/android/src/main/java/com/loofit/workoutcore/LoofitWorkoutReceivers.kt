package com.loofit.workoutcore

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.os.Handler
import android.os.Looper
import java.time.LocalDate
import java.time.ZoneId
import java.util.concurrent.CopyOnWriteArraySet
import java.util.concurrent.atomic.AtomicBoolean
import java.util.concurrent.atomic.AtomicLong

class LoofitWorkoutActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val command = intent.getStringExtra(EXTRA_COMMAND) ?: return
    val pending = goAsync()
    Thread {
      try {
        val parsed = when (command) {
          "startNext" -> LoofitWorkoutCommand.StartNext
          "complete" -> LoofitWorkoutCommand.Complete(
            intent.getLongExtra(EXTRA_SESSION_ID, Long.MIN_VALUE),
          )
          "cancel" -> LoofitWorkoutCommand.Cancel(
            intent.getLongExtra(EXTRA_SESSION_ID, Long.MIN_VALUE),
          )
          else -> null
        }
        if (parsed != null && !parsed.hasInvalidSessionId()) {
          val result = LoofitWorkoutPipeline.execute(
            context.applicationContext,
            parsed,
            widgetsEnabled = true,
          )
          LoofitWorkoutCommandEvents.publish(result)
        }
      } finally {
        pending.finish()
      }
    }.start()
  }

  companion object {
    const val EXTRA_COMMAND = "loofit_command"
    const val EXTRA_SESSION_ID = "loofit_expected_session_id"
  }
}

internal object LoofitWorkoutCommandEvents {
  private val mainHandler = Handler(Looper.getMainLooper())
  private val listeners = CopyOnWriteArraySet<(LoofitWorkoutCommandResult) -> Unit>()

  fun addListener(listener: (LoofitWorkoutCommandResult) -> Unit) {
    listeners.add(listener)
  }

  fun removeListener(listener: (LoofitWorkoutCommandResult) -> Unit) {
    listeners.remove(listener)
  }

  fun publish(result: LoofitWorkoutCommandResult) {
    mainHandler.post {
      listeners.forEach { listener -> listener(result) }
    }
  }
}

class LoofitWorkoutBootReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val supported = setOf(
      Intent.ACTION_BOOT_COMPLETED,
      Intent.ACTION_MY_PACKAGE_REPLACED,
      Intent.ACTION_TIME_CHANGED,
      Intent.ACTION_TIMEZONE_CHANGED,
      ACTION_LOCAL_DAY_CHANGED,
    )
    if (intent.action !in supported) return
    val pending = goAsync()
    Thread {
      try {
        LoofitWorkoutPipeline.reconcile(context.applicationContext, widgetsEnabled = true)
      } finally {
        LoofitDayChangeScheduler.schedule(context.applicationContext)
        pending.finish()
      }
    }.start()
  }

  companion object {
    const val ACTION_LOCAL_DAY_CHANGED = "com.loofit.workoutcore.LOCAL_DAY_CHANGED"
  }
}

internal object LoofitWidgetReconcileScheduler {
  private val running = AtomicBoolean(false)
  private val lastRequestAt = AtomicLong(0)

  fun request(context: Context, force: Boolean = false) {
    val now = System.currentTimeMillis()
    if (!force && now - lastRequestAt.get() < 10_000) return
    lastRequestAt.set(now)
    if (!running.compareAndSet(false, true)) return
    Thread {
      try {
        LoofitWorkoutPipeline.reconcile(context.applicationContext, widgetsEnabled = true)
      } finally {
        running.set(false)
      }
    }.start()
  }
}

internal object LoofitDayChangeScheduler {
  fun schedule(context: Context) {
    val zone = ZoneId.systemDefault()
    val triggerAt = LocalDate.now(zone)
      .plusDays(1)
      .atStartOfDay(zone)
      .toInstant()
      .toEpochMilli()
    val intent = Intent(context, LoofitWorkoutBootReceiver::class.java)
      .setAction(LoofitWorkoutBootReceiver.ACTION_LOCAL_DAY_CHANGED)
    val pendingIntent = PendingIntent.getBroadcast(
      context,
      9_001,
      intent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val alarmManager = context.getSystemService(AlarmManager::class.java)
    alarmManager.setAndAllowWhileIdle(AlarmManager.RTC_WAKEUP, triggerAt, pendingIntent)
  }
}

private fun LoofitWorkoutCommand.hasInvalidSessionId(): Boolean = when (this) {
  is LoofitWorkoutCommand.Complete -> expectedSessionId == Long.MIN_VALUE
  is LoofitWorkoutCommand.Cancel -> expectedSessionId == Long.MIN_VALUE
  else -> false
}
