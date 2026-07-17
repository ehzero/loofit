import { PermissionsAndroid, Platform } from 'react-native';

import {
  addExternalWorkoutCommandListener,
  executeWorkoutCommand,
  reconcileWorkoutSurfaces,
  updateWidgetThemeSnapshot,
  workoutCoreNativeModuleAvailable,
  workoutCoreWidgetsConfigured,
  workoutCoreWidgetsDirectory,
  type CommandResult,
  type WidgetThemeSnapshot,
  type WorkoutCommand,
} from '@/modules/loofit-workout-core';
import { BRAND } from '@/src/config/brand';
import type { ThemeColors } from '@/src/theme/tokens';
import { resolveIosNativeBuildMode } from './ios-build-mode';
import { widgetColor } from './widget-design-system';

type NativePipelineOptions = {
  databaseDirectory: string | null;
  widgetsEnabled: boolean;
};

type WorkoutCommandSubscription = { remove(): void };

export function usesNativeWorkoutPipeline(): boolean {
  return Platform.OS === 'ios' || Platform.OS === 'android';
}

export function subscribeToExternalWorkoutCommands(
  listener: (result: CommandResult) => void
): WorkoutCommandSubscription | null {
  if (Platform.OS !== 'android') {
    return null;
  }
  return addExternalWorkoutCommandListener(listener);
}

export async function executeAppWorkoutCommand(
  command: WorkoutCommand
): Promise<CommandResult> {
  if (Platform.OS === 'android' && (command.type === 'startNext' || command.type === 'startRoutine')) {
    await requestAndroidWorkoutNotificationPermission();
  }
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
    accent: widgetColor(colors, 'accent'),
    accentText: widgetColor(colors, 'onAccent'),
    background: widgetColor(colors, 'surface'),
    labelColor: widgetColor(colors, 'textMedium'),
    brandColor: widgetColor(colors, 'textLow'),
    titleColor: widgetColor(colors, 'textHigh'),
    detailColor: widgetColor(colors, 'textMedium'),
    secondaryButtonBackground: widgetColor(colors, 'raisedSurface'),
    secondaryButtonText: widgetColor(colors, 'textHigh'),
    heatmapBackground: widgetColor(colors, 'surface'),
    heatmapTitleColor: widgetColor(colors, 'textMedium'),
    heatmapBrandColor: widgetColor(colors, 'textLow'),
    heatmapFooterValueColor: widgetColor(colors, 'textMedium'),
    heatmapWeekdayLabelColor: widgetColor(colors, 'textLow'),
    heatmapWeekendLabelColor: widgetColor(colors, 'textWeekend'),
    heatmapDayLabelColor: widgetColor(colors, 'textLow'),
    heatmapBaseColor: widgetColor(colors, 'heatmapBase'),
    heatmapEmptyColor: widgetColor(colors, 'heatmapEmpty'),
    heatmapGapColor: '#00000000',
    todayIndicatorColor: widgetColor(colors, 'todayIndicator'),
  };
}

function nativePipelineOptions(): NativePipelineOptions {
  // Read build mode from the installed native binary. Metro can serve a full
  // manifest to an APP_ONLY development build, so its manifest is not an
  // authoritative source for entitlements or App Group availability.
  if (Platform.OS === 'ios') {
    return resolveIosNativeBuildMode(
      workoutCoreNativeModuleAvailable,
      workoutCoreWidgetsConfigured,
      workoutCoreWidgetsDirectory
    );
  }
  if (Platform.OS === 'android') {
    if (!workoutCoreNativeModuleAvailable) {
      throw new Error('This Android build does not contain the required LoofitWorkoutCore module.');
    }
    if (!workoutCoreWidgetsConfigured) {
      throw new Error('This Android build does not contain the required Loofit widgets.');
    }
    return { widgetsEnabled: true, databaseDirectory: null };
  }
  return { widgetsEnabled: false, databaseDirectory: null };
}

async function requestAndroidWorkoutNotificationPermission(): Promise<void> {
  if (typeof Platform.Version !== 'number' || Platform.Version < 33) {
    return;
  }
  const permission = PermissionsAndroid.PERMISSIONS.POST_NOTIFICATIONS;
  if (await PermissionsAndroid.check(permission)) {
    return;
  }
  await PermissionsAndroid.request(permission);
}

function requireSupportedResult(result: CommandResult, action: string): CommandResult {
  if (result.status === 'rejected') {
    throw new Error(`LoofitWorkoutCore could not ${action}`);
  }
  return result;
}
