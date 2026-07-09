import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';

export type ConfirmConfig = {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  onConfirm: () => void;
};

export function ConfirmDialog({
  config,
  onClose,
}: {
  config: ConfirmConfig | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();

  return (
    <Modal visible={!!config} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border2 }]}>
          <AppText variant="title">{config?.title}</AppText>
          <AppText variant="footnote" weight="500" tone="tertiary" style={styles.description}>
            {config?.description}
          </AppText>
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[styles.button, { backgroundColor: colors.surface2 }]}>
              <AppText variant="item" tone="secondary">
                닫기
              </AppText>
            </Pressable>
            <Pressable
              onPress={() => {
                config?.onConfirm();
                onClose();
              }}
              style={[
                styles.button,
                { backgroundColor: config?.danger ? colors.dangerSolid : colors.accent },
              ]}>
              <AppText
                variant="item"
                weight="800"
                style={{ color: config?.danger ? '#FFFFFF' : colors.accentText }}>
                {config?.confirmLabel}
              </AppText>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    padding: spacing.xl,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    borderRadius: radius.xl,
    borderWidth: StyleSheet.hairlineWidth,
    padding: spacing.xl,
    gap: spacing.xs,
  },
  description: {
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.sm,
  },
  button: {
    flex: 1,
    borderRadius: radius.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
});
