import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from './AppText';

/** Standalone section heading with an optional trailing action ("전체보기"). */
export function SectionHeader({
  title,
  actionLabel,
  onAction,
}: {
  title: string;
  actionLabel?: string;
  onAction?: () => void;
}) {
  return (
    <View style={styles.row}>
      <AppText variant="body" weight="800">
        {title}
      </AppText>
      {actionLabel ? (
        <Pressable onPress={onAction} hitSlop={8}>
          <AppText variant="label" tone="tertiary">
            {actionLabel}
          </AppText>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
});
