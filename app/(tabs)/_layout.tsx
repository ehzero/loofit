import { SymbolView } from 'expo-symbols';
import { Tabs } from 'expo-router';

import { theme } from '@/src/styles/theme';

type SymbolName = Parameters<typeof SymbolView>[0]['name'];

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.colors.primary,
        tabBarInactiveTintColor: theme.colors.muted,
        tabBarStyle: {
          borderTopColor: theme.colors.border,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: '홈',
          tabBarIcon: ({ color }) => icon('house.fill', color),
        }}
      />
      <Tabs.Screen
        name="dashboard"
        options={{
          title: '대시보드',
          tabBarIcon: ({ color }) => icon('chart.bar.fill', color),
        }}
      />
      <Tabs.Screen
        name="routine"
        options={{
          title: '루틴',
          tabBarIcon: ({ color }) => icon('calendar.badge.clock', color),
        }}
      />
      <Tabs.Screen
        name="records"
        options={{
          title: '기록',
          tabBarIcon: ({ color }) => icon('list.bullet.rectangle.fill', color),
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: '설정',
          tabBarIcon: ({ color }) => icon('gearshape.fill', color),
        }}
      />
    </Tabs>
  );
}

function icon(name: SymbolName, color: unknown) {
  return <SymbolView name={name} tintColor={String(color)} size={24} />;
}
