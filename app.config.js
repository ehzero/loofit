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
        description: '다음 운동을 확인하고 운동을 시작하거나 종료합니다.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'HeatmapWeekWidget',
        displayName: `${brand.displayName} 히트맵 · 지난 7일`,
        description: '지난 7일의 운동 기록과 요약을 히트맵으로 확인합니다.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'HeatmapMonthWidget',
        displayName: `${brand.displayName} 히트맵 · 지난 5주`,
        description: '이번 주를 포함한 지난 5주의 운동 기록을 히트맵으로 확인합니다.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'HeatmapYearWidget',
        displayName: `${brand.displayName} 히트맵 · 지난 6개월`,
        description: '지난 6개월의 운동 기록을 히트맵으로 확인합니다.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemMedium'],
      },
      {
        name: 'CurrentMonthCalendarWidget',
        displayName: `${brand.displayName} 히트맵 · 이번 달`,
        description: '이번 달 운동 기록을 히트맵으로 확인합니다.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'HeatmapFourWeekExpandedWidget',
        displayName: `${brand.displayName} 히트맵 · 지난 4주 상세`,
        description: '지난 4주의 운동 날짜와 부위를 히트맵으로 확인합니다.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemMedium'],
      },
      {
        name: 'RoutineProgressWidget',
        displayName: `${brand.displayName} 루틴 진행`,
        description: '루틴 분할별 최근 운동과 현재 순서를 확인합니다.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'BodyPartDurationWidget',
        displayName: `${brand.displayName} 부위별 운동 시간`,
        description: '최근 30일 동안 부위별로 기록된 운동 시간을 확인합니다.',
        contentMarginsDisabled: true,
        supportedFamilies: ['systemSmall'],
      },
      {
        name: 'WorkoutLockScreenWidget',
        displayName: `${brand.displayName} 잠금화면 운동`,
        description: '잠금화면에서 다음 운동, 진행 중인 운동과 완료 상태를 확인합니다.',
        contentMarginsDisabled: false,
        supportedFamilies: ['accessoryInline', 'accessoryCircular', 'accessoryRectangular'],
      },
      {
        name: 'ThreeWeekCalendarLockScreenWidget',
        displayName: `${brand.displayName} 잠금화면 히트맵 · 지난 3주`,
        description: '지난 3주의 운동 기록을 히트맵으로 확인합니다.',
        contentMarginsDisabled: false,
        supportedFamilies: ['accessoryRectangular'],
      },
      {
        name: 'NextThreeWeekCalendarLockScreenWidget',
        displayName: `${brand.displayName} 잠금화면 히트맵 · 다음 3주`,
        description: '이번 주와 다음 2주의 운동 기록을 히트맵으로 확인합니다.',
        contentMarginsDisabled: false,
        supportedFamilies: ['accessoryRectangular'],
      },
      {
        name: 'RoutineProgressLockScreenWidget',
        displayName: `${brand.displayName} 잠금화면 루틴 진행`,
        description: '루틴 분할별 최근 운동과 현재 순서를 확인합니다.',
        contentMarginsDisabled: false,
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
