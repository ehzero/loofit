import { describe, expect, it } from 'vitest';

import { resolveIosNativeBuildMode } from './ios-build-mode';

describe('resolveIosNativeBuildMode', () => {
  it('fails when the installed iOS binary is missing the shared native core', () => {
    expect(() => resolveIosNativeBuildMode(false, false, null)).toThrow(
      'does not contain the required LoofitWorkoutCore native module'
    );
  });

  it('uses the default app database only for an app-only binary', () => {
    expect(resolveIosNativeBuildMode(true, false, null)).toEqual({
      widgetsEnabled: false,
      databaseDirectory: null,
    });
  });

  it('fails when an app-only marker is mixed with stale App Group configuration', () => {
    expect(() => resolveIosNativeBuildMode(true, false, '/stale-app-group/LoofitWidgets')).toThrow(
      'app-only iOS build still exposes an App Group database directory'
    );
  });

  it('uses the App Group database for a widget-enabled binary', () => {
    expect(resolveIosNativeBuildMode(true, true, '/app-group/LoofitWidgets')).toEqual({
      widgetsEnabled: true,
      databaseDirectory: '/app-group/LoofitWidgets',
    });
  });

  it('fails instead of falling back when the App Group directory is missing', () => {
    expect(() => resolveIosNativeBuildMode(true, true, null)).toThrow(
      'widget-enabled iOS build cannot access the configured App Group'
    );
  });
});
