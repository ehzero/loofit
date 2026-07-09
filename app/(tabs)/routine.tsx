import { useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { AppButton } from '@/src/components/AppButton';
import { Panel } from '@/src/components/Panel';
import { RoutineDayRow } from '@/src/components/Rows';
import { Screen } from '@/src/components/Screen';
import { useAppStore } from '@/src/store/app-store';
import { theme } from '@/src/styles/theme';
import type { BodyPart, RoutineTemplate } from '@/src/types';

const TEMPLATES: Array<{ key: RoutineTemplate; label: string }> = [
  { key: 'ppl', label: 'PPL' },
  { key: 'threeSplit', label: '3분할' },
  { key: 'upperLower', label: '상하체' },
];

export default function RoutineScreen() {
  const overview = useAppStore((state) => state.overview);
  const createTemplate = useAppStore((state) => state.createTemplate);
  const addPart = useAppStore((state) => state.addPart);
  const archivePart = useAppStore((state) => state.archivePart);
  const addDay = useAppStore((state) => state.addDay);
  const chooseNextDay = useAppStore((state) => state.chooseNextDay);
  const [partName, setPartName] = useState('');
  const [dayName, setDayName] = useState('');
  const [selectedParts, setSelectedParts] = useState<number[]>([]);

  if (!overview) {
    return <Screen title="루틴" isLoading />;
  }

  async function submitPart() {
    await addPart(partName);
    setPartName('');
  }

  async function submitRoutineDay() {
    await addDay(dayName, selectedParts);
    setDayName('');
    setSelectedParts([]);
  }

  return (
    <Screen title="루틴" subtitle="루틴은 사용자가 직접 바꾸기 전까지 자동으로 바뀌지 않습니다.">
      <Panel title="루틴 템플릿">
        <View style={styles.templateRow}>
          {TEMPLATES.map((template) => (
            <AppButton key={template.key} variant="secondary" onPress={() => createTemplate(template.key)}>
              {template.label}
            </AppButton>
          ))}
        </View>
      </Panel>

      <Panel title={overview.activeRoutine?.name ?? '활성 루틴 없음'}>
        {overview.routineDays.length === 0 ? (
          <Text style={styles.muted}>템플릿을 선택하거나 루틴 데이를 직접 추가하세요.</Text>
        ) : (
          overview.routineDays.map((day) => (
            <RoutineDayRow
              key={day.id}
              day={day}
              isNext={day.id === overview.nextRoutineDay?.id}
              onPress={() => chooseNextDay(day.id)}
            />
          ))
        )}
        <Text style={styles.help}>행을 누르면 다음 추천 시작점으로 지정됩니다.</Text>
      </Panel>

      <Panel title="운동 부위">
        <View style={styles.inputRow}>
          <TextInput
            value={partName}
            onChangeText={setPartName}
            placeholder="새 운동 부위"
            style={styles.input}
          />
          <AppButton variant="secondary" onPress={submitPart}>
            추가
          </AppButton>
        </View>
        <View style={styles.chipWrap}>
          {overview.bodyParts.map((part) => (
            <BodyPartChip
              key={part.id}
              part={part}
              selected={selectedParts.includes(part.id)}
              onPress={() =>
                setSelectedParts((current) =>
                  current.includes(part.id)
                    ? current.filter((id) => id !== part.id)
                    : [...current, part.id]
                )
              }
              onLongPress={() => archivePart(part.id)}
            />
          ))}
        </View>
        <Text style={styles.help}>길게 누르면 새 선택 목록에서 보관됩니다. 과거 기록은 유지됩니다.</Text>
      </Panel>

      <Panel title="루틴 데이 추가">
        <TextInput
          value={dayName}
          onChangeText={setDayName}
          placeholder="예: Cardio"
          style={styles.input}
        />
        <Text style={styles.help}>위에서 선택한 운동 부위가 새 루틴 데이에 들어갑니다.</Text>
        <AppButton
          disabled={!overview.activeRoutine || dayName.trim().length === 0 || selectedParts.length === 0}
          onPress={submitRoutineDay}>
          루틴 데이 추가
        </AppButton>
      </Panel>
    </Screen>
  );
}

function BodyPartChip({
  part,
  selected,
  onPress,
  onLongPress,
}: {
  part: BodyPart;
  selected: boolean;
  onPress: () => void;
  onLongPress: () => void;
}) {
  return (
    <Pressable
      onPress={onPress}
      onLongPress={onLongPress}
      style={[
        styles.chip,
        selected ? { backgroundColor: part.color, borderColor: part.color } : null,
      ]}>
      <Text style={[styles.chipText, selected ? styles.chipTextSelected : null]}>{part.name}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  templateRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  inputRow: {
    alignItems: 'center',
    flexDirection: 'row',
    gap: theme.spacing.sm,
  },
  input: {
    backgroundColor: theme.colors.surfaceAlt,
    borderColor: theme.colors.border,
    borderRadius: theme.radius.sm,
    borderWidth: StyleSheet.hairlineWidth,
    color: theme.colors.text,
    flex: 1,
    minHeight: 44,
    paddingHorizontal: theme.spacing.md,
  },
  muted: {
    color: theme.colors.muted,
    fontSize: 14,
  },
  help: {
    color: theme.colors.muted,
    fontSize: 12,
    lineHeight: 18,
  },
  chipWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: theme.spacing.sm,
  },
  chip: {
    borderColor: theme.colors.border,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: theme.spacing.md,
    paddingVertical: theme.spacing.sm,
  },
  chipText: {
    color: theme.colors.text,
    fontSize: 13,
    fontWeight: '700',
  },
  chipTextSelected: {
    color: '#FFFFFF',
  },
});
