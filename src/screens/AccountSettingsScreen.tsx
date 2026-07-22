import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ScrollView, StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { SettingsRow } from '../components/settings/SettingsRow';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { useAuth } from '../hooks/useAuth';
import { COLORS, SPACING } from '../theme/tokens';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'AccountSettings'>;

export function AccountSettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const openPlaceholder = (title: string) => navigation.navigate('SettingsPlaceholder', { title });

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title="Settings" onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <SettingsRow
          title="Account"
          subtitle={user?.email ?? 'Sign in, profile, privacy'}
          onPress={() => navigation.navigate('AccountManagement')}
        />
        <SettingsRow
          title="Notifications"
          subtitle="Push notifications, email"
          onPress={() => openPlaceholder('Notifications')}
        />
        <SettingsRow
          title="General"
          subtitle="Location, dining data, app preferences"
          onPress={() => navigation.navigate('GeneralSettings')}
        />

        <View style={styles.sectionBreak} />
        <SettingsRow title="Help" onPress={() => openPlaceholder('Help')} />
        <SettingsRow title="Feedback" onPress={() => openPlaceholder('Feedback')} />
        <SettingsRow title="Follow Us" onPress={() => openPlaceholder('Follow Us')} />
        <SettingsRow title="Rate Us" onPress={() => openPlaceholder('Rate Us')} />

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { flexGrow: 1, paddingBottom: SPACING.xxl },
  sectionBreak: { height: 10, marginTop: SPACING.lg, backgroundColor: COLORS.goldLight },
});
