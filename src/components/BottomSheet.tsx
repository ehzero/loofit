import { useCallback, useLayoutEffect, useRef, useState, type PropsWithChildren } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
  runOnJS,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

type BottomSheetProps = PropsWithChildren<{
  visible: boolean;
  title: string;
  onClose: () => void;
}>;

const OPEN_DURATION_MS = 260;
const CLOSE_DURATION_MS = 220;
const DIMMED_OPACITY = 0.5;

export function BottomSheet({ visible, title, onClose, children }: BottomSheetProps) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const latestVisibleRef = useRef(visible);
  const progress = useSharedValue(visible ? 1 : 0);
  latestVisibleRef.current = visible;

  const finishClose = useCallback(() => {
    if (!latestVisibleRef.current) {
      setMounted(false);
    }
  }, []);

  useLayoutEffect(() => {
    if (visible) {
      progress.value = 0;
      setMounted(true);
      progress.value = withTiming(1, {
        duration: OPEN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    progress.value = withTiming(
      0,
      {
        duration: CLOSE_DURATION_MS,
        easing: Easing.in(Easing.cubic),
      },
      (finished) => {
        if (finished) {
          runOnJS(finishClose)();
        }
      }
    );
  }, [finishClose, progress, visible]);

  const dimStyle = useAnimatedStyle(() => ({
    opacity: progress.value * DIMMED_OPACITY,
  }));

  const closedOffset = height * 0.82 + bottom;
  const sheetMotionStyle = useAnimatedStyle(
    () => ({
      transform: [{ translateY: (1 - progress.value) * closedOffset }],
    }),
    [closedOffset]
  );

  if (!mounted) {
    return null;
  }

  return (
    <Modal visible={mounted} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, styles.dim, dimStyle]} />
        <Pressable style={[StyleSheet.absoluteFill, styles.backdropHit]} onPress={onClose} />
        <Animated.View style={[styles.sheetMotion, sheetMotionStyle]}>
          <View
            style={[
              styles.sheet,
              {
                backgroundColor: colors.card,
                borderColor: colors.border2,
                paddingBottom: spacing.xl + bottom,
              },
            ]}>
            <View style={styles.gripWrap}>
              <View style={[styles.grip, { backgroundColor: colors.grip }]} />
            </View>
            <AppText variant="title">{title}</AppText>
            <ScrollView
              style={styles.scroll}
              showsVerticalScrollIndicator={false}
              contentContainerStyle={styles.body}>
              {children}
            </ScrollView>
          </View>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  dim: {
    backgroundColor: 'rgba(0,0,0,1)',
    zIndex: 0,
  },
  backdropHit: {
    zIndex: 1,
  },
  sheetMotion: {
    width: '100%',
    maxHeight: '82%',
    zIndex: 2,
  },
  sheet: {
    borderTopLeftRadius: radius.xl,
    borderTopRightRadius: radius.xl,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderLeftWidth: StyleSheet.hairlineWidth,
    borderRightWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xs,
    maxHeight: '100%',
    gap: spacing.md,
  },
  gripWrap: {
    alignItems: 'center',
  },
  grip: {
    width: 40,
    height: 5,
    borderRadius: radius.xs,
  },
  scroll: {
    flexShrink: 1,
  },
  body: {
    gap: spacing.md,
    paddingBottom: spacing.xs,
  },
});
