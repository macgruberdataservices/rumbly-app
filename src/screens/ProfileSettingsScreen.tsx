import { useEffect, useState } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { SettingsFormField } from '../components/settings/SettingsFormField';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { SettingsSubmitButton } from '../components/settings/SettingsSubmitButton';
import { EMPTY_PROFILE, loadUserProfile, saveUserProfile, type UserProfile } from '../data/profiles';
import { useAuth } from '../hooks/useAuth';
import { COLORS, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'ProfileSettings'>;

export function ProfileSettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!user) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    loadUserProfile(user.id)
      .then((value) => {
        if (!cancelled) setProfile(value);
      })
      .catch((loadError) => {
        if (!cancelled) setError(loadError instanceof Error ? loadError.message : 'Unable to load profile.');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [user]);

  const update = (key: keyof UserProfile, value: string) => {
    setMessage(null);
    setError(null);
    setProfile((current) => ({ ...current, [key]: value }));
  };

  const save = async () => {
    if (!user) return;
    setSubmitting(true);
    setMessage(null);
    setError(null);
    try {
      await saveUserProfile(user.id, profile);
      setProfile((current) => ({
        firstName: current.firstName.trim(),
        lastName: current.lastName.trim(),
        nickname: current.nickname.trim(),
      }));
      setMessage('Profile saved.');
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Unable to save profile.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SettingsScreenHeader title="Profile" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {loading ? (
            <ActivityIndicator color={COLORS.pine} />
          ) : !user ? (
            <Text style={text.bodyMuted}>Sign in to edit your profile.</Text>
          ) : (
            <>
              <Text style={styles.email}>{user.email}</Text>
              <SettingsFormField
                label="First name"
                value={profile.firstName}
                onChangeText={(value) => update('firstName', value)}
                autoCapitalize="words"
                maxLength={100}
              />
              <SettingsFormField
                label="Last name"
                value={profile.lastName}
                onChangeText={(value) => update('lastName', value)}
                autoCapitalize="words"
                maxLength={100}
              />
              <SettingsFormField
                label="Nickname"
                value={profile.nickname}
                onChangeText={(value) => update('nickname', value)}
                autoCapitalize="words"
                maxLength={50}
              />
              {!!error && <Text style={styles.error}>{error}</Text>}
              {!!message && <Text style={styles.success}>{message}</Text>}
              <SettingsSubmitButton title="Save Profile" submitting={submitting} disabled={false} onPress={save} />
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl },
  email: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.muted, marginBottom: SPACING.xl },
  error: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.gold, marginBottom: SPACING.md },
  success: { fontFamily: FONT_FAMILY.interRegular, fontSize: 13, color: COLORS.pine, marginBottom: SPACING.md },
});
