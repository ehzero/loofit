const fs = require('fs');
const path = require('path');

const { IOSConfig, withDangerousMod, withXcodeProject } = require('@expo/config-plugins');

const brand = require('../src/config/brand.json');
const widgetRendererContract = require('../src/widgets/widget-renderer-contract.json');

const TARGET_NAME = 'ExpoWidgetsTarget';
const RENDERER_CONTRACT_FILE = 'LoofitWidgetRendererContract.generated.swift';

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

function heatmapWidget({ name, kind, variant, displayName, description, family }) {
  return String.raw`import SwiftUI
import WidgetKit
import LoofitWorkoutCore

struct ${name}: Widget {
  private let kind = LoofitWidgetKinds.${kind}

  var body: some WidgetConfiguration {
    StaticConfiguration(kind: kind, provider: LoofitSnapshotTimelineProvider()) { entry in
      LoofitHeatmapWidgetView(entry: entry, variant: .${variant})
    }
    .configurationDisplayName("${displayName}")
    .description("${description}")
    .supportedFamilies([.${family}])
    .contentMarginsDisabled()
  }
}
`;
}

function widgetTargetDeclaration() {
  return `target "${TARGET_NAME}" do
${corePodDeclaration()}

    use_frameworks! :linkage => podfile_properties['ios.useFrameworks'].to_sym if podfile_properties['ios.useFrameworks']
    use_frameworks! :linkage => ENV['USE_FRAMEWORKS'].to_sym if ENV['USE_FRAMEWORKS']
end`;
}

function widgetTargetRange(lines) {
  const targetDeclaration = `target "${TARGET_NAME}" do`;
  const start = lines.findIndex((line) => line.trim() === targetDeclaration);
  if (start < 0) {
    throw new Error(
      `[Loofit] ${TARGET_NAME} Podfile target was not generated before the native widget plugin ran.`
    );
  }

  let depth = 0;
  for (let index = start; index < lines.length; index += 1) {
    const line = lines[index].trim();
    if (/^(?:target\b.*\bdo|if\b|unless\b|case\b|begin\b|for\b|while\b|until\b|def\b|class\b|module\b)/.test(line)) {
      depth += 1;
    }
    if (/^end\b/.test(line)) {
      depth -= 1;
      if (depth === 0) {
        return { start, end: index };
      }
    }
  }

  throw new Error(`[Loofit] Could not isolate the generated ${TARGET_NAME} Podfile target.`);
}

function isolateWidgetExtensionPodDependencies(podfilePath) {
  // expo-widgets owns target/entitlement generation only. Its runtime Podfile
  // hooks pull ExpoModulesCore, React Native, and Hermes into the extension;
  // replace that target with the repo-owned, dependency-light Swift core.
  const lines = fs.readFileSync(podfilePath, 'utf8')
    .split('\n')
    .filter((line) => !line.includes("require.resolve('expo-widgets/package.json')"))
    .filter((line) => !line.includes('expo_widgets_post_install(installer)'));
  const range = widgetTargetRange(lines);
  lines.splice(range.start, range.end - range.start + 1, widgetTargetDeclaration());
  fs.writeFileSync(podfilePath, lines.join('\n'), 'utf8');
}

function removeWidgetExpoRuntimeBuildArtifacts(project, target) {
  const objects = project.hash.project.objects;
  const shellPhases = objects.PBXShellScriptBuildPhase ?? {};
  const sourcePhases = objects.PBXSourcesBuildPhase ?? {};
  const buildFiles = objects.PBXBuildFile ?? {};

  target.buildPhases = (target.buildPhases ?? []).filter((reference) => {
    const phase = shellPhases[reference.value];
    const name = String(reference.comment ?? phase?.name ?? '').replaceAll('"', '');
    if (name !== '[Expo] Configure project') {
      return true;
    }
    delete shellPhases[reference.value];
    delete shellPhases[`${reference.value}_comment`];
    return false;
  });

  for (const reference of target.buildPhases ?? []) {
    const phase = sourcePhases[reference.value];
    if (!phase?.files) {
      continue;
    }
    phase.files = phase.files.filter((file) => {
      if (file.comment !== 'ExpoModulesProvider.swift in Sources') {
        return true;
      }
      delete buildFiles[file.value];
      delete buildFiles[`${file.value}_comment`];
      return false;
    });
  }

  const fileReferences = objects.PBXFileReference ?? {};
  const widgetProviderReferences = new Set(
    Object.entries(fileReferences)
      .filter(([, file]) =>
        typeof file === 'object' &&
        String(file.path ?? '').includes('Pods-ExpoWidgetsTarget/ExpoModulesProvider.swift')
      )
      .map(([uuid]) => uuid)
  );
  if (widgetProviderReferences.size > 0) {
    for (const group of Object.values(objects.PBXGroup ?? {})) {
      if (typeof group === 'object' && Array.isArray(group.children)) {
        group.children = group.children.filter(
          (child) => !widgetProviderReferences.has(child.value)
        );
      }
    }
    for (const uuid of widgetProviderReferences) {
      delete fileReferences[uuid];
      delete fileReferences[`${uuid}_comment`];
    }
  }
}

function includeGeneratedRendererContract(project) {
  if (project.hasFile(RENDERER_CONTRACT_FILE)) {
    return;
  }
  const targetUuid = project.findTargetKey(TARGET_NAME);
  if (!targetUuid) {
    throw new Error(`[Loofit] Could not resolve ${TARGET_NAME} while linking renderer contract.`);
  }
  IOSConfig.XcodeUtils.addBuildSourceFileToGroup({
    filepath: RENDERER_CONTRACT_FILE,
    groupName: TARGET_NAME,
    project,
    targetUuid,
  });
}

function withWidgetBuildSettings(config) {
  return withXcodeProject(config, (nextConfig) => {
    if (nextConfig.extra?.widgetsEnabled === false || process.env.LOOFIT_APP_ONLY === '1') {
      return nextConfig;
    }

    const project = nextConfig.modResults;
    const target = project.pbxTargetByName(TARGET_NAME);
    if (!target) {
      throw new Error(`[Loofit] ${TARGET_NAME} was not generated before build settings ran.`);
    }

    removeWidgetExpoRuntimeBuildArtifacts(project, target);
    includeGeneratedRendererContract(project);

    const configurationList = project.pbxXCConfigurationList()[target.buildConfigurationList];
    const configurations = project.pbxXCBuildConfigurationSection();
    let configuredRelease = false;

    for (const reference of configurationList?.buildConfigurations ?? []) {
      const configuration = configurations[reference.value];
      if (!configuration || !configuration.buildSettings) {
        continue;
      }
      if (configuration.name === 'Release') {
        configuration.buildSettings.SWIFT_OPTIMIZATION_LEVEL = '"-O"';
        configuration.buildSettings.SWIFT_COMPILATION_MODE = 'wholemodule';
        configuredRelease = true;
      } else if (configuration.name === 'Debug') {
        configuration.buildSettings.SWIFT_OPTIMIZATION_LEVEL = '"-Onone"';
        configuration.buildSettings.SWIFT_COMPILATION_MODE = 'incremental';
      }
    }

    if (!configuredRelease) {
      throw new Error(`[Loofit] ${TARGET_NAME} Release optimization could not be configured.`);
    }
    return nextConfig;
  });
}

module.exports = function withLoofitNativeWidgets(config) {
  const nextConfig = withWidgetBuildSettings(config);
  return withDangerousMod(nextConfig, [
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
        path.join(targetDirectory, RENDERER_CONTRACT_FILE),
        readNativeSource(RENDERER_CONTRACT_FILE)
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
      for (const filename of [
        'CurrentMonthCalendarWidget.swift',
        'HeatmapFourWeekExpandedWidget.swift',
        'RoutineProgressWidget.swift',
        'BodyPartDurationWidget.swift',
        'RoutineProgressLockScreenWidget.swift',
      ]) {
        write(path.join(targetDirectory, filename), readNativeSource(filename));
      }
      write(
        path.join(targetDirectory, 'HeatmapWeekWidget.swift'),
        heatmapWidget({
          name: 'HeatmapWeekWidget',
          kind: widgetRendererContract.heatmap.variants.week.kindAccessor,
          variant: widgetRendererContract.heatmap.variants.week.nativeCase,
          displayName: `${brand.displayName} 히트맵 · 7일`,
          description: 'Review your last 7 days of workouts.',
          family: widgetRendererContract.heatmap.variants.week.family,
        })
      );
      write(
        path.join(targetDirectory, 'HeatmapMonthWidget.swift'),
        heatmapWidget({
          name: 'HeatmapMonthWidget',
          kind: widgetRendererContract.heatmap.variants.month.kindAccessor,
          variant: widgetRendererContract.heatmap.variants.month.nativeCase,
          displayName: `${brand.displayName} 히트맵 · 5주`,
          description: 'Review your last 5 calendar weeks of workouts.',
          family: widgetRendererContract.heatmap.variants.month.family,
        })
      );
      write(
        path.join(targetDirectory, 'HeatmapYearWidget.swift'),
        heatmapWidget({
          name: 'HeatmapYearWidget',
          kind: widgetRendererContract.heatmap.variants.year.kindAccessor,
          variant: widgetRendererContract.heatmap.variants.year.nativeCase,
          displayName: `${brand.displayName} 히트맵 · 6개월`,
          description: 'Review your recent 6 months of workouts.',
          family: widgetRendererContract.heatmap.variants.year.family,
        })
      );

      isolateWidgetExtensionPodDependencies(podfilePath);
      return nextConfig;
    },
  ]);
};
