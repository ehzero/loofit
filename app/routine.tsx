import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { Chip } from '@/src/components/Chip';
import { Icon } from '@/src/components/Icon';
import { Screen } from '@/src/components/Screen';
import { hasRoutineDayAlias, routineDayDisplayName } from '@/src/domain/routine';
import { useAppStore } from '@/src/store/app-store';
import { useTheme } from '@/src/theme/ThemeProvider';
import { useToast } from '@/src/theme/ToastProvider';
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
  const nextName = overview.nextRoutineDay ? routineDayDisplayName(overview.nextRoutineDay) : '-';

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
      <View
        style={[
          styles.hint,
          {
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}>
        <Icon name="bolt" size={18} color={colors.accent} />
        <Text style={[styles.hintText, { color: colors.tx2 }]}>
          다음 운동은 <Text style={{ color: colors.accent, fontWeight: '800' }}>{nextName}</Text> 이에요.
          각 분할의 <Text style={{ fontWeight: '800' }}>다음 시작</Text> 버튼으로 시작점을 바꿀 수 있어요.
        </Text>
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
            onSetNext={() => chooseNextDay(day.id).then(() => showToast('다음 운동 시작점을 바꿨어요'))}
            onToggleEdit={() => setEditingId((current) => (current === day.id ? null : day.id))}
          />
        ))}

        <Pressable
          onPress={() => addEmptyDay('')}
          style={[styles.addSplit, { borderColor: colors.border2 }]}>
          <Text style={[styles.addSplitText, { color: colors.tx3 }]}>+ 분할 추가</Text>
        </Pressable>
      </View>

      <View style={styles.manageBlock}>
        <Text style={[styles.manageTitle, { color: colors.tx }]}>운동 부위 관리</Text>
        <View style={styles.manageChips}>
          {overview.bodyParts.map((part) => (
            <View
              key={part.id}
              style={[styles.managePill, { backgroundColor: colors.surface2, borderColor: colors.border2 }]}>
              <Text style={[styles.managePillText, { color: colors.tx2 }]}>{part.name}</Text>
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
            style={[styles.addPartBtn, { backgroundColor: colors.chip, borderColor: colors.border2 }]}>
            <Text style={[styles.addPartBtnText, { color: colors.tx }]}>추가</Text>
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
          <Text style={[styles.orderText, { color: colors.tx3 }]}>{order}</Text>
        </View>
        <Text style={[styles.splitName, { color: colors.tx }]}>{routineDayDisplayName(day)}</Text>
        <IconBtn name="chevronUp" disabled={isFirst} onPress={onUp} />
        <IconBtn name="chevronDown" disabled={isLast} onPress={onDown} />
      </View>

      {hasRoutineDayAlias(day) && day.parts.length > 0 ? (
        <View style={styles.tagRow}>
          {day.parts.map((part) => (
            <View key={part.id} style={[styles.smallTag, { backgroundColor: colors.chip, borderColor: colors.border2 }]}>
              <Text style={[styles.smallTagText, { color: colors.tx2 }]}>{part.name}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={styles.splitActions}>
        <Pressable
          onPress={onSetNext}
          style={[
            styles.splitBtn,
            isNext
              ? { backgroundColor: colors.accent }
              : { backgroundColor: colors.surface2, borderColor: colors.border2, borderWidth: StyleSheet.hairlineWidth },
          ]}>
          <Text style={[styles.splitBtnText, { color: isNext ? colors.accentText : colors.tx3 }]}>
            다음 시작
          </Text>
        </Pressable>
        <Pressable
          onPress={commitNameAndToggle}
          style={[
            styles.splitBtn,
            isEditing
              ? { backgroundColor: colors.accent }
              : { backgroundColor: colors.surface2, borderColor: colors.border2, borderWidth: StyleSheet.hairlineWidth },
          ]}>
          <Text style={[styles.splitBtnText, { color: isEditing ? colors.accentText : colors.tx2 }]}>
            {isEditing ? '편집 완료' : '부위 편집'}
          </Text>
        </Pressable>
        <Pressable
          onPress={onDelete}
          style={[styles.deleteBtn, { backgroundColor: colors.surface2, borderColor: colors.border2 }]}>
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
          <View style={styles.tagRow}>
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
        { backgroundColor: colors.surface2, borderColor: colors.border2, opacity: disabled ? 0.35 : 1 },
      ]}>
      <Icon name={name} size={15} color={colors.tx3} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  hint: {
    flexDirection: 'row',
    gap: 9,
    borderRadius: 14,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 14,
  },
  hintText: {
    flex: 1,
    fontSize: 13,
    fontWeight: '600',
    lineHeight: 20,
  },
  splitList: {
    gap: 11,
  },
  split: {
    borderRadius: 16,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 16,
    gap: 13,
  },
  splitHead: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  orderBadge: {
    width: 24,
    height: 24,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  orderText: {
    fontSize: 12,
    fontWeight: '800',
  },
  splitName: {
    flex: 1,
    fontSize: 16,
    fontWeight: '800',
  },
  iconBtn: {
    width: 30,
    height: 30,
    borderRadius: 8,
    borderWidth: StyleSheet.hairlineWidth,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tagRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 6,
  },
  smallTag: {
    paddingHorizontal: 11,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  smallTagText: {
    fontSize: 12,
    fontWeight: '700',
  },
  splitActions: {
    flexDirection: 'row',
    gap: 8,
  },
  splitBtn: {
    flex: 1,
    borderRadius: 10,
    paddingVertical: 9,
    alignItems: 'center',
  },
  splitBtnText: {
    fontSize: 12,
    fontWeight: '700',
  },
  deleteBtn: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  editor: {
    borderTopWidth: StyleSheet.hairlineWidth,
    paddingTop: 13,
    gap: 11,
  },
  editorInput: {
    borderRadius: 10,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 13,
    paddingVertical: 11,
    fontSize: 14,
    fontWeight: '700',
  },
  addSplit: {
    borderWidth: 1.5,
    borderStyle: 'dashed',
    borderRadius: 14,
    padding: 15,
    alignItems: 'center',
  },
  addSplitText: {
    fontSize: 14,
    fontWeight: '700',
  },
  manageBlock: {
    gap: 11,
  },
  manageTitle: {
    fontSize: 13,
    fontWeight: '800',
  },
  manageChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 7,
  },
  managePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingLeft: 13,
    paddingRight: 8,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: StyleSheet.hairlineWidth,
  },
  managePillText: {
    fontSize: 13,
    fontWeight: '700',
  },
  addPartRow: {
    flexDirection: 'row',
    gap: 8,
  },
  input: {
    flex: 1,
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 14,
    fontWeight: '600',
  },
  addPartBtn: {
    borderRadius: 12,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: 18,
    justifyContent: 'center',
  },
  addPartBtnText: {
    fontSize: 14,
    fontWeight: '700',
  },
});
