import { useState } from 'react';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';
import { useAuth } from '../hooks/useAuth';
import { useEntitlement } from '../hooks/useEntitlement';

// Favorites/check-ins already work fully offline without an account
// (activityProvider.tsx). Signing in only adds cross-device sync
// (Milestone 12) and unlocks entitlement-gated features (Milestone 11+) --
// it is never required to use the app.
export function MyRumblyHomeScreen() {
  const { user, initializing, signOut } = useAuth();

  if (initializing) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.pine} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Text style={text.sectionTitle}>My Rumbly</Text>
      {user ? (
        <SignedInPanel email={user.email ?? ''} userId={user.id} onSignOut={signOut} />
      ) : (
        <AuthPanel />
      )}
    </SafeAreaView>
  );
}

function SignedInPanel({
  email,
  userId,
  onSignOut,
}: {
  email: string;
  userId: string;
  onSignOut: () => Promise<void>;
}) {
  // Milestone 11 diagnostic: proves the entitlement gate reads live from
  // Supabase (toggle a row in user_entitlements, this reflects it) ahead of
  // Milestone 13/14 building real UI behind these flags. Remove once those
  // milestones give these flags a real consumer. userId is shown so it can
  // be compared directly against user_entitlements.user_id in the
  // dashboard when a flag doesn't flip as expected.
  const wantToTryEnabled = useEntitlement('want_to_try');
  const ratingsEnabled = useEntitlement('ratings');

  return (
    <View style={styles.section}>
      <Text style={text.body}>Signed in as {email}</Text>
      <Text style={[text.bodyMuted, styles.subtitle]}>
        Favorites, ratings, check-ins, and your stats are coming in a later phase.
      </Text>
      <Text style={text.bodyMuted}>
        Want to Try: {wantToTryEnabled ? 'On' : 'Off'} · Ratings: {ratingsEnabled ? 'On' : 'Off'}
      </Text>
      <Text style={[text.bodyMuted, styles.userId]} selectable>
        user_id: {userId}
      </Text>
      <Pressable style={styles.secondaryButton} onPress={onSignOut} accessibilityRole="button">
        <Text style={text.buttonLabel}>Sign out</Text>
      </Pressable>
    </View>
  );
}

function AuthPanel() {
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
    if (actionError) {
      setError(actionError);
    }
  };

  return (
    <KeyboardAvoidingView
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      style={styles.section}
    >
      <Text style={[text.bodyMuted, styles.subtitle]}>
        Favorites work without an account. Sign in to sync across devices.
      </Text>

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

      {error && <Text style={[text.bodyMuted, styles.error]}>{error}</Text>}

      <Pressable
        style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
        onPress={handleSubmit}
        disabled={!canSubmit}
        accessibilityRole="button"
      >
        {submitting ? (
          <ActivityIndicator color={COLORS.surface} />
        ) : (
          <Text style={styles.primaryButtonLabel}>
            {mode === 'signIn' ? 'Sign in' : 'Create account'}
          </Text>
        )}
      </Pressable>

      <Pressable
        onPress={() => {
          setError(null);
          setMode((prev) => (prev === 'signIn' ? 'signUp' : 'signIn'));
        }}
        accessibilityRole="button"
      >
        <Text style={[text.bodyMuted, styles.switchModeLabel]}>
          {mode === 'signIn' ? "Don't have an account? Create one" : 'Already have an account? Sign in'}
        </Text>
      </Pressable>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    padding: SPACING.xl,
  },
  centered: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  section: {
    marginTop: SPACING.lg,
  },
  userId: {
    marginTop: SPACING.xs,
    fontSize: 11,
  },
  subtitle: {
    marginBottom: SPACING.lg,
  },
  input: {
    fontFamily: text.body.fontFamily,
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
  error: {
    color: COLORS.gold,
    marginBottom: SPACING.md,
  },
  primaryButton: {
    backgroundColor: COLORS.pine,
    borderRadius: RADII.sm,
    paddingVertical: SPACING.md,
    alignItems: 'center',
    marginBottom: SPACING.md,
  },
  primaryButtonDisabled: {
    opacity: 0.5,
  },
  primaryButtonLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 15,
    color: COLORS.surface,
  },
  switchModeLabel: {
    textAlign: 'center',
  },
  secondaryButton: {
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    paddingVertical: SPACING.sm,
    alignItems: 'center',
    marginTop: SPACING.lg,
    alignSelf: 'flex-start',
    paddingHorizontal: SPACING.lg,
  },
});
