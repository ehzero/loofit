import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import {
  FlatList,
  Pressable,
  StyleSheet,
  View,
  type GestureResponderEvent,
} from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';
import Animated, {
  Extrapolation,
  interpolate,
  useAnimatedStyle,
  type SharedValue,
} from 'react-native-reanimated';

import { AppText } from '@/src/components/AppText';
import { ConfirmDialog, type ConfirmConfig } from '@/src/components/ConfirmDialog';
import { EmptyState } from '@/src/components/EmptyState';
import { Icon } from '@/src/components/Icon';
import { RecordRow } from '@/src/components/RecordRow';
import { Screen } from '@/src/components/Screen';
import { Segmented } from '@/src/components/Segmented';
import { getSessions } from '@/src/db/repository';
import {
  isActionSuccessful,
  shouldDismissAfterAction,
  useAppStore,
} from '@/src/store/app-store';
import { appOperationCoordinator } from '@/src/store/app-operation-coordinator';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
import { radius, spacing } from '@/src/theme/tokens';
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
const DELETE_ACTION_WIDTH = 88;
const TAP_MOVEMENT_THRESHOLD = spacing.xs;

export default function RecordsScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { showToast } = useToast();
  const deleteRecord = useAppStore((state) => state.deleteRecord);
  const [sessions, setSessions] = useState<WorkoutSession[] | null>(null);
  const [filter, setFilter] = useState<Filter>('all');
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);
  const openSwipeableRef = useRef<SwipeableMethods | null>(null);
  const touchStartRef = useRef<{ pageX: number; pageY: number } | null>(null);
  const touchMovedRef = useRef(false);

  const closeOpenSwipeable = useCallback(() => {
    openSwipeableRef.current?.close();
    openSwipeableRef.current = null;
  }, []);

  // Refetch whenever the tab gains focus so edits/deletes made on the detail
  // screen are reflected without threading records through the overview store.
  useFocusEffect(
    useCallback(() => {
      let cancelled = false;
      appOperationCoordinator
        .runInPipeline(() => getSessions({ limit: RECORDS_CAP }))
        .then((rows) => {
          if (!cancelled) {
            setSessions(rows);
          }
        });
      return () => {
        cancelled = true;
        closeOpenSwipeable();
      };
    }, [closeOpenSwipeable])
  );

  if (!sessions) {
    return <Screen title="기록" isLoading />;
  }

  const visible =
    filter === 'all'
      ? sessions
      : sessions.filter((session) => session.status === (filter as SessionStatus));

  function handleTouchStart(event: GestureResponderEvent) {
    const { pageX, pageY } = event.nativeEvent;
    touchStartRef.current = { pageX, pageY };
    touchMovedRef.current = false;
  }

  function handleTouchMove(event: GestureResponderEvent) {
    const start = touchStartRef.current;
    if (!start || touchMovedRef.current) {
      return;
    }
    const { pageX, pageY } = event.nativeEvent;
    touchMovedRef.current =
      Math.abs(pageX - start.pageX) > TAP_MOVEMENT_THRESHOLD ||
      Math.abs(pageY - start.pageY) > TAP_MOVEMENT_THRESHOLD;
  }

  function handleTouchEnd(event: GestureResponderEvent) {
    const start = touchStartRef.current;
    touchStartRef.current = null;
    if (!start || touchMovedRef.current) {
      return;
    }

    const { pageX, pageY } = event.nativeEvent;
    const isTap =
      Math.abs(pageX - start.pageX) <= TAP_MOVEMENT_THRESHOLD &&
      Math.abs(pageY - start.pageY) <= TAP_MOVEMENT_THRESHOLD;
    if (isTap) {
      // Let the pressed child finish its own action before the open row moves.
      requestAnimationFrame(closeOpenSwipeable);
    }
  }

  function resetTouchTracking() {
    touchStartRef.current = null;
    touchMovedRef.current = false;
  }

  function requestDelete(session: WorkoutSession, swipeable: SwipeableMethods) {
    swipeable.close();
    if (openSwipeableRef.current === swipeable) {
      openSwipeableRef.current = null;
    }
    setConfirm({
      title: '이 기록을 삭제할까요?',
      description: '삭제한 기록은 되돌릴 수 없어요.',
      confirmLabel: '삭제',
      danger: true,
      onConfirm: async () => {
        const result = await deleteRecord(session.id);
        const shouldDismiss = shouldDismissAfterAction(result);
        if (shouldDismiss) {
          setSessions((current) => current?.filter((item) => item.id !== session.id) ?? null);
        }
        if (isActionSuccessful(result)) {
          showToast('기록이 삭제되었어요');
        }
        return shouldDismiss;
      },
    });
  }

  return (
    <>
      <View
        style={styles.screen}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onTouchCancel={resetTouchTracking}>
        <Screen title="기록" scroll={false}>
          <Segmented options={FILTERS} value={filter} onChange={setFilter} />

          <FlatList
            data={visible}
            keyExtractor={(session) => String(session.id)}
            renderItem={({ item }) => (
              <SwipeableRecordRow
                session={item}
                onPress={() => router.push(`/record/${item.id}`)}
                onDelete={requestDelete}
                onWillOpen={(swipeable) => {
                  if (openSwipeableRef.current && openSwipeableRef.current !== swipeable) {
                    openSwipeableRef.current.close();
                  }
                  openSwipeableRef.current = swipeable;
                }}
                onClose={(swipeable) => {
                  if (openSwipeableRef.current === swipeable) {
                    openSwipeableRef.current = null;
                  }
                }}
                dangerColor={colors.dangerSolid}
              />
            )}
            ItemSeparatorComponent={Separator}
            ListEmptyComponent={
              <EmptyState title="아직 기록이 없어요" description="운동을 시작하면 여기에 쌓여요." />
            }
            contentContainerStyle={styles.listContent}
            removeClippedSubviews={false}
            showsVerticalScrollIndicator={false}
            style={styles.list}
          />
        </Screen>
      </View>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

function SwipeableRecordRow({
  session,
  onPress,
  onDelete,
  onWillOpen,
  onClose,
  dangerColor,
}: {
  session: WorkoutSession;
  onPress: () => void;
  onDelete: (session: WorkoutSession, swipeable: SwipeableMethods) => void;
  onWillOpen: (swipeable: SwipeableMethods) => void;
  onClose: (swipeable: SwipeableMethods) => void;
  dangerColor: string;
}) {
  const swipeableRef = useRef<SwipeableMethods | null>(null);

  return (
    <ReanimatedSwipeable
      ref={swipeableRef}
      rightThreshold={40}
      overshootRight={false}
      onSwipeableWillOpen={() => {
        if (swipeableRef.current) {
          onWillOpen(swipeableRef.current);
        }
      }}
      onSwipeableClose={() => {
        if (swipeableRef.current) {
          onClose(swipeableRef.current);
        }
      }}
      renderRightActions={(progress, _drag, swipeable) => (
        <SwipeDeleteAction
          progress={progress}
          dangerColor={dangerColor}
          onPress={() => onDelete(session, swipeable)}
        />
      )}
      containerStyle={styles.swipeContainer}>
      <RecordRow session={session} onPress={onPress} />
    </ReanimatedSwipeable>
  );
}

function SwipeDeleteAction({
  progress,
  dangerColor,
  onPress,
}: {
  progress: SharedValue<number>;
  dangerColor: string;
  onPress: () => void;
}) {
  const fadeStyle = useAnimatedStyle(() => ({
    // Hide the action before the card's rounded trailing corner settles back
    // into place, so red never lingers behind an otherwise closed row.
    opacity: interpolate(progress.value, [0, 0.12, 0.2], [0, 0, 1], Extrapolation.CLAMP),
  }));

  return (
    <Animated.View
      style={[styles.deleteAction, { backgroundColor: dangerColor }, fadeStyle]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="기록 삭제"
        onPress={onPress}
        style={styles.deleteActionButton}>
        <Icon name="trash" size={20} color="#FFFFFF" />
        <AppText variant="label" weight="800" style={styles.deleteLabel}>
          삭제
        </AppText>
      </Pressable>
    </Animated.View>
  );
}

function Separator() {
  return <View style={styles.separator} />;
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    flex: 1,
    overflow: 'visible',
  },
  listContent: {
    paddingBottom: spacing.xl,
  },
  separator: {
    height: spacing.sm,
  },
  swipeContainer: {
    borderRadius: radius.lg,
    overflow: 'visible',
  },
  deleteAction: {
    // Extend beneath the card's rounded corner while keeping the action's
    // measured reveal distance and right edge within the original row width.
    width: DELETE_ACTION_WIDTH + radius.lg,
    marginLeft: -radius.lg,
    paddingLeft: radius.lg,
    borderTopRightRadius: radius.lg,
    borderBottomRightRadius: radius.lg,
  },
  deleteActionButton: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.xxs,
  },
  deleteLabel: {
    color: '#FFFFFF',
  },
});
