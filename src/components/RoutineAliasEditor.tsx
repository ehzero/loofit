import { StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';
import { Input } from './Input';

export function RoutineAliasEditor({
  value,
  isEditing,
  onChangeText,
  onStartEditing,
  onComplete,
}: {
  value: string;
  isEditing: boolean;
  onChangeText: (value: string) => void;
  onStartEditing: () => void;
  onComplete: () => void | Promise<void>;
}) {
  const { colors } = useTheme();
  const hasAlias = value.trim().length > 0;

  return (
    <View style={[styles.section, { borderTopColor: colors.line }]}>
      {isEditing ? (
        <>
          <Input
            autoFocus
            surface="surface2"
            value={value}
            onChangeText={onChangeText}
            placeholder="별칭을 입력해 주세요 (예: Push)"
            returnKeyType="done"
            onSubmitEditing={() => onComplete()}
          />
          <AppText variant="label" tone="muted">
            비워두면 선택한 운동 부위가 분할 이름으로 표시돼요.
          </AppText>
          <Button size="md" variant="ghost" onPress={() => onComplete()}>
            별칭 입력 완료
          </Button>
        </>
      ) : (
        <Button size="md" variant="neutral" onPress={onStartEditing}>
          {hasAlias ? '별칭 수정' : '별칭 작성'}
        </Button>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  section: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.xs,
  },
});
