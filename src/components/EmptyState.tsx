import { StyleSheet, View } from 'react-native';

import { spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

/** Shared empty placeholder: a title line with an optional explanation. */
export function EmptyState({
  title,
  description,
  compact,
}: {
  title: string;
  description?: string;
  /** Inline variant for use inside cards (less vertical padding). */
  compact?: boolean;
}) {
  return (
    <View style={[styles.wrap, compact ? styles.compact : styles.full]}>
      <AppText variant="item" tone="muted">
        {title}
      </AppText>
      {description ? (
        <AppText variant="footnote" tone="faint">
          {description}
        </AppText>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    gap: spacing.xs,
  },
  full: {
    paddingVertical: 70,
  },
  compact: {
    alignItems: 'flex-start',
    paddingVertical: spacing.xxs,
  },
});
