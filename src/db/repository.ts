/**
 * Stable database facade used by the app layer.
 *
 * Domain implementations live in focused repository/query modules so callers
 * do not need to know how SQLite responsibilities are split internally.
 */
export {
  addBodyPart,
  archiveBodyPart,
  getBodyParts,
} from './repositories/body-part-repository';
export {
  addEmptyRoutineDay,
  addRoutineDay,
  createEmptyRoutine,
  createRoutineFromTemplate,
  deleteRoutineDay,
  getActiveRoutine,
  getRoutineDays,
  getRoutineProgress,
  moveRoutineDay,
  renameRoutineDay,
  setNextRoutineDay,
  setRoutineDayParts,
} from './repositories/routine-repository';
export {
  cancelActiveWorkout,
  changeActiveWorkout,
  completeActiveWorkout,
  deleteSession,
  getSessionById,
  getSessions,
  startWorkout,
  updateSession,
} from './repositories/session-repository';
export type {
  GetSessionsOptions,
  RepositoryWorkoutResult,
} from './repositories/session-repository';
export { getAppSetting, setAppSetting } from './repositories/settings-repository';
export { getOverview } from './queries/overview-query';

import { resetDatabaseForDevelopment } from './database';

export async function resetAllData(): Promise<boolean> {
  await resetDatabaseForDevelopment();
  return true;
}
