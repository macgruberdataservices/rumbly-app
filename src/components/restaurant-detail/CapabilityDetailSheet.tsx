import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import {
  BottomSheet,
  Button as NativeButton,
  Column,
  Text as NativeText,
} from '@expo/ui';
import { useAppSettings } from '../../hooks/useAppSettings';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

// Reservations and walk-up used to open this sheet too (an informational
// modal + "View Official Page" browser link) -- both now deep-link
// straight into the official app instead (see mdxDeepLink.ts), so this
// sheet is Dining Plan-only. Kept as a union of one rather than a plain
// boolean so a future capability with no deep link can slot back in the
// same way.
export type CapabilityKind = 'diningPlan';

const COPY: Record<CapabilityKind, { title: string; body: string }> = {
  diningPlan: {
    title: 'Disney Dining Plan accepted',
    body: 'Specific credit eligibility may vary by menu item — confirm in the official Disney app or site.',
  },
};

// Deliberately no "Check Availability"/"Check Current Status" action
// button — Rumbly has no live reservation/wait-time data source yet
// (later phase). Informational only, plus a real link out when we have
// one, rather than a dead-end tap.
export function CapabilityDetailSheet({
  kind,
  officialUrl,
  onClose,
}: {
  kind: CapabilityKind | null;
  officialUrl: string | null;
  onClose: () => void;
}) {
  const copy = kind ? COPY[kind] : null;
  const { nativeInteractionsEnabled } = useAppSettings();

  if (nativeInteractionsEnabled) {
    return (
      <BottomSheet
        isPresented={kind !== null}
        onDismiss={onClose}
        showDragIndicator
      >
        {copy && (
          <Column spacing={16} style={{ paddingBottom: 24 }}>
            <NativeText
              textStyle={{ fontSize: 22, fontWeight: '700', color: COLORS.ink }}
            >
              {copy.title}
            </NativeText>
            <NativeText
              textStyle={{ fontSize: 15, lineHeight: 21, color: COLORS.muted }}
            >
              {copy.body}
            </NativeText>
            {officialUrl && (
              <NativeButton
                label="View Official Page"
                onPress={() => Linking.openURL(officialUrl)}
              />
            )}
          </Column>
        )}
      </BottomSheet>
    );
  }

  return (
    <Modal visible={kind !== null} transparent animationType="fade" onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose}>
        <Pressable style={styles.sheet} onPress={(e) => e.stopPropagation()}>
          {copy && (
            <>
              <Text style={text.sectionTitle}>{copy.title}</Text>
              <Text style={[text.bodyMuted, styles.body]}>{copy.body}</Text>
              {officialUrl && (
                <Pressable style={styles.linkButton} onPress={() => Linking.openURL(officialUrl)}>
                  <Text style={text.buttonLabel}>View Official Page</Text>
                </Pressable>
              )}
            </>
          )}
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'flex-end',
  },
  sheet: {
    backgroundColor: COLORS.surface,
    borderTopLeftRadius: RADII.xl,
    borderTopRightRadius: RADII.xl,
    padding: SPACING.xl,
    paddingBottom: SPACING.xxl,
  },
  body: {
    marginTop: SPACING.sm,
  },
  linkButton: {
    marginTop: SPACING.lg,
    alignSelf: 'flex-start',
  },
});
