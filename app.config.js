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
        displayName: `${brand.displayName} 히트맵 · 30일`,
        description: 'Review your last 30 days of workouts.',
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
        name: 'WorkoutLiveActivity',
        displayName: `${brand.displayName} 라이브 운동`,
        description: 'Track the current workout on the Lock Screen.',
        supportedFamilies: ['accessoryRectangular', 'accessoryInline'],
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
    extra: {
      ...(appJson.expo.extra ?? {}),
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
