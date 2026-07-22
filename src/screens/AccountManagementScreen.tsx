import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, KeyboardAvoidingView, Platform, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { AccountAuthPanel } from '../components/settings/AccountAuthPanel';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY, text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'AccountManagement'>;

export function AccountManagementScreen({ navigation }: Props) {
  const { user, initializing, signOut } = useAuth();
  const open = (title: string) => navigation.navigate('SettingsPlaceholder', { title });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <SettingsScreenHeader title="Account" onBack={() => navigation.goBack()} />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled" automaticallyAdjustKeyboardInsets>
          {initializing ? (
            <ActivityIndicator color={COLORS.pine} />
          ) : user ? (
            <>
              <Text style={styles.sectionLabel}>PROFILE</Text>
              <SettingsRow
                title="Profile"
                subtitle={user.email ?? 'Signed in'}
                onPress={() => navigation.navigate('ProfileSettings')}
              />
              <SettingsRow title="Change Email" onPress={() => navigation.navigate('ChangeEmail')} />
              <SettingsRow title="Change Password" onPress={() => navigation.navigate('ChangePassword')} />

              <View style={styles.sectionBreak} />
              <Text style={styles.sectionLabel}>PRIVACY & DATA</Text>
              <SettingsRow title="Privacy" onPress={() => open('Privacy')} />
              <SettingsRow title="Devices" onPress={() => open('Devices')} />
              <SettingsRow title="Delete Account" destructive onPress={() => open('Delete Account')} />

              <View style={styles.signOutSection}>
                <Pressable
                  accessibilityRole="button"
                  style={({ pressed }) => [styles.signOutCard, pressed && styles.signOutCardPressed]}
                  onPress={signOut}
                >
                  <Text style={text.buttonLabel}>Sign out</Text>
                </Pressable>
              </View>
            </>
          ) : (
            <View style={styles.authSection}>
              <Text style={styles.sectionLabel}>ACCOUNT</Text>
              <AccountAuthPanel />
            </View>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { flexGrow: 1, paddingBottom: SPACING.xxl },
  authSection: { paddingHorizontal: SPACING.lg },
  sectionLabel: {
    fontFamily: FONT_FAMILY.interBold,
    fontSize: 11,
    color: COLORS.muted,
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.lg,
    paddingBottom: SPACING.sm,
  },
  sectionBreak: { height: 10, marginTop: SPACING.lg, backgroundColor: COLORS.goldLight },
  signOutSection: {
    marginTop: 'auto',
    paddingTop: SPACING.xxl,
    paddingHorizontal: SPACING.lg,
  },
  signOutCard: {
    minHeight: 52,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.sm,
    backgroundColor: COLORS.surface,
  },
  signOutCardPressed: { backgroundColor: COLORS.goldLight },
});
