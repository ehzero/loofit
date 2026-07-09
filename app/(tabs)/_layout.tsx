import { Tabs } from 'expo-router';

import { Icon, type IconName } from '@/src/components/Icon';
import { useTheme } from '@/src/theme/ThemeProvider';
import { typeScale } from '@/src/theme/tokens';

export default function TabLayout() {
  const { colors } = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.tx5,
        tabBarLabelStyle: { ...typeScale.caption },
        tabBarStyle: {
          backgroundColor: colors.nav,
          borderTopColor: colors.navb,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: '홈', tabBarIcon: ({ color }) => icon('home', color) }}
      />
      <Tabs.Screen
        name="records"
        options={{ title: '기록', tabBarIcon: ({ color }) => icon('records', color) }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{ title: '대시보드', tabBarIcon: ({ color }) => icon('dashboard', color) }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '설정', tabBarIcon: ({ color }) => icon('settings', color) }}
      />
    </Tabs>
  );
}

function icon(name: IconName, color: unknown) {
  return <Icon name={name} size={23} color={String(color)} weight="regular" />;
}
