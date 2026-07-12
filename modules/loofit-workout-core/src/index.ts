import { requireOptionalNativeModule } from 'expo-modules-core';

export type WorkoutCommand =
  | { type: 'startNext' }
  | { type: 'startRoutine'; routineDayId: number }
  | { type: 'startFree'; bodyPartIds: number[]; label?: string }
  | { type: 'changeRoutine'; expectedSessionId: number; routineDayId: number }
  | { type: 'changeFree'; expectedSessionId: number; bodyPartIds: number[] }
  | { type: 'complete'; expectedSessionId: number }
  | { type: 'cancel'; expectedSessionId: number };

export type CommandStatus = 'applied' | 'noop' | 'stale' | 'rejected';
export type PublicationStatus = 'published' | 'pending' | 'skipped';

export type CommandResult = {
  status: CommandStatus;
  sessionId: number | null;
  desiredRevision: number;
  publishedRevision: number;
  publicationStatus: PublicationStatus;
  publicationError: string | null;
};

export type WidgetThemeSnapshot = {
  brandName: string;
  accent: string;
  accentText: string;
  background: string;
  labelColor: string;
  brandColor: string;
  titleColor: string;
  detailColor: string;
  secondaryButtonBackground: string;
  secondaryButtonText: string;
  heatmapBackground: string;
  heatmapTitleColor: string;
  heatmapBrandColor: string;
  heatmapFooterValueColor: string;
  heatmapWeekdayLabelColor: string;
  heatmapDayLabelColor: string;
  heatmapBaseColor: string;
  heatmapEmptyColor: string;
  heatmapGapColor: string;
};

type NativeLoofitWorkoutCore = {
  widgetsConfigured?: boolean;
  widgetsDirectory?: string | null;
  executeWorkoutCommand(
    command: WorkoutCommand,
    databaseDirectory: string | null,
    widgetsEnabled: boolean
  ): Promise<CommandResult>;
  reconcileWorkoutSurfaces(
    databaseDirectory: string | null,
    widgetsEnabled: boolean
  ): Promise<CommandResult>;
  updateWidgetThemeSnapshot(
    theme: WidgetThemeSnapshot,
    databaseDirectory: string | null,
    widgetsEnabled: boolean
  ): Promise<CommandResult>;
};

const nativeModule = requireOptionalNativeModule<NativeLoofitWorkoutCore>('LoofitWorkoutCore');
export const workoutCoreNativeModuleAvailable = nativeModule !== null;
export const workoutCoreWidgetsConfigured = nativeModule?.widgetsConfigured === true;
export const workoutCoreWidgetsDirectory = nativeModule?.widgetsDirectory ?? null;
const unsupportedResult: CommandResult = {
  status: 'rejected',
  sessionId: null,
  desiredRevision: 0,
  publishedRevision: 0,
  publicationStatus: 'skipped',
  publicationError: null,
};

export function executeWorkoutCommand(
  command: WorkoutCommand,
  databaseDirectory: string | null,
  widgetsEnabled: boolean
): Promise<CommandResult> {
  return nativeModule
    ? nativeModule.executeWorkoutCommand(command, databaseDirectory, widgetsEnabled)
    : Promise.resolve(unsupportedResult);
}

export function reconcileWorkoutSurfaces(
  databaseDirectory: string | null,
  widgetsEnabled: boolean
): Promise<CommandResult> {
  return nativeModule
    ? nativeModule.reconcileWorkoutSurfaces(databaseDirectory, widgetsEnabled)
    : Promise.resolve(unsupportedResult);
}

export function updateWidgetThemeSnapshot(
  theme: WidgetThemeSnapshot,
  databaseDirectory: string | null,
  widgetsEnabled: boolean
): Promise<CommandResult> {
  return nativeModule
    ? nativeModule.updateWidgetThemeSnapshot(theme, databaseDirectory, widgetsEnabled)
    : Promise.resolve(unsupportedResult);
}
