import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { AppText } from '@/src/components/AppText';
import { Chip } from '@/src/components/Chip';
import { Icon } from '@/src/components/Icon';
import { Screen } from '@/src/components/Screen';
import { hasRoutineDayAlias, routineDayDisplayName } from '@/src/domain/routine';
import { useAppStore } from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
import { radius, spacing, typeScale } from '@/src/theme/tokens';
import type { BodyPart, RoutineDay } from '@/src/types';

export default function RoutineScreen() {
  const router = useRouter();
  const { colors } = useTheme();
  const { showToast } = useToast();

  const overview = useAppStore((state) => state.overview);
  const addEmptyDay = useAppStore((state) => state.addEmptyDay);
  const moveDay = useAppStore((state) => state.moveDay);
  const deleteDay = useAppStore((state) => state.deleteDay);
  const chooseNextDay = useAppStore((state) => state.chooseNextDay);
  const addPart = useAppStore((state) => state.addPart);
  const archivePart = useAppStore((state) => state.archivePart);

  const [editingId, setEditingId] = useState<number | null>(null);
  const [newPart, setNewPart] = useState('');

  if (!overview) {
    return <Screen title="루틴 설정" onBack={() => router.back()} isLoading />;
  }

  const days = overview.routineDays;
  const nextName = overview.nextRoutineDay
    ? routineDayDisplayName(overview.nextRoutineDay)
    : '-';

  async function submitPart() {
    const trimmed = newPart.trim();
    if (!trimmed) {
      return;
    }
    setNewPart('');
    await addPart(trimmed);
  }

  return (
    <Screen title="루틴 설정" onBack={() => router.back()}>
      <View style={[styles.hint, { backgroundColor: colors.card, borderColor: colors.border }]}>
        <Icon name="bolt" size={18} color={colors.accent} />
        <AppText variant="footnote" tone="secondary" style={styles.hintText}>
          다음 운동은{' '}
          <AppText variant="footnote" weight="800" tone="accent">
            {nextName}
          </AppText>{' '}
          이에요. 각 분할의 <AppText variant="footnote" weight="800">다음 시작</AppText> 버튼으로
          시작점을 바꿀 수 있어요.
        </AppText>
      </View>

      <View style={styles.splitList}>
        {days.map((day, index) => (
          <SplitCard
            key={day.id}
            day={day}
            order={index + 1}
            isNext={day.id === overview.nextRoutineDay?.id}
            isFirst={index === 0}
            isLast={index === days.length - 1}
            isEditing={editingId === day.id}
            bodyParts={overview.bodyParts}
            onUp={() => moveDay(day.id, -1)}
            onDown={() => moveDay(day.id, 1)}
            onDelete={() => {
              if (editingId === day.id) {
                setEditingId(null);
              }
              deleteDay(day.id);
            }}
            onSetNext={() =>
              chooseNextDay(day.id).then(() => showToast('다음 운동 시작점을 바꿨어요'))
            }
            onToggleEdit={() => setEditingId((current) => (current === day.id ? null : day.id))}
          />
        ))}

        <Pressable
          onPress={() => addEmptyDay('')}
          style={[styles.addSplit, { borderColor: colors.border2 }]}>
          <AppText variant="body" weight="700" tone="tertiary">
            + 분할 추가
          </AppText>
        </Pressable>
      </View>

      <View style={styles.manageBlock}>
        <AppText variant="footnote" weight="800">
          운동 부위 관리
        </AppText>
        <View style={styles.chipWrap}>
          {overview.bodyParts.map((part) => (
            <View
              key={part.id}
              style={[
                styles.managePill,
                { backgroundColor: colors.surface2, borderColor: colors.border2 },
              ]}>
              <AppText variant="footnote" weight="700" tone="secondary">
                {part.name}
              </AppText>
              <Pressable onPress={() => archivePart(part.id)} hitSlop={6}>
                <Icon name="close" size={14} color={colors.tx4} />
              </Pressable>
            </View>
          ))}
        </View>
        <View style={styles.addPartRow}>
          <TextInput
            value={newPart}
            onChangeText={setNewPart}
            placeholder="새 부위 이름"
            placeholderTextColor={colors.tx5}
            onSubmitEditing={submitPart}
            returnKeyType="done"
            style={[
              styles.input,
              { backgroundColor: colors.card, borderColor: colors.border2, color: colors.tx },
            ]}
          />
          <Pressable
            onPress={submitPart}
            style={[
              styles.addPartBtn,
              { backgroundColor: colors.chip, borderColor: colors.border2 },
            ]}>
            <AppText variant="body" weight="700">
              추가
            </AppText>
          </Pressable>
        </View>
      </View>
    </Screen>
  );
}

function SplitCard({
  day,
  order,
  isNext,
  isFirst,
  isLast,
  isEditing,
  bodyParts,
  onUp,
  onDown,
  onDelete,
  onSetNext,
  onToggleEdit,
}: {
  day: RoutineDay;
  order: number;
  isNext: boolean;
  isFirst: boolean;
  isLast: boolean;
  isEditing: boolean;
  bodyParts: BodyPart[];
  onUp: () => void;
  onDown: () => void;
  onDelete: () => void;
  onSetNext: () => void;
  onToggleEdit: () => void;
}) {
  const { colors } = useTheme();
  const renameDay = useAppStore((state) => state.renameDay);
  const setDayParts = useAppStore((state) => state.setDayParts);
  const [name, setName] = useState(day.name);

  // Re-sync the draft when the stored name changes (e.g. an empty submit was
  // rejected by the repository and the overview refreshed with the old name).
  useEffect(() => {
    setName(day.name);
  }, [day.name]);

  const partIds = day.parts.map((part) => part.id);

  function commitNameAndToggle() {
    if (isEditing) {
      renameDay(day.id, name);
    }
    onToggleEdit();
  }

  function toggle(partId: number) {
    const next = partIds.includes(partId)
      ? partIds.filter((id) => id !== partId)
      : [...partIds, partId];
    setDayParts(day.id, next);
  }

  return (
    <View style={[styles.split, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.splitHead}>
        <View style={[styles.orderBadge, { backgroundColor: colors.surface2 }]}>
          <AppText variant="label" tone="tertiary">
            {order}
          </AppText>
        </View>
        <AppText variant="title" style={styles.splitName} numberOfLines={1}>
          {routineDayDisplayName(day)}
        </AppText>
        <IconBtn name="chevronUp" disabled={isFirst} onPress={onUp} />
        <IconBtn name="chevronDown" disabled={isLast} onPress={onDown} />
      </View>

      {hasRoutineDayAlias(day) && day.parts.length > 0 ? (
        <AppText variant="footnote" tone="muted">
          {day.parts.map((part) => part.name).join(' · ')}
        </AppText>
      ) : null}

      <View style={styles.splitActions}>
        <Pressable
          onPress={onSetNext}
          style={[
            styles.splitBtn,
            isNext
              ? { backgroundColor: colors.accent }
              : {
                  backgroundColor: colors.surface2,
                  borderColor: colors.border2,
                  borderWidth: StyleSheet.hairlineWidth,
                },
          ]}>
          <AppText variant="label" tone={isNext ? 'accentContrast' : 'tertiary'}>
            다음 시작
          </AppText>
        </Pressable>
        <Pressable
          onPress={commitNameAndToggle}
          style={[
            styles.splitBtn,
            isEditing
              ? { backgroundColor: colors.accent }
              : {
                  backgroundColor: colors.surface2,
                  borderColor: colors.border2,
                  borderWidth: StyleSheet.hairlineWidth,
                },
          ]}>
          <AppText variant="label" tone={isEditing ? 'accentContrast' : 'secondary'}>
            {isEditing ? '편집 완료' : '부위 편집'}
          </AppText>
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={[
            styles.deleteBtn,
            { backgroundColor: colors.surface2, borderColor: colors.border2 },
          ]}>
          <Icon name="trash" size={15} color={colors.danger} />
        </Pressable>
      </View>

      {isEditing ? (
        <View style={[styles.editor, { borderTopColor: colors.line }]}>
          <TextInput
            value={name}
            onChangeText={setName}
            onEndEditing={() => renameDay(day.id, name)}
            onSubmitEditing={() => renameDay(day.id, name)}
            returnKeyType="done"
            placeholder="별칭 (선택) — 예: Push"
            placeholderTextColor={colors.tx5}
            style={[
              styles.editorInput,
              { backgroundColor: colors.surface2, borderColor: colors.border2, color: colors.tx },
            ]}
          />
          <View style={styles.chipWrap}>
            {bodyParts.map((part) => (
              <Chip
                key={part.id}
                label={part.name}
                selected={partIds.includes(part.id)}
                onPress={() => toggle(part.id)}
              />
            ))}
          </View>
        </View>
      ) : null}
    </View>
  );
}

function IconBtn({
  name,
  disabled,
  onPress,
}: {
  name: 'chevronUp' | 'chevronDown';
  disabled?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      style={[
        styles.iconBtn,
        {
          backgroundColor: colors.surface2,
          borderColor: colors.border2,
          opacity: disabled ? 0.35 : 1,
        },
      ]}>
      <Icon name={name} size={15} color={colors.tx3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    gap: spacing.xs,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.sm,
  },
  hintText: {
    flex: 1,
  },
  splitList: {
    gap: spacing.sm,
  },
  split: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.sm,
  },
  splitHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  orderBadge: {
    width: 24,
    height: 24,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitName: {
    flex: 1,
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitActions: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  splitBtn: {
    flex: 1,
    borderRadius: radius.sm,
    paddingVertical: spacing.xs,
    alignItems: 'center',
  },
  deleteBtn: {
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editor: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  editorInput: {
    ...typeScale.body,
    fontWeight: '700',
    borderRadius: radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  addSplit: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: radius.md,
    padding: spacing.md,
    alignItems: 'center',
  },
  manageBlock: {
    gap: spacing.sm,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  managePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xxs,
    paddingLeft: spacing.sm,
    paddingRight: spacing.xs,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  addPartRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  input: {
    ...typeScale.body,
    flex: 1,
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.sm,
    paddingVertical: spacing.sm,
  },
  addPartBtn: {
    borderRadius: radius.md,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: spacing.md,
    justifyContent: 'center',
  },
});
