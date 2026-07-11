const fs = require('fs');
const path = require('path');

const { withDangerousMod } = require('@expo/config-plugins');

const brand = require('../src/config/brand.json');

const TARGET_NAME = 'ExpoWidgetsTarget';
const CORE_POD_PATTERN =
  /^\s*pod 'LoofitWorkoutCore', :path => '\.\.\/modules\/loofit-workout-core\/ios'(?:, :testspecs => \['Tests'\])?\s*$/m;

function corePodDeclaration() {
  const testSpec = process.env.LOOFIT_CORE_TESTS === '1' ? ", :testspecs => ['Tests']" : '';
  return `    pod 'LoofitWorkoutCore', :path => '../modules/loofit-workout-core/ios'${testSpec}`;
}

function write(targetPath, contents) {
  fs.mkdirSync(path.dirname(targetPath), { recursive: true });
  fs.writeFileSync(targetPath, contents);
}

function readNativeSource(name) {
  return fs.readFileSync(path.join(__dirname, 'native-widgets', name), 'utf8');
}

function heatmapWidget({ name, kind, title, variant, displayName, description, family }) {
  return String.raw`import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct ${name}: Widget {
  private let kind = LoofitWidgetKinds.${kind}

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      LoofitHeatmapWidgetView(entry: entry, title: "${title}", variant: .${variant})
    }
    .configurationDisplayName("${displayName}")
    .description("${description}")
    .supportedFamilies([.${family}])
    .contentMarginsDisabled()
  }
}
`;
}

function linkWorkoutCorePod(podfilePath) {
  let podfile = fs.readFileSync(podfilePath, 'utf8');
  const declaration = corePodDeclaration();
  if (CORE_POD_PATTERN.test(podfile)) {
    podfile = podfile.replace(CORE_POD_PATTERN, declaration);
    fs.writeFileSync(podfilePath, podfile, 'utf8');
    return;
  }

  const targetDeclaration = `target "${TARGET_NAME}" do`;
  if (!podfile.includes(targetDeclaration)) {
    throw new Error(
      `[Loofit] ${TARGET_NAME} Podfile target was not generated before the native widget plugin ran.`
    );
  }

  podfile = podfile.replace(
    targetDeclaration,
    `${targetDeclaration}\n${declaration}`
  );
  fs.writeFileSync(podfilePath, podfile, 'utf8');
}

module.exports = function withLoofitNativeWidgets(config) {
  return withDangerousMod(config, [
    'ios',
    async (nextConfig) => {
      if (nextConfig.extra?.widgetsEnabled === false || process.env.LOOFIT_APP_ONLY === '1') {
        return nextConfig;
      }

      const projectRoot = nextConfig.modRequest.platformProjectRoot;
      const targetDirectory = path.join(projectRoot, TARGET_NAME);
      const podfilePath = path.join(projectRoot, 'Podfile');

      if (!fs.existsSync(targetDirectory)) {
        throw new Error(
          `[Loofit] ${TARGET_NAME} was not generated. Ensure expo-widgets is enabled for this build.`
        );
      }

      // Keep the expo-widgets target/entitlement scaffold, but replace every
      // generated runtime view with the repo-owned native WidgetKit pipeline.
      write(
        path.join(targetDirectory, 'index.swift'),
        readNativeSource('LoofitWidgetBundle.swift')
      );
      write(
        path.join(targetDirectory, 'WorkoutControlWidget.swift'),
        readNativeSource('WorkoutControlWidget.swift')
      );
      write(
        path.join(targetDirectory, 'WorkoutLockScreenWidget.swift'),
        readNativeSource('WorkoutLockScreenWidget.swift')
      );
      write(
        path.join(targetDirectory, 'WorkoutLockScreenSummaryWidget.swift'),
        readNativeSource('WorkoutLockScreenSummaryWidget.swift')
      );
      write(
        path.join(targetDirectory, 'HeatmapWeekWidget.swift'),
        heatmapWidget({
          name: 'HeatmapWeekWidget',
          kind: 'heatmapWeek',
          title: '지난 7일',
          variant: 'week',
          displayName: `${brand.displayName} 히트맵 · 7일`,
          description: 'Review your last 7 days of workouts.',
          family: 'systemSmall',
        })
      );
      write(
        path.join(targetDirectory, 'HeatmapMonthWidget.swift'),
        heatmapWidget({
          name: 'HeatmapMonthWidget',
          kind: 'heatmapMonth',
          title: '지난 30일',
          variant: 'month',
          displayName: `${brand.displayName} 히트맵 · 30일`,
          description: 'Review your last 30 days of workouts.',
          family: 'systemSmall',
        })
      );
      write(
        path.join(targetDirectory, 'HeatmapYearWidget.swift'),
        heatmapWidget({
          name: 'HeatmapYearWidget',
          kind: 'heatmapSixMonths',
          title: '지난 6개월',
          variant: 'sixMonths',
          displayName: `${brand.displayName} 히트맵 · 6개월`,
          description: 'Review your recent 6 months of workouts.',
          family: 'systemMedium',
        })
      );

      linkWorkoutCorePod(podfilePath);
      return nextConfig;
    },
  ]);
};
