import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { RootStackParamList } from '../navigation/RootNavigator';
import { useDataProvider } from '../hooks/useDataProvider';
import { LoadingScreen } from '../components/LoadingScreen';
import { SyncStatusBar } from '../components/SyncStatusBar';
import { COLORS, RADII, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<RootStackParamList, 'Home'>;

export function HomeScreen({ navigation }: Props) {
  const { restaurants, isLoading, error, lastSyncedAt, lastImportStats, forceRefresh } = useDataProvider();

  if (isLoading && restaurants.length === 0) {
    return <LoadingScreen label="Fetching the latest dining data…" />;
  }

  if (error && restaurants.length === 0) {
    return (
      <SafeAreaView style={styles.container}>
        <Text style={[text.body, styles.errorText]}>Couldn't load dining data: {error}</Text>
        <Pressable onPress={forceRefresh} style={styles.retryButton}>
          <Text style={text.buttonLabel}>Try again</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.content}>
        <Text style={text.greeting}>Where can I find food?</Text>
        <Text style={[text.bodyMuted, styles.subtitle]}>
          {restaurants.length} restaurants ready offline
          {lastImportStats ? ` · ${lastImportStats.menuItemCount} menu items` : ''}
        </Text>
        <Pressable style={styles.browseButton} onPress={() => navigation.navigate('ParkList')}>
          <Text style={styles.browseButtonLabel}>Browse by Park</Text>
        </Pressable>
      </View>
      <SyncStatusBar lastSyncedAt={lastSyncedAt} isLoading={isLoading} onRefresh={forceRefresh} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
    justifyContent: 'space-between',
  },
  content: {
    flex: 1,
    padding: SPACING.xl,
    justifyContent: 'center',
  },
  subtitle: {
    marginTop: SPACING.sm,
    marginBottom: SPACING.xl,
  },
  browseButton: {
    backgroundColor: COLORS.forest,
    borderRadius: RADII.lg,
    paddingVertical: SPACING.md,
    alignItems: 'center',
  },
  browseButtonLabel: {
    fontFamily: text.buttonLabel.fontFamily,
    fontSize: 16,
    color: COLORS.goldLight,
  },
  errorText: {
    margin: SPACING.xl,
    textAlign: 'center',
  },
  retryButton: {
    alignSelf: 'center',
  },
});
