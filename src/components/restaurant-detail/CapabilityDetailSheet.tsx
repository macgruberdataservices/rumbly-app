import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

export type CapabilityKind = 'reservations' | 'walkup' | 'diningPlan';

const COPY: Record<CapabilityKind, { title: string; body: string }> = {
  reservations: {
    title: 'Reservations accepted',
    body: 'Check current times in the official Disney app or site.',
  },
  walkup: {
    title: 'Walk-up list offered',
    body: 'Current availability and estimated waits may change.',
  },
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
