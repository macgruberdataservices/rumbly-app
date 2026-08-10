import { Image, StyleSheet, Text, View } from 'react-native';
import type { JournalEntry, JournalPhoto } from '../../data/journal';
import { resolveJournalPhotoThumbnailUri } from '../../media/journalPhotoStorage';
import { COLORS, DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

function formatVisitDate(value: string): string {
  const [year, month, day] = value.split('-').map(Number);
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
}

export function JournalEntryCard({
  entry,
  rating,
  showTarget = true,
  photos = [],
}: {
  entry: JournalEntry;
  rating: number | null;
  showTarget?: boolean;
  photos?: JournalPhoto[];
}) {
  const target = entry.itemNameSnapshot ?? entry.restaurantNameSnapshot;
  const context = [entry.mealPeriodSnapshot, formatVisitDate(entry.visitedOn)]
    .filter(Boolean)
    .join(' · ');
  const firstPhoto = photos[0];

  return (
    <View style={styles.card}>
      {firstPhoto ? (
        <View style={styles.coverFrame}>
          <Image
            source={{ uri: resolveJournalPhotoThumbnailUri(firstPhoto) }}
            style={styles.coverPhoto}
          />
          <View style={styles.photoCountPill}>
            <Text style={styles.photoCountLabel}>{photos.length} {photos.length === 1 ? 'PHOTO' : 'PHOTOS'}</Text>
          </View>
        </View>
      ) : (
        <View style={styles.noPhotoHeader}>
          <View style={styles.noPhotoSun} />
          <View style={styles.noPhotoCard}>
            <Text style={styles.noPhotoInitial}>{target.slice(0, 1).toLocaleUpperCase()}</Text>
          </View>
          <Text style={styles.noPhotoLabel}>MEMORY</Text>
        </View>
      )}
      <View style={styles.cardBody}>
        {showTarget && <Text style={text.restaurantName}>{target}</Text>}
        <View style={styles.metaRow}>
          <Text style={styles.meta}>{context}</Text>
          {rating !== null && (
            <View style={styles.ratingPill}>
              <Text style={styles.rating} accessibilityLabel={`${rating} out of 5`}>
                ★ {rating}/5
              </Text>
            </View>
          )}
        </View>
        {!!entry.note && <Text style={styles.note} numberOfLines={4}>{entry.note}</Text>}
        {entry.syncState === 'failed' && (
          <Text style={styles.syncError}>Saved here · Sync needs attention</Text>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    overflow: 'hidden',
    backgroundColor: COLORS.surface,
    borderWidth: 1,
    borderColor: DAYLIGHT.border,
    borderRadius: RADII.xl,
    shadowColor: DAYLIGHT.ink,
    shadowOpacity: 0.08,
    shadowRadius: 13,
    shadowOffset: { width: 0, height: 5 },
  },
  coverFrame: {
    height: 164,
    overflow: 'hidden',
    backgroundColor: DAYLIGHT.sky,
  },
  coverPhoto: { width: '100%', height: '100%' },
  photoCountPill: {
    position: 'absolute',
    right: SPACING.sm,
    bottom: SPACING.sm,
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    borderRadius: 13,
    backgroundColor: 'rgba(255,253,248,0.9)',
  },
  photoCountLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 8.5,
    color: DAYLIGHT.ocean,
  },
  noPhotoHeader: {
    height: 90,
    overflow: 'hidden',
    justifyContent: 'center',
    paddingHorizontal: SPACING.lg,
    backgroundColor: '#FFF0BD',
  },
  noPhotoSun: {
    position: 'absolute',
    width: 84,
    height: 84,
    right: -20,
    top: -30,
    borderRadius: 42,
    backgroundColor: DAYLIGHT.coral,
    opacity: 0.24,
  },
  noPhotoCard: {
    width: 48,
    height: 58,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 15,
    backgroundColor: DAYLIGHT.paper,
    transform: [{ rotate: '-5deg' }],
  },
  noPhotoInitial: {
    fontFamily: FONT_FAMILY.piazzollaExtraBold,
    fontSize: 22,
    color: DAYLIGHT.ocean,
  },
  noPhotoLabel: {
    position: 'absolute',
    right: SPACING.lg,
    bottom: SPACING.md,
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9,
    letterSpacing: 1.1,
    color: DAYLIGHT.amberInk,
  },
  cardBody: {
    padding: SPACING.lg,
    gap: SPACING.sm,
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  meta: {
    flex: 1,
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    color: COLORS.muted,
  },
  ratingPill: {
    minHeight: 26,
    justifyContent: 'center',
    paddingHorizontal: SPACING.sm,
    borderRadius: 13,
    backgroundColor: '#FFF0BD',
  },
  rating: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: DAYLIGHT.amberInk,
  },
  note: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 15,
    lineHeight: 21,
    color: COLORS.ink,
  },
  syncError: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 11,
    color: DAYLIGHT.coral,
  },
});
