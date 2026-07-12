export type IosNativeBuildMode = {
  widgetsEnabled: boolean;
  databaseDirectory: string | null;
};

const MISSING_APP_GROUP_DIRECTORY =
  'This widget-enabled iOS build cannot access the configured App Group database directory.';
const MISSING_NATIVE_CORE =
  'This iOS build does not contain the required LoofitWorkoutCore native module.';
const INCONSISTENT_APP_ONLY_BUILD =
  'This app-only iOS build still exposes an App Group database directory. Regenerate the native project for one explicit build mode.';

export function resolveIosNativeBuildMode(
  nativeModuleAvailable: boolean,
  widgetsConfigured: boolean,
  widgetsDirectory: string | null
): IosNativeBuildMode {
  if (!nativeModuleAvailable) {
    throw new Error(MISSING_NATIVE_CORE);
  }

  if (!widgetsConfigured) {
    if (widgetsDirectory) {
      throw new Error(INCONSISTENT_APP_ONLY_BUILD);
    }
    return {
      widgetsEnabled: false,
      databaseDirectory: null,
    };
  }

  if (!widgetsDirectory) {
    throw new Error(MISSING_APP_GROUP_DIRECTORY);
  }

  return {
    widgetsEnabled: true,
    databaseDirectory: widgetsDirectory,
  };
}
