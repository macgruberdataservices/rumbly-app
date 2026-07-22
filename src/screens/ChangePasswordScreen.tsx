import { useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { KeyboardAvoidingView, Platform, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { SettingsFormField } from '../components/settings/SettingsFormField';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { SettingsSubmitButton } from '../components/settings/SettingsSubmitButton';
import { useAuth } from '../hooks/useAuth';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'ChangePassword'>;

export function ChangePasswordScreen({ navigation }: Props) {
  const { updatePassword } = useAuth();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const canSubmit = password.length >= 8 && password === confirmation;

  const updateField = (setter: (value: string) => void, value: string) => {
    setter(value);
    setMessage(null);
    setError(null);
  };

  const save = async () => {
    setSubmitting(true);
    setMessage(null);
    setError(null);
    const result = await updatePassword(password);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setPassword('');
    setConfirmation('');
    setMessage('Password updated.');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SettingsScreenHeader title="Change Password" onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <Text style={[text.bodyMuted, styles.hint]}>
            Use at least 8 characters. For security, you may be asked to sign in again before changing it.
          </Text>
          <SettingsFormField
            label="New password"
            value={password}
            onChangeText={(value) => updateField(setPassword, value)}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          <SettingsFormField
            label="Confirm new password"
            value={confirmation}
            onChangeText={(value) => updateField(setConfirmation, value)}
            secureTextEntry
            autoCapitalize="none"
            autoComplete="new-password"
          />
          {confirmation.length > 0 && password !== confirmation && (
            <Text style={styles.error}>Passwords do not match.</Text>
          )}
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!message && <Text style={styles.success}>{message}</Text>}
          <SettingsSubmitButton title="Update Password" submitting={submitting} disabled={!canSubmit} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { paddingHorizontal: SPACING.lg },
  hint: { marginBottom: SPACING.xl },
  error: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.gold, marginBottom: SPACING.md },
  success: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.pine, marginBottom: SPACING.md },
});
