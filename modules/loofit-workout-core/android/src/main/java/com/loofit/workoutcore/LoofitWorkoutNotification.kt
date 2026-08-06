package com.loofit.workoutcore

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat

internal object LoofitWorkoutNotification {
  private const val channelId = "loofit_active_workout"
  private const val notificationId = 5_420

  fun reconcile(context: Context, snapshot: LoofitWorkoutSnapshot) {
    val active = snapshot.activeSession
    if (active == null) {
      NotificationManagerCompat.from(context).cancel(notificationId)
      return
    }
    createChannel(context)
    if (
      Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU &&
      ContextCompat.checkSelfPermission(context, Manifest.permission.POST_NOTIFICATIONS) !=
      PackageManager.PERMISSION_GRANTED
    ) return

    val openIntent = context.packageManager.getLaunchIntentForPackage(context.packageName)
      ?: Intent(Intent.ACTION_MAIN).setPackage(context.packageName)
    val contentIntent = PendingIntent.getActivity(
      context,
      8_001,
      openIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val endIntent = Intent(context, LoofitWorkoutActionReceiver::class.java)
      .setAction("${context.packageName}.LOOFIT_WORKOUT_COMMAND")
      .putExtra(LoofitWorkoutActionReceiver.EXTRA_COMMAND, "complete")
      .putExtra(LoofitWorkoutActionReceiver.EXTRA_SESSION_ID, active.id)
    val endPendingIntent = PendingIntent.getBroadcast(
      context,
      (8_100L + active.id).hashCode(),
      endIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )
    val startedAtMillis = LoofitWorkoutDate.parse(active.startedAt)?.toEpochMilli()
      ?: System.currentTimeMillis()
    val notification = NotificationCompat.Builder(context, channelId)
      .setSmallIcon(R.drawable.loofit_notification)
      .setContentTitle(active.title)
      .setContentText(active.detail.ifBlank { LoofitWidgetLayoutContract.Control.Copy.active })
      .setContentIntent(contentIntent)
      .setCategory(NotificationCompat.CATEGORY_STATUS)
      .setOngoing(true)
      .setOnlyAlertOnce(true)
      .setShowWhen(true)
      .setWhen(startedAtMillis)
      .setUsesChronometer(true)
      .setPriority(NotificationCompat.PRIORITY_LOW)
      .addAction(0, LoofitWidgetLayoutContract.Control.Copy.end, endPendingIntent)
      .build()
    NotificationManagerCompat.from(context).notify(notificationId, notification)
  }

  private fun createChannel(context: Context) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val manager = context.getSystemService(NotificationManager::class.java)
    val channel = NotificationChannel(
      channelId,
      "운동 중 상태",
      NotificationManager.IMPORTANCE_LOW,
    ).apply {
      description = "진행 중인 운동 시간과 종료 액션을 표시합니다."
      setShowBadge(false)
    }
    manager.createNotificationChannel(channel)
  }
}
