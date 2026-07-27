import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { ALLERGEN_LABELS } from '../search/filters';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

// Ported from Disney Dining Dev's afTooltipBody() (Front_End/index.html) --
// same deliberately hedged copy. allergy_free_of/has_allergy_option are an
// inferred, name-matched signal (see src/search/filters.ts's header
// comment), never a claim this app is making itself, so the copy always
// defers to Disney/the server rather than asserting an item "is" free of
// something.
const DISNEY_ALLERGY_URL = 'https://disneyworld.disney.go.com/guest-services/special-dietary-requests/';

function bodyText(allergyFreeOf: string[] | undefined): string {
  // Defensive against stale locally-cached data predating this field
  // (same recurring class of bug as Milestone 5's search_index.json gap,
  // see Docs/ROADMAP.md) -- a device that hasn't re-imported since this
  // field was added has undefined here despite the type, and this modal
  // is always mounted (just invisible) so its body runs on every render.
  if (allergyFreeOf && allergyFreeOf.length > 0) {
    const names = allergyFreeOf.map((a) => ALLERGEN_LABELS[a] ?? a).join(', ');
    return `Disney publishes an allergy-friendly version of this item for: ${names}. This reflects Disney's own menu, not a guarantee -- confirm with your server before ordering.`;
  }
  return 'An allergy-friendly version of this item may be available. Ask a Cast Member when ordering.';
}

export function AllergyInfoSheet({
  visible,
  allergyFreeOf,
  onClose,
}: {
  visible: boolean;
  // string[] per the MenuItem/SearchIndexEntry type, but real devices can
  // have stale locally-cached data predating this field -- see bodyText's
  // comment. Typed loosely here on purpose, not tightened to match the
  // (aspirational) MenuItem type.
  allergyFreeOf: string[] | undefined;
  onClose: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} />
        <View style={styles.card}>
          <Text style={[text.sectionTitle, styles.title]}>Allergy-friendly option</Text>
          <Text style={[text.bodyMuted, styles.body]}>{bodyText(allergyFreeOf)}</Text>
          <Pressable onPress={() => Linking.openURL(DISNEY_ALLERGY_URL)} accessibilityRole="link">
            <Text style={[text.buttonLabel, styles.link]}>Disney allergy info page</Text>
          </Pressable>
          <Pressable onPress={onClose} style={styles.closeButton} accessibilityRole="button">
            <Text style={text.buttonLabel}>Close</Text>
          </Pressable>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.xl,
    paddingHorizontal: SPACING.xl,
    width: '100%',
  },
  title: { marginBottom: SPACING.sm },
  body: { marginBottom: SPACING.md },
  link: { color: COLORS.forest, marginBottom: SPACING.lg },
  closeButton: { alignSelf: 'flex-start' },
});
