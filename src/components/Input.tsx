import { StyleSheet, TextInput, type TextInputProps } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing, typeScale } from '@/src/theme/tokens';

type InputProps = TextInputProps & {
  /** card: sits on the screen bg. surface2: sits inside a card container. */
  surface?: 'card' | 'surface2';
};

export function Input({ surface = 'card', style, multiline, ...rest }: InputProps) {
  const { colors } = useTheme();
  return (
    <TextInput
      placeholderTextColor={colors.tx5}
      multiline={multiline}
      {...rest}
      style={[
        styles.input,
        {
          backgroundColor: surface === 'card' ? colors.card : colors.surface2,
          borderColor: colors.border2,
          color: colors.tx,
        },
        multiline ? styles.multiline : null,
        style,
      ]}
    />
  );
}

const styles = StyleSheet.create({
  input: {
    ...typeScale.body,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  multiline: {
    minHeight: 80,
    textAlignVertical: 'top',
  },
});
