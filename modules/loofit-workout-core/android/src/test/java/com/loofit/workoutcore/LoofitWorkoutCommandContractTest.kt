package com.loofit.workoutcore

import android.content.Context
import androidx.test.core.app.ApplicationProvider
import org.json.JSONArray
import org.json.JSONObject
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertNull
import org.junit.Before
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(sdk = [35])
class LoofitWorkoutCommandContractTest {
  private lateinit var context: Context
  private lateinit var database: LoofitSQLite

  @Before
  fun setUp() {
    context = ApplicationProvider.getApplicationContext()
    LoofitSQLite.databaseFile(context).parentFile?.deleteRecursively()
    database = LoofitSQLite.open(context)
  }

  @After
  fun tearDown() {
    database.close()
    LoofitSQLite.databaseFile(context).parentFile?.deleteRecursively()
  }

  @Test
  fun sharedCommandScenariosMatchAndroidEngine() {
    val fixture = loadFixture()
    assertEquals(1, fixture.getInt("version"))
    val seed = fixture.getJSONObject("seed")
    val scenarios = fixture.getJSONArray("scenarios")

    scenarios.objects().forEach { scenario ->
      val scenarioId = scenario.getString("id")
      resetScenarioDatabase()
      seedDatabase(seed)
      val capturedSessions = mutableMapOf<String, Long>()
      scenario.getJSONArray("steps").objects().forEachIndexed { index, step ->
        val command = makeCommand(step.getJSONObject("command"), capturedSessions)
        val result = LoofitWorkoutCommandEngine.execute(command, database)
        val expected = step.getJSONObject("expect")
        val context = "$scenarioId step ${index + 1}"

        assertEquals(context, expected.getString("status"), result.status.rawValue)
        assertExpectedSession(
          result.sessionId,
          expected.opt("sessionId"),
          capturedSessions,
          context,
        )
        step.optString("captureSessionAs").takeIf(String::isNotBlank)?.let { name ->
          capturedSessions[name] = requireNotNull(result.sessionId) { "$context must capture a session" }
        }
      }
      assertExpectedState(scenario.getJSONObject("expectState"), capturedSessions, scenarioId)
    }
  }

  private fun makeCommand(
    value: JSONObject,
    capturedSessions: Map<String, Long>,
  ): LoofitWorkoutCommand = when (value.getString("type")) {
    "startNext" -> LoofitWorkoutCommand.StartNext
    "startRoutine" -> LoofitWorkoutCommand.StartRoutine(value.getLong("routineDayId"))
    "changeParts" -> LoofitWorkoutCommand.ChangeParts(
      expectedSessionId = resolveReference(value.get("expectedSessionId"), capturedSessions),
      bodyPartIds = value.getJSONArray("bodyPartIds").longs(),
      updateRoutine = value.getBoolean("updateRoutine"),
    )
    "complete" -> LoofitWorkoutCommand.Complete(
      resolveReference(value.get("expectedSessionId"), capturedSessions),
    )
    "cancel" -> LoofitWorkoutCommand.Cancel(
      resolveReference(value.get("expectedSessionId"), capturedSessions),
    )
    else -> error("Unsupported command type: ${value.getString("type")}")
  }

  private fun assertExpectedSession(
    actual: Long?,
    expected: Any?,
    capturedSessions: Map<String, Long>,
    context: String,
  ) {
    if (expected == null || expected == JSONObject.NULL) {
      assertNull(context, actual)
      return
    }
    if (expected == "nonNull") {
      assertNotNull(context, actual)
      return
    }
    assertEquals(context, resolveReference(expected, capturedSessions), actual)
  }

  private fun assertExpectedState(
    expected: JSONObject,
    capturedSessions: Map<String, Long>,
    scenarioId: String,
  ) {
    assertEquals(
      scenarioId,
      expected.getLong("activeSessionCount"),
      database.firstLong("SELECT COUNT(*) FROM workout_sessions WHERE status = 'active'"),
    )
    assertEquals(
      scenarioId,
      expected.getLong("nextRoutineDayId"),
      database.firstLong("SELECT next_routine_day_id FROM routine_progress WHERE id = 1"),
    )
    expected.getJSONArray("sessions").objects().forEach { expectedSession ->
      val sessionId = resolveReference(
        JSONObject().put("ref", expectedSession.getString("ref")),
        capturedSessions,
      )
      assertEquals(
        scenarioId,
        expectedSession.getString("status"),
        database.firstString("SELECT status FROM workout_sessions WHERE id = ?", listOf(sessionId)),
      )
      assertEquals(
        scenarioId,
        expectedSession.getLong("routineDayId"),
        database.firstLong("SELECT routine_day_id FROM workout_sessions WHERE id = ?", listOf(sessionId)),
      )
      val parts = mutableListOf<String>()
      database.query(
        """
        SELECT body_part_name FROM workout_session_parts_snapshot
        WHERE workout_session_id = ? ORDER BY sort_order ASC, id ASC
        """.trimIndent(),
        listOf(sessionId),
      ) { parts += it.getString(0) }
      assertEquals(scenarioId, expectedSession.getJSONArray("parts").strings(), parts)
    }
  }

  private fun seedDatabase(seed: JSONObject) {
    val now = LoofitWorkoutDate.nowIso8601()
    val routineId = seed.getLong("routineId")
    seed.getJSONArray("bodyParts").objects().forEach { part ->
      database.executeInsert(
        """
        INSERT INTO body_parts
          (id, name, color, sort_order, is_archived, created_at, updated_at)
        VALUES (?, ?, ?, ?, 0, ?, ?)
        """.trimIndent(),
        listOf(
          part.getLong("id"),
          part.getString("name"),
          part.getString("color"),
          part.getInt("sortOrder"),
          now,
          now,
        ),
      )
    }
    database.executeInsert(
      "INSERT INTO routines (id, name, is_active, created_at, updated_at) VALUES (?, 'Contract Routine', 1, ?, ?)",
      listOf(routineId, now, now),
    )
    seed.getJSONArray("routineDays").objects().forEach { day ->
      val dayId = day.getLong("id")
      database.executeInsert(
        """
        INSERT INTO routine_days (id, routine_id, name, sort_order, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?)
        """.trimIndent(),
        listOf(dayId, routineId, day.getString("name"), day.getInt("sortOrder"), now, now),
      )
      day.getJSONArray("bodyPartIds").longs().forEachIndexed { index, bodyPartId ->
        database.executeInsert(
          "INSERT INTO routine_day_parts (routine_day_id, body_part_id, sort_order) VALUES (?, ?, ?)",
          listOf(dayId, bodyPartId, index),
        )
      }
    }
    database.executeInsert(
      """
      INSERT INTO routine_progress (id, active_routine_id, next_routine_day_id, updated_at)
      VALUES (1, ?, ?, ?)
      """.trimIndent(),
      listOf(routineId, seed.getLong("nextRoutineDayId"), now),
    )
  }

  private fun resetScenarioDatabase() {
    database.withImmediateTransaction {
      listOf(
        "DELETE FROM workout_session_parts_snapshot",
        "DELETE FROM workout_sessions",
        "DELETE FROM routine_day_parts",
        "DELETE FROM routine_days",
        "DELETE FROM routines",
        "DELETE FROM routine_progress",
        "DELETE FROM body_parts",
        "UPDATE widget_sync_state SET desired_revision = 0, published_revision = 0, last_error = NULL",
      ).forEach { database.executeUpdate(it) }
    }
  }

  private fun resolveReference(rawValue: Any, capturedSessions: Map<String, Long>): Long {
    val reference = rawValue as JSONObject
    val name = reference.getString("ref")
    val value = requireNotNull(capturedSessions[name]) { "Unknown session reference: $name" }
    return value + reference.optLong("offset", 0)
  }

  private fun loadFixture(): JSONObject {
    val stream = requireNotNull(javaClass.classLoader?.getResourceAsStream("workout-command-scenarios.json")) {
      "Missing workout-command-scenarios.json test resource"
    }
    return stream.bufferedReader().use { JSONObject(it.readText()) }
  }
}

private fun JSONArray.objects(): List<JSONObject> =
  (0 until length()).map(::getJSONObject)

private fun JSONArray.longs(): List<Long> = (0 until length()).map(::getLong)

private fun JSONArray.strings(): List<String> = (0 until length()).map(::getString)
