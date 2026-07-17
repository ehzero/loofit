import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type PropsWithChildren,
  type ReactNode,
} from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, {
  Easing,
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
  onClosed?: () => void;
  footer?: ReactNode;
}>;

const OPEN_DURATION_MS = 260;
const CLOSE_DURATION_MS = 220;
const DIMMED_OPACITY = 0.5;

export function BottomSheet({
  visible,
  title,
  onClose,
  onClosed,
  footer,
  children,
}: BottomSheetProps) {
  const { colors } = useTheme();
  const { bottom } = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const [mounted, setMounted] = useState(visible);
  const mountedRef = useRef(visible);
  const latestVisibleRef = useRef(visible);
  const onClosedRef = useRef(onClosed);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const progress = useSharedValue(visible ? 1 : 0);
  latestVisibleRef.current = visible;
  onClosedRef.current = onClosed;

  useEffect(
    () => () => {
      if (closeTimerRef.current) {
        clearTimeout(closeTimerRef.current);
      }
    },
    []
  );

  useLayoutEffect(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }

    if (visible) {
      progress.value = 0;
      mountedRef.current = true;
      setMounted(true);
      progress.value = withTiming(1, {
        duration: OPEN_DURATION_MS,
        easing: Easing.out(Easing.cubic),
      });
      return;
    }

    if (!mountedRef.current) {
      return;
    }

    progress.value = withTiming(0, {
      duration: CLOSE_DURATION_MS,
      easing: Easing.in(Easing.cubic),
    });
    closeTimerRef.current = setTimeout(() => {
      closeTimerRef.current = null;
      if (!latestVisibleRef.current) {
        mountedRef.current = false;
        setMounted(false);
        onClosedRef.current?.();
      }
    }, CLOSE_DURATION_MS);
  }, [progress, visible]);

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
            {footer ? <View style={styles.footer}>{footer}</View> : null}
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
  footer: {
    paddingBottom: spacing.xs,
  },
});
