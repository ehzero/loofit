import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { FlatList, StyleSheet, Text, View } from 'react-native';

import { RecordRow } from '@/src/components/RecordRow';
import { Screen } from '@/src/components/Screen';
import { Segmented } from '@/src/components/Segmented';
import { getSessions } from '@/src/db/repository';
import { useTheme } from '@/src/theme/ThemeProvider';
import type { SessionStatus, WorkoutSession } from '@/src/types';

type Filter = 'all' | 'completed' | 'canceled';

const FILTERS: Array<{ value: Filter; label: string }> = [
  { value: 'all', label: '전체' },
  { value: 'completed', label: '완료' },
  { value: 'canceled', label: '취소' },
];

// Safety cap, not pagination: at 1-2 sessions/day this covers 2-3 years of
// history, and the list is virtualized so render cost stays flat.
const RECORDS_CAP = 1000;

export default function RecordsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');

  // Refetch whenever the tab gains focus so edits/deletes made on the detail
  // screen are reflected without threading records through the overview store.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      getSessions({ limit: RECORDS_CAP }).then((rows) => {
        if (!cancelled) {
          setSessions(rows);
        }
      });
      return () => {
        cancelled = true;
      };
    }, [])
  );

  if (!sessions) {
    return <Screen title="기록" isLoading />;
  }

  const visible =
    filter === 'all'
      ? sessions
      : sessions.filter((session) => session.status === (filter as SessionStatus));

  return (
    <Screen title="기록" scroll={false}>
      <Segmented options={FILTERS} value={filter} onChange={setFilter} />

      <FlatList
        data={visible}
        keyExtractor={(session) => String(session.id)}
        renderItem={({ item }) => (
          <RecordRow session={item} onPress={() => router.push(`/record/${item.id}`)} />
        )}
        ItemSeparatorComponent={Separator}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Text style={[styles.emptyTitle, { color: colors.tx4 }]}>아직 기록이 없어요</Text>
            <Text style={[styles.emptyDesc, { color: colors.tx5 }]}>
              운동을 시작하면 여기에 쌓여요.
            </Text>
          </View>
        }
        contentContainerStyle={styles.listContent}
        showsVerticalScrollIndicator={false}
        style={styles.list}
      />
    </Screen>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  list: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  separator: {
    height: 10,
  },
  empty: {
    alignItems: 'center',
    gap: 8,
    paddingVertical: 70,
  },
  emptyTitle: {
    fontSize: 15,
    fontWeight: '700',
  },
  emptyDesc: {
    fontSize: 13,
  },
});
