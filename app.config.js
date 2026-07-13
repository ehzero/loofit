const appJson = require('./app.json');
const packageJson = require('./package.json');
const brand = require('./src/config/brand.json');

const widgetsPlugin = [
  'expo-widgets',
  {
    bundleIdentifier: 'com.loofit.app.widgets',
    groupIdentifier: 'group.com.loofit.app',
    widgets: [
      {
        name: 'WorkoutControlWidget',
        displayName: `${brand.displayName} 운동`,
        description: "Start, finish, and review today's workout.",
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'HeatmapWeekWidget',
        displayName: `${brand.displayName} 히트맵 · 7일`,
        description: 'Review your last 7 days of workouts.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'HeatmapMonthWidget',
        displayName: `${brand.displayName} 히트맵 · 5주`,
        description: 'Review your last 5 calendar weeks of workouts.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'HeatmapYearWidget',
        displayName: `${brand.displayName} 히트맵 · 6개월`,
        description: 'Review your recent 6 months of workouts.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemMedium'],
      },
      {
        name: 'CurrentMonthCalendarWidget',
        displayName: `${brand.displayName} 이번 달 캘린더`,
        description: 'Review workouts from the current calendar month.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'HeatmapFourWeekExpandedWidget',
        displayName: `${brand.displayName} 지난 4주 상세`,
        description: 'Review workout dates and body parts from the last four calendar weeks.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemMedium'],
      },
      {
        name: 'RoutineProgressWidget',
        displayName: `${brand.displayName} 루틴 진행`,
        description: 'Review your routine order and recent workouts.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'BodyPartDurationWidget',
        displayName: `${brand.displayName} 부위별 운동 시간`,
        description: 'Review workout time by body part over the last 30 days.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'WorkoutLockScreenWidget',
        displayName: `${brand.displayName} 잠금화면 운동`,
        description: 'Check your next workout, active workout, and completion on the Lock Screen.',
        contentMarginsDisabled: true,
        supportedFamilies: ['accessoryInline', 'accessoryCircular', 'accessoryRectangular'],
      },
      {
        name: 'WorkoutLockScreenSummaryWidget',
        displayName: `${brand.displayName} 잠금화면 요약`,
        description: 'Review your recent 7 days on the Lock Screen.',
        contentMarginsDisabled: true,
        supportedFamilies: ['accessoryRectangular'],
      },
      {
        name: 'RoutineProgressLockScreenWidget',
        displayName: `${brand.displayName} 잠금화면 루틴 진행`,
        description: 'Review routine order and recent dates on the Lock Screen.',
        contentMarginsDisabled: true,
        supportedFamilies: ['accessoryRectangular'],
      },
    ],
  },
];

module.exports = ({ config }) => {
  const widgetsEnabled = process.env.LOOFIT_APP_ONLY !== '1';
  const plugins = [...(appJson.expo.plugins ?? [])];

  if (widgetsEnabled) {
    plugins.push(widgetsPlugin);
  }

  const expo = {
    ...config,
    ...appJson.expo,
    name: brand.displayName,
    version: packageJson.version,
    ios: {
      ...(appJson.expo.ios ?? {}),
      infoPlist: {
        ...(appJson.expo.ios?.infoPlist ?? {}),
        LoofitWidgetsEnabled: widgetsEnabled,
      },
      config: {
        ...(appJson.expo.ios?.config ?? {}),
        usesNonExemptEncryption: false,
      },
    },
    extra: {
      ...(appJson.expo.extra ?? {}),
      eas: {
        ...(appJson.expo.extra?.eas ?? {}),
        projectId: '803560ac-f833-44f7-8e5f-b47144d1df1c',
      },
      widgetsEnabled,
    },
    plugins,
  };

  if (!widgetsEnabled) {
    expo.plugins = expo.plugins.filter((plugin) => {
      if (plugin === 'expo-widgets') {
        return false;
      }
      if (Array.isArray(plugin) && plugin[0] === 'expo-widgets') {
        return false;
      }
      return true;
    });
  }

  return expo;
};
