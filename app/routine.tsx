import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/AppText';
import { Button } from '@/src/components/Button';
import { Callout } from '@/src/components/Callout';
import { Chip } from '@/src/components/Chip';
import { IconButton } from '@/src/components/IconButton';
import { Input } from '@/src/components/Input';
import { ListRow } from '@/src/components/ListRow';
import { RoutineAliasEditor } from '@/src/components/RoutineAliasEditor';
import { Screen } from '@/src/components/Screen';
import { ROUTINE_TEMPLATE_OPTIONS } from '@/src/config/routine-templates';
import { hasRoutineDayAlias, routineDayDisplayName } from '@/src/domain/routine';
import {
  isActionSuccessful,
  shouldDismissAfterAction,
  useAppStore,
} from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
import { radius, spacing } from '@/src/theme/tokens';
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
  const [showTemplates, setShowTemplates] = useState(false);

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
    const result = await addPart(trimmed);
    if (shouldDismissAfterAction(result)) {
      setNewPart('');
    }
  }

  return (
    <>
      <Screen title="루틴 설정" onBack={() => router.back()}>
        <Callout icon="bolt" tone="accent">
          다음 운동은{' '}
          <AppText variant="footnote" weight="800" tone="accent">
            {nextName}
          </AppText>{' '}
          이에요. 각 분할의 <AppText variant="footnote" weight="800">다음 시작</AppText>{' '}
          버튼으로 시작점을 바꿀 수 있어요.
        </Callout>

        <View style={styles.templateBlock}>
          <Button
            size="md"
            variant="neutral"
            onPress={() => setShowTemplates((current) => !current)}>
            {showTemplates ? '템플릿 닫기' : '분할 템플릿 다시 선택'}
          </Button>
          {showTemplates ? (
            <View style={styles.templatePicker}>
              <Callout icon="edit" tone="accent">
                템플릿을 고른 다음, 적용하기 전에 분할별 운동 부위를 바꿀 수 있어요.
              </Callout>
              <View style={styles.templateList}>
                {ROUTINE_TEMPLATE_OPTIONS.map((template) => (
                  <ListRow
                    key={template.key}
                    variant="card"
                    surface="card"
                    chevron
                    title={template.name}
                    subtitle={template.description}
                    onPress={() =>
                      router.push({
                        pathname: '/routine-template',
                        params: { template: template.key, source: 'settings' },
                      })
                    }
                  />
                ))}
              </View>
            </View>
          ) : null}
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
              onDelete={async () => {
                const result = await deleteDay(day.id);
                if (editingId === day.id && shouldDismissAfterAction(result)) {
                  setEditingId(null);
                }
              }}
              onSetNext={async () => {
                const result = await chooseNextDay(day.id);
                if (isActionSuccessful(result)) {
                  showToast('다음 운동 시작점을 바꿨어요');
                }
              }}
              onToggleEdit={() =>
                setEditingId((current) => (current === day.id ? null : day.id))
              }
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
              <Chip key={part.id} label={part.name} onRemove={() => archivePart(part.id)} />
            ))}
          </View>
          <View style={styles.addPartRow}>
            <Input
              value={newPart}
              onChangeText={setNewPart}
              placeholder="새 부위 이름"
              onSubmitEditing={submitPart}
              returnKeyType="done"
              style={styles.addPartInput}
            />
            <Button size="md" variant="neutral" onPress={submitPart}>
              추가
            </Button>
          </View>
        </View>
      </Screen>
    </>
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
  onDelete: () => void | Promise<void>;
  onSetNext: () => void;
  onToggleEdit: () => void;
}) {
  const { colors } = useTheme();
  const renameDay = useAppStore((state) => state.renameDay);
  const setDayParts = useAppStore((state) => state.setDayParts);
  const [name, setName] = useState(day.name);
  const [isEditingAlias, setIsEditingAlias] = useState(false);

  // Re-sync the draft when a stored alias changes or a failed mutation refreshes
  // the overview with the previous value.
  useEffect(() => {
    setName(day.name);
  }, [day.name]);

  const partIds = day.parts.map((part) => part.id);
  const displayDay = isEditingAlias ? { ...day, name } : day;

  async function finishAliasEditing() {
    const result = await renameDay(day.id, name);
    if (shouldDismissAfterAction(result)) {
      setIsEditingAlias(false);
    }
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
          {routineDayDisplayName(displayDay)}
        </AppText>
        <IconButton icon="chevronUp" disabled={isFirst} onPress={onUp} />
        <IconButton icon="chevronDown" disabled={isLast} onPress={onDown} />
      </View>

      {hasRoutineDayAlias(displayDay) && day.parts.length > 0 ? (
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
          onPress={onToggleEdit}
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
        <IconButton icon="trash" iconColor={colors.danger} onPress={onDelete} />
      </View>

      {isEditing ? (
        <View style={[styles.editor, { borderTopColor: colors.line }]}>
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

      <RoutineAliasEditor
        value={name}
        isEditing={isEditingAlias}
        onChangeText={setName}
        onStartEditing={() => setIsEditingAlias(true)}
        onComplete={finishAliasEditing}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  templateBlock: {
    gap: spacing.sm,
  },
  templateList: {
    gap: spacing.xs,
  },
  templatePicker: {
    gap: spacing.sm,
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
  editor: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: spacing.sm,
    gap: spacing.sm,
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
  addPartRow: {
    flexDirection: 'row',
    gap: spacing.xs,
  },
  addPartInput: {
    flex: 1,
  },
});
