const appJson = require('./app.json');
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
