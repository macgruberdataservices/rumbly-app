import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { useAuth } from '../../hooks/useAuth';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

export function AccountAuthPanel() {
  const { signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'signIn' | 'signUp'>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const canSubmit = email.trim().length > 0 && password.length >= 6 && !submitting;

  const handleSubmit = async () => {
    setError(null);
    setSubmitting(true);
    const action = mode === 'signIn' ? signIn : signUp;
    const { error: actionError } = await action(email.trim(), password);
    setSubmitting(false);
    if (actionError) setError(actionError);
  };

  return (
    <View>
      <Text style={[text.bodyMuted, styles.supportingText]}>Sign in to sync this device's activity.</Text>
      <TextInput
        style={styles.input}
        placeholder="Email"
        placeholderTextColor={COLORS.muted}
        value={email}
        onChangeText={setEmail}
        autoCapitalize="none"
        autoCorrect={false}
        keyboardType="email-address"
        accessibilityLabel="Email"
      />
      <TextInput
        style={styles.input}
        placeholder="Password"
        placeholderTextColor={COLORS.muted}
        value={password}
        onChangeText={setPassword}
        secureTextEntry
        accessibilityLabel="Password"
      />
      {error && <Text style={styles.error}>{error}</Text>}
      <Pressable
        style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color={COLORS.surface} />
        ) : (
          <Text style={styles.primaryButtonLabel}>{mode === 'signIn' ? 'Sign in' : 'Create account'}</Text>
        )}
      </Pressable>
      <Pressable
        onPress={() => {
          setError(null);
          setMode((current) => (current === 'signIn' ? 'signUp' : 'signIn'));
        }}
      >
        <Text style={styles.switchModeLabel}>
          {mode === 'signIn' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  supportingText: { marginBottom: SPACING.md },
  input: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 15,
    color: COLORS.ink,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingHorizontal: SPACING.md,
    paddingVertical: SPACING.sm,
    marginBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  error: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.gold, marginBottom: SPACING.md },
  primaryButton: {
    backgroundColor: COLORS.pine,
    borderRadius: RADII.sm,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: SPACING.md,
  },
  primaryButtonDisabled: { opacity: 0.5 },
  primaryButtonLabel: { fontFamily: FONT_FAMILY.interSemiBold, fontSize: 14, color: COLORS.surface },
  switchModeLabel: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.muted, textAlign: 'center' },
});
