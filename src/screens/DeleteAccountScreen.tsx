import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { SettingsStackParamList } from '../navigation/settingsTypes';
import { SettingsFormField } from '../components/settings/SettingsFormField';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { SettingsSubmitButton } from '../components/settings/SettingsSubmitButton';
import { useAuth } from '../hooks/useAuth';
import { COLORS, DAYLIGHT, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<SettingsStackParamList, 'DeleteAccount'>;

const CONFIRM_PHRASE = 'DELETE';

export function DeleteAccountScreen({ navigation }: Props) {
  const { deleteAccount } = useAuth();
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = confirmation.trim().toUpperCase() === CONFIRM_PHRASE;

  const updateConfirmation = (value: string) => {
    setConfirmation(value);
    setError(null);
  };

  const confirmDelete = async () => {
    setSubmitting(true);
    setError(null);
    const result = await deleteAccount();
    if (result.error) {
      setSubmitting(false);
      setError(result.error);
      return;
    }
    // The account is gone; land back on AccountManagement, which now shows
    // the signed-out view (same screen sign-out already returns to).
    navigation.goBack();
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SettingsScreenHeader title="Delete Account" onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <Text style={[text.bodyMuted, styles.paragraph]}>
            This permanently deletes your account and everything tied to it: your profile, your Need
            It / Got It / Love It history, and your Journal entries. This can't be undone.
          </Text>
          <Text style={[text.bodyMuted, styles.paragraph]}>
            Journal photos already saved to this device aren't cleared by this action -- delete them
            yourself, or remove the app, to clear those too.
          </Text>
          <SettingsFormField
            label={`Type ${CONFIRM_PHRASE} to confirm`}
            value={confirmation}
            onChangeText={updateConfirmation}
            autoCapitalize="characters"
            autoCorrect={false}
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          <SettingsSubmitButton
            title="Permanently Delete Account"
            submitting={submitting}
            disabled={!canSubmit}
            destructive
            onPress={confirmDelete}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: DAYLIGHT.mist },
  content: { paddingHorizontal: SPACING.lg, paddingTop: SPACING.lg },
  paragraph: { marginBottom: SPACING.lg },
  error: { fontFamily: FONT_FAMILY.workSansRegular, fontSize: 13, color: COLORS.gold, marginBottom: SPACING.md },
});
