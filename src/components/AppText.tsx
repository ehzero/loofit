import { Text, type TextProps, type TextStyle } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { typeScale, type ThemeColors, type TypeVariant } from '@/src/theme/tokens';

// Semantic text colors resolved from the theme. `default` is the primary
// text color; the tone ladder follows the tx→tx6 palette hierarchy.
export type TextTone =
  | 'default'
  | 'secondary'
  | 'tertiary'
  | 'muted'
  | 'faint'
  | 'hint'
  | 'accent'
  | 'accentContrast'
  | 'danger'
  | 'warning';

function toneColor(colors: ThemeColors, tone: TextTone): string {
  switch (tone) {
    case 'secondary':
      return colors.tx2;
    case 'tertiary':
      return colors.tx3;
    case 'muted':
      return colors.tx4;
    case 'faint':
      return colors.tx5;
    case 'hint':
      return colors.tx6;
    case 'accent':
      return colors.accent;
    case 'accentContrast':
      return colors.accentText;
    case 'danger':
      return colors.danger;
    case 'warning':
      return colors.warning;
    default:
      return colors.tx;
  }
}

type AppTextProps = TextProps & {
  variant?: TypeVariant;
  tone?: TextTone;
  /** Override the variant's default weight without leaving the type scale. */
  weight?: TextStyle['fontWeight'];
};

export function AppText({
  variant = 'body',
  tone = 'default',
  weight,
  style,
  ...rest
}: AppTextProps) {
  const { colors } = useTheme();
  return (
    <Text
      {...rest}
      style={[
        typeScale[variant],
        { color: toneColor(colors, tone) },
        weight ? { fontWeight: weight } : null,
        style,
      ]}
    />
  );
}
