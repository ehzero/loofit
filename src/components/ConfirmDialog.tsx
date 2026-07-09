import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';

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
          <Text style={[styles.title, { color: colors.tx }]}>{config?.title}</Text>
          <Text style={[styles.description, { color: colors.tx3 }]}>{config?.description}</Text>
          <View style={styles.actions}>
            <Pressable
              onPress={onClose}
              style={[styles.button, { backgroundColor: colors.surface2 }]}>
              <Text style={[styles.buttonText, { color: colors.tx2 }]}>닫기</Text>
            </Pressable>
            <Pressable
              onPress={() => {
                config?.onConfirm();
                onClose();
              }}
              style={[styles.button, { backgroundColor: config?.danger ? '#E05555' : colors.accent }]}>
              <Text
                style={[
                  styles.buttonText,
                  { color: config?.danger ? '#FFFFFF' : colors.accentText, fontWeight: '800' },
                ]}>
                {config?.confirmLabel}
              </Text>
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
    padding: 28,
  },
  dialog: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth,
    padding: 24,
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: '800',
  },
  description: {
    fontSize: 13,
    fontWeight: '500',
    lineHeight: 20,
  },
  actions: {
    flexDirection: 'row',
    gap: 10,
    marginTop: 14,
  },
  button: {
    flex: 1,
    borderRadius: 13,
    paddingVertical: 14,
    alignItems: 'center',
  },
  buttonText: {
    fontSize: 15,
    fontWeight: '700',
  },
});
