import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SettingsScreenHeader } from '../components/settings/SettingsScreenHeader';
import type { MyRumblyStackParamList } from '../navigation/MyRumblyNavigator';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<MyRumblyStackParamList, 'AskRumbly'>;

export function AskRumblyScreen({ navigation }: Props) {
  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title="Ask Rumbly" onBack={() => navigation.goBack()} />
      <View style={styles.content}>
        <Text style={text.bodyMuted}>
          Isolated prototype for natural-language menu and restaurant queries. Nothing here is
          wired up yet.
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.surface },
  content: { padding: SPACING.lg },
});
