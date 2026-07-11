import { useEffect, useState } from 'react';
import { Modal, StyleSheet, View } from 'react-native';

import { useTheme } from '@/src/theme/ThemeProvider';
import { radius, spacing } from '@/src/theme/tokens';

import { AppText } from './AppText';
import { Button } from './Button';

export type ConfirmConfig = {
  title: string;
  description: string;
  confirmLabel: string;
  danger?: boolean;
  /** Return false when the action failed and the dialog should stay open. */
  onConfirm: () => boolean | void | Promise<boolean | void>;
};

export function ConfirmDialog({
  config,
  onClose,
}: {
  config: ConfirmConfig | null;
  onClose: () => void;
}) {
  const { colors } = useTheme();
  const [isSubmitting, setIsSubmitting] = useState(false);

  useEffect(() => {
    setIsSubmitting(false);
  }, [config]);

  async function confirm() {
    if (!config || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const shouldClose = await config.onConfirm();
      if (shouldClose !== false) {
        onClose();
      }
    } catch {
      // The action layer presents the error. Keep the destructive choice open
      // so the user can retry or explicitly cancel it.
    } finally {
      setIsSubmitting(false);
    }
  }

  const close = () => {
    if (!isSubmitting) {
      onClose();
    }
  };

  return (
    <Modal visible={!!config} transparent animationType="fade" onRequestClose={close}>
      <View style={styles.backdrop}>
        <View style={[styles.dialog, { backgroundColor: colors.card, borderColor: colors.border2 }]}>
          <AppText variant="title">{config?.title}</AppText>
          <AppText variant="footnote" weight="500" tone="tertiary" style={styles.description}>
            {config?.description}
          </AppText>
          <View style={styles.actions}>
            <Button
              size="md"
              variant="neutral"
              style={styles.action}
              disabled={isSubmitting}
              onPress={close}>
              닫기
            </Button>
            <Button
              size="md"
              variant={config?.danger ? 'dangerSolid' : 'accent'}
              style={styles.action}
              disabled={isSubmitting}
              onPress={confirm}>
              {config?.confirmLabel}
            </Button>
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
  action: {
    flex: 1,
  },
});
