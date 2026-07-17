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
  /** Optional second choice for non-destructive scope decisions. */
  alternateLabel?: string;
  onAlternate?: () => boolean | void | Promise<boolean | void>;
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

  async function runAction(action?: () => boolean | void | Promise<boolean | void>) {
    if (!action || isSubmitting) {
      return;
    }

    setIsSubmitting(true);
    try {
      const shouldClose = await action();
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
          <AppText variant="title" wordBreak>
            {config?.title}
          </AppText>
          <AppText
            variant="footnote"
            weight="500"
            tone="tertiary"
            wordBreak
            style={styles.description}>
            {config?.description}
          </AppText>
          {config?.onAlternate && config.alternateLabel ? (
            <View style={styles.choiceActions}>
              <Button
                size="md"
                disabled={isSubmitting}
                onPress={() => runAction(config.onConfirm)}>
                {config.confirmLabel}
              </Button>
              <Button
                size="md"
                variant="neutral"
                disabled={isSubmitting}
                onPress={() => runAction(config.onAlternate)}>
                {config.alternateLabel}
              </Button>
              <Button size="md" variant="ghost" disabled={isSubmitting} onPress={close}>
                닫기
              </Button>
            </View>
          ) : (
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
                onPress={() => runAction(config?.onConfirm)}>
                {config?.confirmLabel}
              </Button>
            </View>
          )}
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
  choiceActions: {
    gap: spacing.xs,
    marginTop: spacing.sm,
  },
  action: {
    flex: 1,
  },
});
