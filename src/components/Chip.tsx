import { Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';

/** Static, read-only pill (e.g. body-part tags on the next-workout card). */
export function Tag({ label }: { label: string }) {
  const { colors } = useTheme();
  return (
    <View style={[styles.pill, { backgroundColor: colors.chip, borderColor: colors.border2 }]}>
      <Text style={[styles.text, { color: colors.tx2 }]}>{label}</Text>
    </View>
  );
}

/** Selectable pill used across free-workout / part pickers. */
export function Chip({
  label,
  selected,
  onPress,
}: {
  label: string;
  selected?: boolean;
  onPress?: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      style={[
        styles.pill,
        {
          backgroundColor: selected ? colors.accent : colors.surface2,
          borderColor: selected ? colors.accent : colors.border2,
        },
      ]}>
      <Text
        style={[styles.text, { color: selected ? colors.accentText : colors.tx2 }]}>
        {label}
      </Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  pill: {
    paddingHorizontal: 13,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    fontSize: 13,
    fontWeight: '700',
  },
});
