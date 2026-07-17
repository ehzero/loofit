package com.loofit.workoutcore

import android.content.Context
import org.json.JSONObject
import java.io.File

internal object LoofitWorkoutSnapshotStore {
  private const val directoryName = "LoofitWidgets"
  private const val fileName = "loofit-widget-snapshot.json"

  fun file(context: Context): File = File(File(context.filesDir, directoryName), fileName)

  fun load(context: Context): LoofitWorkoutSnapshot? {
    val file = file(context)
    if (!file.isFile) return null
    return runCatching {
      LoofitWorkoutSnapshot.fromJson(JSONObject(file.readText(Charsets.UTF_8)))
    }.getOrNull()
  }

  fun save(context: Context, snapshot: LoofitWorkoutSnapshot) {
    val target = file(context)
    target.parentFile?.mkdirs()
    val temporary = File(target.parentFile, "$fileName.tmp")
    temporary.writeText(snapshot.json().toString(), Charsets.UTF_8)
    check(temporary.renameTo(target) || run {
      temporary.copyTo(target, overwrite = true)
      temporary.delete()
    }) { "Unable to atomically publish the Android widget snapshot." }
  }
}
