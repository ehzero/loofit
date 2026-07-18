import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AppText } from '@/src/components/AppText';
import { Button } from '@/src/components/Button';
import { Callout } from '@/src/components/Callout';
import { Chip } from '@/src/components/Chip';
import { ConfirmDialog, type ConfirmConfig } from '@/src/components/ConfirmDialog';
import { EmptyState } from '@/src/components/EmptyState';
import { IconButton } from '@/src/components/IconButton';
import { RoutineAliasEditor } from '@/src/components/RoutineAliasEditor';
import { Screen } from '@/src/components/Screen';
import {
  buildRoutineTemplateCustomization,
  isRoutineTemplate,
  ROUTINE_TEMPLATES,
} from '@/src/config/routine-templates';
import {
  isActionSuccessful,
  shouldDismissAfterAction,
  useAppStore,
} from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
import { radius, spacing } from '@/src/theme/tokens';
import type { RoutineTemplateCustomization } from '@/src/types';

export default function RoutineTemplateScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ template?: string; source?: string }>();
  const templateKey = isRoutineTemplate(params.template) ? params.template : null;
  const isReplacement = params.source === 'settings';
  const { colors } = useTheme();
  const { showToast } = useToast();

  const overview = useAppStore((state) => state.overview);
  const isBusy = useAppStore((state) => state.isBusy);
  const createTemplate = useAppStore((state) => state.createTemplate);
  const [customizationOverride, setCustomizationOverride] =
    useState<RoutineTemplateCustomization | null>(null);
  const [editingAliasDayIndex, setEditingAliasDayIndex] = useState<number | null>(null);
  const [confirm, setConfirm] = useState<ConfirmConfig | null>(null);

  const initialCustomization = useMemo(
    () =>
      overview && templateKey
        ? buildRoutineTemplateCustomization(templateKey, overview.bodyParts)
        : null,
    [overview, templateKey]
  );
  const customization = customizationOverride ?? initialCustomization;

  if (!overview) {
    return <Screen title="루틴 상세 설정" onBack={() => router.back()} isLoading />;
  }

  if (!templateKey) {
    return (
      <Screen title="루틴 상세 설정" onBack={() => router.back()}>
        <EmptyState
          title="템플릿을 찾지 못했어요"
          description="이전 화면에서 템플릿을 다시 선택해 주세요."
        />
        <Button variant="neutral" onPress={() => router.back()}>
          돌아가기
        </Button>
      </Screen>
    );
  }

  const selectedTemplateKey = templateKey;
  const bodyParts = overview.bodyParts;
  const template = ROUTINE_TEMPLATES[selectedTemplateKey];
  const canContinue =
    customization?.days.length === template.days.length &&
    customization.days.every((day) => day.bodyPartIds.length > 0);

  function toggleBodyPart(dayIndex: number, bodyPartId: number) {
    setCustomizationOverride((current) => {
      const draft = current ?? initialCustomization;
      if (!draft) {
        return current;
      }

      const selectedIds = draft.days[dayIndex]?.bodyPartIds ?? [];
      const selected = new Set(selectedIds);
      if (selected.has(bodyPartId)) {
        selected.delete(bodyPartId);
      } else {
        selected.add(bodyPartId);
      }

      return {
        days: draft.days.map((day, index) =>
          index === dayIndex
            ? {
                ...day,
                bodyPartIds: bodyParts
                  .filter((part) => selected.has(part.id))
                  .map((part) => part.id),
              }
            : day
        ),
      };
    });
  }

  function updateAlias(dayIndex: number, alias: string) {
    setCustomizationOverride((current) => {
      const draft = current ?? initialCustomization;
      if (!draft) {
        return current;
      }

      return {
        days: draft.days.map((day, index) =>
          index === dayIndex ? { ...day, alias } : day
        ),
      };
    });
  }

  function moveDay(dayIndex: number, direction: -1 | 1) {
    setCustomizationOverride((current) => {
      const draft = current ?? initialCustomization;
      const targetIndex = dayIndex + direction;
      if (!draft || targetIndex < 0 || targetIndex >= draft.days.length) {
        return current;
      }

      const days = [...draft.days];
      [days[dayIndex], days[targetIndex]] = [days[targetIndex], days[dayIndex]];
      return { days };
    });
    setEditingAliasDayIndex(null);
  }

  function requestConfirmation() {
    if (!customization || !canContinue) {
      return;
    }

    setConfirm({
      title: isReplacement
        ? `${template.name} 설정으로 교체할까요?`
        : `${template.name} 루틴을 만들까요?`,
      description: isReplacement
        ? '현재 분할과 다음 운동 시작점이 지금 설정한 내용으로 교체돼요. 과거 운동 기록은 그대로 유지돼요.'
        : '지금 설정한 분할과 운동 부위로 루틴을 만들어요. 만든 뒤에도 루틴 설정에서 언제든 바꿀 수 있어요.',
      confirmLabel: isReplacement ? '루틴 교체' : '루틴 만들기',
      danger: isReplacement,
      onConfirm: async () => {
        const result = await createTemplate(selectedTemplateKey, customization);
        if (isActionSuccessful(result)) {
          showToast(
            isReplacement
              ? `${template.name} 설정으로 교체했어요`
              : `${template.name} 루틴을 만들었어요`
          );
        }
        if (shouldDismissAfterAction(result)) {
          router.dismissTo(isReplacement ? '/routine' : '/');
        }
        return shouldDismissAfterAction(result);
      },
    });
  }

  return (
    <>
      <Screen title="루틴 상세 설정" onBack={() => router.back()}>
        <View style={styles.intro}>
          <AppText variant="heading">{template.name}</AppText>
          <AppText variant="body" weight="500" tone="tertiary">
            분할 순서와 운동 부위, 별칭을 내 운동 방식에 맞게 설정하세요.
          </AppText>
        </View>

        <Callout icon="edit" tone="accent">
          루틴을 만든 뒤에도 루틴 설정에서 언제든 수정할 수 있어요.
        </Callout>

        <View style={styles.splitList}>
          {template.days.map((day, dayIndex) => {
            const selectedIds = customization?.days[dayIndex]?.bodyPartIds ?? [];
            const selectedNames = bodyParts
              .filter((part) => selectedIds.includes(part.id))
              .map((part) => part.name);
            const alias = customization?.days[dayIndex]?.alias ?? day.name;
            const hasAlias = alias.trim().length > 0;
            const splitName = hasAlias
              ? alias.trim()
              : selectedNames.length > 0
                ? selectedNames.join(' · ')
                : '운동 부위 없음';
            const isEditingAlias = editingAliasDayIndex === dayIndex;

            return (
              <View
                key={`${selectedTemplateKey}-${dayIndex}`}
                style={[
                  styles.splitCard,
                  { backgroundColor: colors.card, borderColor: colors.border },
                ]}>
                <View style={styles.splitHeader}>
                  <View style={[styles.orderBadge, { backgroundColor: colors.surface2 }]}>
                    <AppText variant="label" tone="tertiary">
                      {dayIndex + 1}
                    </AppText>
                  </View>
                  <View style={styles.splitCopy}>
                    <AppText variant="title">{splitName}</AppText>
                    {hasAlias || selectedNames.length === 0 ? (
                      <AppText
                        variant="footnote"
                        tone={selectedNames.length > 0 ? 'muted' : 'danger'}>
                        {selectedNames.length > 0
                          ? selectedNames.join(' · ')
                          : '운동 부위를 하나 이상 선택해 주세요'}
                      </AppText>
                    ) : null}
                  </View>
                  <View style={styles.orderActions}>
                    <IconButton
                      icon="chevronUp"
                      disabled={dayIndex === 0}
                      onPress={() => moveDay(dayIndex, -1)}
                    />
                    <IconButton
                      icon="chevronDown"
                      disabled={dayIndex === template.days.length - 1}
                      onPress={() => moveDay(dayIndex, 1)}
                    />
                  </View>
                </View>

                <View style={styles.chipWrap}>
                  {bodyParts.map((part) => (
                    <Chip
                      key={part.id}
                      label={part.name}
                      selected={selectedIds.includes(part.id)}
                      onPress={() => toggleBodyPart(dayIndex, part.id)}
                    />
                  ))}
                </View>

                <RoutineAliasEditor
                  value={alias}
                  isEditing={isEditingAlias}
                  onChangeText={(value) => updateAlias(dayIndex, value)}
                  onStartEditing={() => setEditingAliasDayIndex(dayIndex)}
                  onComplete={() => setEditingAliasDayIndex(null)}
                />
              </View>
            );
          })}
        </View>

        <View style={styles.footer}>
          <Button disabled={!canContinue || isBusy} onPress={requestConfirmation}>
            선택 완료
          </Button>
          {!canContinue ? (
            <AppText variant="label" tone="danger" style={styles.footerNotice}>
              모든 분할에 운동 부위를 하나 이상 선택해 주세요.
            </AppText>
          ) : null}
        </View>
      </Screen>
      <ConfirmDialog config={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}

const styles = StyleSheet.create({
  intro: {
    gap: spacing.xxs,
  },
  splitList: {
    gap: spacing.sm,
  },
  splitCard: {
    borderRadius: radius.lg,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.md,
    gap: spacing.md,
  },
  splitHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  orderBadge: {
    width: spacing.xl,
    height: spacing.xl,
    borderRadius: radius.sm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  splitCopy: {
    flex: 1,
    gap: spacing.xxs,
  },
  orderActions: {
    flexDirection: 'row',
    gap: spacing.xxs,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.xs,
  },
  footer: {
    gap: spacing.xs,
  },
  footerNotice: {
    textAlign: 'center',
  },
});
