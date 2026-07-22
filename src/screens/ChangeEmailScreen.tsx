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

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'ChangeEmail'>;

export function ChangeEmailScreen({ navigation }: Props) {
  const { user, updateEmail } = useAuth();
  const [email, setEmail] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const normalizedEmail = email.trim().toLowerCase();
  const canSubmit = normalizedEmail.includes('@') && normalizedEmail !== user?.email?.toLowerCase();

  const save = async () => {
    setSubmitting(true);
    setMessage(null);
    setError(null);
    const result = await updateEmail(normalizedEmail);
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setEmail('');
    setMessage('Check your inbox to confirm the email change.');
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SettingsScreenHeader title="Change Email" onBack={() => navigation.goBack()} />
        <View style={styles.content}>
          <Text style={styles.label}>CURRENT EMAIL</Text>
          <Text style={[text.body, styles.currentValue]}>{user?.email ?? 'Not signed in'}</Text>
          <SettingsFormField
            label="New email"
            value={email}
            onChangeText={(value) => {
              setEmail(value);
              setMessage(null);
              setError(null);
            }}
            autoCapitalize="none"
            autoCorrect={false}
            keyboardType="email-address"
            autoComplete="email"
          />
          {!!error && <Text style={styles.error}>{error}</Text>}
          {!!message && <Text style={styles.success}>{message}</Text>}
          <SettingsSubmitButton title="Update Email" submitting={submitting} disabled={!canSubmit} onPress={save} />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { paddingHorizontal: SPACING.lg },
  label: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 12, color: COLORS.muted, marginBottom: SPACING.xs },
  currentValue: { marginBottom: SPACING.xl },
  error: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.gold, marginBottom: SPACING.md },
  success: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.pine, marginBottom: SPACING.md },
});
