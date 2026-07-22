import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import { COLORS } from '../theme/tokens';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'SettingsPlaceholder'>;

export function SettingsPlaceholderScreen({ navigation, route }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title={route.params.title} onBack={() => navigation.goBack()} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
});
