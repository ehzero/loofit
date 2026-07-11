import Constants from 'expo-constants';
import { Platform } from 'react-native';

import {
  executeWorkoutCommand,
  reconcileWorkoutSurfaces,
  updateWidgetThemeSnapshot,
  workoutCoreWidgetsDirectory,
  type CommandResult,
  type WidgetThemeSnapshot,
  type WorkoutCommand,
} from '@/modules/loofit-workout-core';
import { BRAND } from '@/src/config/brand';
import type { ThemeColors } from '@/src/theme/tokens';

type NativePipelineOptions = {
  databaseDirectory: string | null;
  widgetsEnabled: boolean;
};

export function usesNativeWorkoutPipeline(): boolean {
  return Platform.OS === 'ios';
}

export async function executeAppWorkoutCommand(
  command: WorkoutCommand
): Promise<CommandResult> {
  const options = nativePipelineOptions();
  return executeWorkoutCommand(command, options.databaseDirectory, options.widgetsEnabled);
}

export async function reconcileAppWorkoutSurfaces(): Promise<CommandResult | null> {
  if (!usesNativeWorkoutPipeline()) {
    return null;
  }

  const options = nativePipelineOptions();
  const result = await reconcileWorkoutSurfaces(options.databaseDirectory, options.widgetsEnabled);
  return requireSupportedResult(result, 'reconcile workout surfaces');
}

export async function updateAppWidgetTheme(colors: ThemeColors): Promise<CommandResult | null> {
  if (!usesNativeWorkoutPipeline()) {
    return null;
  }

  const options = nativePipelineOptions();
  const result = await updateWidgetThemeSnapshot(
    buildWidgetThemeSnapshot(colors),
    options.databaseDirectory,
    options.widgetsEnabled
  );
  return requireSupportedResult(result, 'update widget theme');
}

export function buildWidgetThemeSnapshot(colors: ThemeColors): WidgetThemeSnapshot {
  return {
    brandName: BRAND.displayName,
    accent: colors.accent,
    accentText: colors.accentText,
    background: colors.card,
    labelColor: colors.tx3,
    brandColor: colors.tx5,
    titleColor: colors.tx,
    detailColor: colors.tx3,
    secondaryButtonBackground: colors.surface2,
    secondaryButtonText: colors.tx,
    heatmapBackground: colors.card,
    heatmapTitleColor: colors.tx3,
    heatmapBrandColor: colors.tx5,
    heatmapFooterValueColor: colors.tx2,
    heatmapWeekdayLabelColor: colors.tx4,
    heatmapDayLabelColor: colors.tx3,
    heatmapBaseColor: colors.heatbase,
    heatmapEmptyColor: colors.heat0,
    heatmapGapColor: '#00000000',
  };
}

function nativePipelineOptions(): NativePipelineOptions {
  // The embedded config flag can differ from Metro's manifest when an
  // APP_ONLY development build is opened by a regular dev server. Requiring
  // the native App Group directory keeps the installed binary authoritative.
  const widgetsEnabled =
    Constants.expoConfig?.extra?.widgetsEnabled === true &&
    Boolean(workoutCoreWidgetsDirectory);
  return {
    databaseDirectory: widgetsEnabled ? workoutCoreWidgetsDirectory : null,
    widgetsEnabled,
  };
}

function requireSupportedResult(result: CommandResult, action: string): CommandResult {
  if (result.status === 'rejected') {
    throw new Error(`LoofitWorkoutCore could not ${action}`);
  }
  return result;
}
