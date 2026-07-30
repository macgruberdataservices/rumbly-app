import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { countLocalPendingJournalPhotos } from '../../data/journalStore';
import { useAuth } from '../../hooks/useAuth';
import {
  clearDownloadedJournalPhotoCache,
  getJournalFileStorageReport,
} from '../../media/journalPhotoStorage';
import { formatStorageBytes } from '../../media/journalPhotoSizing';
import type { JournalStackParamList } from '../../navigation/journalTypes';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

type Props = NativeStackScreenProps<JournalStackParamList, 'JournalStorageSettings'>;

export function JournalStorageSettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pendingBytes, setPendingBytes] = useState(0);
  const [cacheBytes, setCacheBytes] = useState(0);
  const [pendingPhotoCount, setPendingPhotoCount] = useState(0);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const files = getJournalFileStorageReport();
    const count = await countLocalPendingJournalPhotos(user.id);
    setPendingBytes(files.pendingBytes);
    setCacheBytes(files.downloadedCacheBytes);
    setPendingPhotoCount(count);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      reload().catch(() => setLoading(false));
    }, [reload])
  );

  const clearCache = () => {
    Alert.alert(
      'Clear downloaded Journal photos?',
      'Pending photos and originals in your photo library will not be removed.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Clear Downloads',
          style: 'destructive',
          onPress: () => {
            clearDownloadedJournalPhotoCache();
            reload().catch(() => {});
          },
        },
      ]
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable
          style={styles.closeButton}
          onPress={() => navigation.goBack()}
          accessibilityRole="button"
          accessibilityLabel="Back"
        >
          <Text style={styles.closeLabel}>Back</Text>
        </Pressable>
        <Text style={styles.title}>Journal storage</Text>
        <View style={styles.closeButton} />
      </View>
      <View style={styles.content}>
        <Text style={text.bodyMuted}>
          Rumbly stores optimized copies for your private Journal. Camera originals saved
          to Photos are always left alone.
        </Text>
        {loading ? (
          <ActivityIndicator color={COLORS.pine} />
        ) : (
          <>
            <StorageRow
              title="Pending Journal photos"
              value={formatStorageBytes(pendingBytes)}
              detail={`${pendingPhotoCount} ${pendingPhotoCount === 1 ? 'photo' : 'photos'} waiting for private sync`}
            />
            <StorageRow
              title="Downloaded photo cache"
              value={formatStorageBytes(cacheBytes)}
              detail="Safe to clear; photos can be downloaded again after sync."
            />
            <Pressable
              style={[styles.clearButton, cacheBytes === 0 && styles.disabled]}
              disabled={cacheBytes === 0}
              onPress={clearCache}
              accessibilityRole="button"
              accessibilityLabel="Clear downloaded Journal photos"
              accessibilityState={{ disabled: cacheBytes === 0 }}
            >
              <Text style={styles.clearLabel}>Clear Downloaded Journal Photos</Text>
            </Pressable>
          </>
        )}
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Storage protection</Text>
          <Text style={styles.noteBody}>
            Each entry is limited to six photos. Full-resolution library originals are not
            copied into Rumbly, and downloaded photos use a bounded cache.
          </Text>
        </View>
      </View>
    </SafeAreaView>
  );
}

function StorageRow({
  title,
  value,
  detail,
}: {
  title: string;
  value: string;
  detail: string;
}) {
  return (
    <View style={styles.row}>
      <View style={styles.rowCopy}>
        <Text style={styles.rowTitle}>{title}</Text>
        <Text style={styles.rowDetail}>{detail}</Text>
      </View>
      <Text style={styles.rowValue}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  header: {
    minHeight: 62,
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: COLORS.border,
    backgroundColor: COLORS.surface,
    paddingHorizontal: SPACING.md,
  },
  closeButton: { width: 64, minHeight: 44, justifyContent: 'center' },
  closeLabel: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 14, color: COLORS.forest },
  title: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 19,
    color: COLORS.ink,
  },
  content: { padding: SPACING.lg, gap: SPACING.lg },
  row: {
    flexDirection: 'row',
    gap: SPACING.md,
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
  },
  rowCopy: { flex: 1, gap: 4 },
  rowTitle: { fontFamily: FONT_FAMILY.workSansBold, fontSize: 15, color: COLORS.ink },
  rowDetail: { ...text.bodyMuted, lineHeight: 18 },
  rowValue: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 14, color: COLORS.ink },
  clearButton: {
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.sm,
    backgroundColor: COLORS.pine,
    paddingHorizontal: SPACING.lg,
  },
  clearLabel: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 13, color: COLORS.ink },
  disabled: { opacity: 0.45 },
  noteCard: { padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.pineLight, gap: 6 },
  noteTitle: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 13, color: COLORS.ink },
  noteBody: { ...text.bodyMuted, lineHeight: 19 },
});
