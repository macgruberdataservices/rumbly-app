import { Linking, Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

const DISNEY_ALLERGY_URL =
  'https://disneyworld.disney.go.com/guest-services/special-dietary-requests/';

export function AllergyAcknowledgementSheet({
  visible,
  onAccept,
  onCancel,
}: {
  visible: boolean;
  onAccept: () => void;
  onCancel: () => void;
}) {
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onCancel}>
      <View style={styles.backdrop}>
        <View style={styles.card} accessibilityViewIsModal>
          <Text style={[text.sectionTitle, styles.title]}>Before viewing allergy-friendly options</Text>
          <Text style={[text.bodyMuted, styles.body]}>
            myRumbly's allergy results come only from menu items that Disney explicitly identifies as
            Allergy-Friendly for the label shown. myRumbly does not evaluate ingredients or
            determine whether food is safe for you.
          </Text>
          <Text style={[text.bodyMuted, styles.body]}>
            Menus, ingredients, preparation methods, and cross-contact conditions can change.
            Always confirm your needs with a Disney Cast Member before ordering.
          </Text>
          <Pressable
            onPress={() => Linking.openURL(DISNEY_ALLERGY_URL)}
            accessibilityRole="link"
          >
            <Text style={[text.buttonLabel, styles.link]}>Disney allergy information</Text>
          </Pressable>
          <View style={styles.actions}>
            <Pressable onPress={onCancel} style={styles.cancelButton} accessibilityRole="button">
              <Text style={[text.buttonLabel, styles.cancelLabel]}>Cancel</Text>
            </Pressable>
            <Pressable onPress={onAccept} style={styles.acceptButton} accessibilityRole="button">
              <Text style={[text.buttonLabel, styles.acceptLabel]}>I understand — Show Results</Text>
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
    backgroundColor: 'rgba(0,0,0,0.4)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: SPACING.xxl,
  },
  card: {
    backgroundColor: COLORS.surface,
    borderRadius: RADII.lg,
    padding: SPACING.xl,
    width: '100%',
  },
  title: { marginBottom: SPACING.md },
  body: { marginBottom: SPACING.md },
  link: { color: COLORS.forest, marginBottom: SPACING.lg },
  actions: { gap: SPACING.sm },
  cancelButton: { alignItems: 'center', paddingVertical: SPACING.sm },
  cancelLabel: { color: COLORS.muted },
  acceptButton: {
    alignItems: 'center',
    backgroundColor: COLORS.forest,
    borderRadius: RADII.md,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.md,
  },
  acceptLabel: { color: COLORS.surface },
});
