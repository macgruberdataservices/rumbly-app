import { useCallback, useState } from 'react';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { countLocalJournalPhotos } from '../../data/journalStore';
import { useAuth } from '../../hooks/useAuth';
import { getJournalPhotoStorageBytes } from '../../media/journalPhotoStorage';
import { formatStorageBytes } from '../../media/journalPhotoSizing';
import type { JournalStackParamList } from '../../navigation/journalTypes';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

type Props = NativeStackScreenProps<JournalStackParamList, 'JournalStorageSettings'>;

export function JournalStorageSettingsScreen({ navigation }: Props) {
  const { user } = useAuth();
  const [loading, setLoading] = useState(true);
  const [photoBytes, setPhotoBytes] = useState(0);
  const [photoCount, setPhotoCount] = useState(0);

  const reload = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    const count = await countLocalJournalPhotos(user.id);
    setPhotoBytes(getJournalPhotoStorageBytes());
    setPhotoCount(count);
    setLoading(false);
  }, [user]);

  useFocusEffect(
    useCallback(() => {
      reload().catch(() => setLoading(false));
    }, [reload])
  );

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
          Journal photos are stored only on this device -- they are never uploaded anywhere.
          Camera originals saved to Photos are always left alone.
        </Text>
        {loading ? (
          <ActivityIndicator color={COLORS.pine} />
        ) : (
          <StorageRow
            title="Journal photo storage"
            value={formatStorageBytes(photoBytes)}
            detail={`${photoCount} ${photoCount === 1 ? 'photo' : 'photos'} on this device`}
          />
        )}
        <View style={styles.noteCard}>
          <Text style={styles.noteTitle}>Storage protection</Text>
          <Text style={styles.noteBody}>
            Each entry is limited to six photos, and full-resolution library originals are
            not copied into Rumbly -- only optimized private copies are kept. Because
            photos live only on this device, they will not appear if you reinstall the app
            or switch devices unless your device's own backup (iCloud or your phone
            manufacturer's equivalent) restores them.
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
    fontFamily: FONT_FAMILY.piazzollaBold,
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
  noteCard: { padding: SPACING.lg, borderRadius: RADII.lg, backgroundColor: COLORS.pineLight, gap: 6 },
  noteTitle: { fontFamily: FONT_FAMILY.workSansExtraBold, fontSize: 13, color: COLORS.ink },
  noteBody: { ...text.bodyMuted, lineHeight: 19 },
});
