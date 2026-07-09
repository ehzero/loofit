import { Pressable, StyleSheet } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius } from '@/src/theme/tokens';

import { Icon, type IconName } from './Icon';

/** Small square icon button on a surface2 chip (steppers, reorder, delete). */
export function IconButton({
  icon,
  onPress,
  disabled,
  iconColor,
}: {
  icon: IconName;
  onPress?: () => void;
  disabled?: boolean;
  /** Defaults to the tertiary text color. */
  iconColor?: string;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      hitSlop={4}
      style={[
        styles.button,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.border2,
          opacity: disabled ? 0.35 : 1,
        },
      ]}>
      <Icon name={icon} size={16} color={iconColor ?? colors.tx3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: {
    width: 32,
    height: 32,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
