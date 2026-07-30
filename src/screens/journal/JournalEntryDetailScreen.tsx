import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useFocusEffect, useIsFocused } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  Gesture,
  GestureDetector,
  GestureHandlerRootView,
} from 'react-native-gesture-handler';
import {
  ActivityIndicator,
  Animated,
  Image,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SettingsScreenHeader } from '../../components/settings/SettingsScreenHeader';
import { formatVisitDateLong } from '../../data/journalDate';
import {
  resolveJournalPhotoDisplayUri,
  resolveJournalPhotoThumbnailUri,
} from '../../media/journalPhotoStorage';
import { useActivity } from '../../hooks/useActivity';
import { useJournal } from '../../hooks/useJournal';
import { useJournalComposer } from '../../hooks/useJournalComposer';
import type { JournalStackParamList } from '../../navigation/journalTypes';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

type Props = NativeStackScreenProps<JournalStackParamList, 'JournalEntryDetail'>;

export function JournalEntryDetailScreen({ navigation, route }: Props) {
  const { personalActivity } = useActivity();
  const { entries, loading, photos, reloadJournal } = useJournal();
  const openJournalComposer = useJournalComposer();
  const isFocused = useIsFocused();
  const insets = useSafeAreaInsets();
  const [selectedPhotoIndex, setSelectedPhotoIndex] = useState<number | null>(null);
  const photoScale = useRef(new Animated.Value(1)).current;
  const photoTranslateX = useRef(new Animated.Value(0)).current;
  const photoTranslateY = useRef(new Animated.Value(0)).current;
  const currentScaleRef = useRef(1);
  const pinchStartScaleRef = useRef(1);
  const panStartRef = useRef({ x: 0, y: 0 });
  const currentTranslationRef = useRef({ x: 0, y: 0 });
  const entry = entries.find((candidate) => candidate.id === route.params.entryId);
  const entryPhotos = useMemo(
    () =>
      photos
        .filter((photo) => photo.entryId === route.params.entryId)
        .sort((left, right) => left.position - right.position),
    [photos, route.params.entryId]
  );
  const viewerPhotos = useMemo(
    () =>
      entryPhotos.flatMap((photo) => {
        const thumbnailUri = resolveJournalPhotoThumbnailUri(photo);
        const displayUri = resolveJournalPhotoDisplayUri(photo);
        return thumbnailUri && displayUri
          ? [{ id: photo.id, thumbnailUri, displayUri }]
          : [];
      }),
    [entryPhotos]
  );
  const selectedPhoto =
    selectedPhotoIndex === null ? null : viewerPhotos[selectedPhotoIndex] ?? null;
  const rating = entry
    ? personalActivity.gotItHistory.find(
        (event) => event.clientId === entry.clientId
      )?.rating ?? null
    : null;

  useFocusEffect(
    useCallback(() => {
      reloadJournal().catch(() => {});
    }, [reloadJournal])
  );

  // The entry this screen was showing can disappear out from under it --
  // most commonly, deleting it from the composer's edit mode and then
  // dismissing back to here. Rather than leaving a dead-end "no longer
  // available" screen the user has to manually back out of, navigate away
  // as soon as that's confirmed. Gated on isFocused (reactively, via
  // useIsFocused -- not just checked once) rather than firing the moment
  // entries updates: the delete already reloads entries before the
  // composer dismisses, while this screen is still mounted but hidden
  // underneath it, so an unguarded goBack() here would race the
  // composer's own goBack() and could pop one screen too many.
  useEffect(() => {
    if (isFocused && !loading && !entry) {
      navigation.goBack();
    }
  }, [entry, isFocused, loading, navigation]);

  const resetPhotoTransform = useCallback(() => {
    currentScaleRef.current = 1;
    currentTranslationRef.current = { x: 0, y: 0 };
    photoScale.setValue(1);
    photoTranslateX.setValue(0);
    photoTranslateY.setValue(0);
  }, [photoScale, photoTranslateX, photoTranslateY]);

  useEffect(() => {
    resetPhotoTransform();
  }, [resetPhotoTransform, selectedPhotoIndex]);

  const pinchGesture = useMemo(
    () =>
      Gesture.Pinch()
        .onStart(() => {
          pinchStartScaleRef.current = currentScaleRef.current;
        })
        .onUpdate((event) => {
          const nextScale = Math.min(
            4,
            Math.max(1, pinchStartScaleRef.current * event.scale)
          );
          currentScaleRef.current = nextScale;
          photoScale.setValue(nextScale);
        })
        .onEnd(() => {
          if (currentScaleRef.current > 1.01) return;
          currentScaleRef.current = 1;
          currentTranslationRef.current = { x: 0, y: 0 };
          photoScale.setValue(1);
          photoTranslateX.setValue(0);
          photoTranslateY.setValue(0);
        }),
    [photoScale, photoTranslateX, photoTranslateY]
  );
  const panGesture = useMemo(
    () =>
      Gesture.Pan()
        .onStart(() => {
          panStartRef.current = currentTranslationRef.current;
        })
        .onUpdate((event) => {
          if (currentScaleRef.current <= 1) return;
          const next = {
            x: panStartRef.current.x + event.translationX,
            y: panStartRef.current.y + event.translationY,
          };
          currentTranslationRef.current = next;
          photoTranslateX.setValue(next.x);
          photoTranslateY.setValue(next.y);
        }),
    [photoTranslateX, photoTranslateY]
  );
  const photoGesture = useMemo(
    () => Gesture.Simultaneous(pinchGesture, panGesture),
    [panGesture, pinchGesture]
  );
  const closePhoto = () => setSelectedPhotoIndex(null);
  const showRelativePhoto = (offset: number) => {
    setSelectedPhotoIndex((current) => {
      if (current === null || viewerPhotos.length === 0) return current;
      return (current + offset + viewerPhotos.length) % viewerPhotos.length;
    });
  };

  if (loading && !entry) {
    return (
      <SafeAreaView style={[styles.container, styles.centered]}>
        <ActivityIndicator color={COLORS.pine} />
      </SafeAreaView>
    );
  }

  if (!entry) {
    return (
      <SafeAreaView style={styles.container} edges={['top']}>
        <SettingsScreenHeader title="Journal entry" onBack={() => navigation.goBack()} />
        <View style={styles.centered}>
          <Text style={styles.emptyTitle}>This entry is no longer available.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const title = entry.itemNameSnapshot ?? entry.restaurantNameSnapshot;
  const context = [entry.mealPeriodSnapshot, formatVisitDateLong(entry.visitedOn)]
    .filter(Boolean)
    .join(' · ');

  return (
    <SafeAreaView style={styles.container} edges={['top']}>
      <SettingsScreenHeader title={title} onBack={() => navigation.goBack()} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.summaryCard}>
          {!!entry.itemNameSnapshot && (
            <Text style={styles.restaurantName}>{entry.restaurantNameSnapshot}</Text>
          )}
          <Text style={styles.context}>{context}</Text>
          {rating !== null && (
            <Text style={styles.rating} accessibilityLabel={`${rating} out of 5 stars`}>
              ★ {rating}/5
            </Text>
          )}
        </View>

        <View style={styles.section}>
          <Text style={styles.sectionTitle}>Notes</Text>
          <Text style={entry.note ? styles.note : styles.emptyText}>
            {entry.note ?? 'No notes were added to this entry.'}
          </Text>
        </View>

        <View style={styles.section}>
          <View style={styles.sectionHeading}>
            <Text style={styles.sectionTitle}>Photos</Text>
            <Text style={styles.photoCount}>
              {viewerPhotos.length} {viewerPhotos.length === 1 ? 'photo' : 'photos'}
            </Text>
          </View>
          {viewerPhotos.length > 0 ? (
            <View style={styles.photoGrid}>
              {viewerPhotos.map((photo, index) => (
                <Pressable
                  key={photo.id}
                  style={styles.photoButton}
                  onPress={() => setSelectedPhotoIndex(index)}
                  accessibilityRole="button"
                  accessibilityLabel={`View Journal photo ${index + 1} of ${viewerPhotos.length}`}
                >
                  <Image source={{ uri: photo.thumbnailUri }} style={styles.photo} />
                </Pressable>
              ))}
            </View>
          ) : (
            <Text style={styles.emptyText}>No photos were added to this entry.</Text>
          )}
        </View>

        <Pressable
          style={styles.editButton}
          onPress={() => openJournalComposer({ entryId: entry.id })}
          accessibilityRole="button"
          accessibilityLabel="Edit Journal entry"
        >
          <Text style={styles.editLabel}>Edit entry</Text>
        </Pressable>
      </ScrollView>

      <Modal
        visible={selectedPhoto !== null}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={closePhoto}
      >
        <GestureHandlerRootView style={styles.photoViewer}>
          {selectedPhoto && <StatusBar barStyle="light-content" />}
          <View
            style={[
              styles.photoToolbar,
              {
                paddingTop:
                  Math.max(
                    insets.top,
                    Platform.OS === 'ios' ? 44 : StatusBar.currentHeight ?? 24
                  ) + SPACING.xs,
              },
            ]}
          >
            <Pressable
              style={styles.closePhotoButton}
              onPress={closePhoto}
              accessibilityRole="button"
              accessibilityLabel="Close photo"
            >
              <Text style={styles.closePhotoLabel}>Close</Text>
            </Pressable>
            <Text style={styles.photoPosition}>
              {selectedPhotoIndex === null ? '' : `${selectedPhotoIndex + 1} of ${viewerPhotos.length}`}
            </Text>
            <Pressable
              style={styles.resetPhotoButton}
              onPress={resetPhotoTransform}
              accessibilityRole="button"
              accessibilityLabel="Reset photo zoom"
            >
              <Text style={styles.resetPhotoLabel}>Reset</Text>
            </Pressable>
          </View>

          <View style={styles.photoStage}>
            {selectedPhoto && (
              <GestureDetector gesture={photoGesture}>
                <Animated.View
                  style={[
                    styles.fullPhotoFrame,
                    {
                      transform: [
                        { translateX: photoTranslateX },
                        { translateY: photoTranslateY },
                        { scale: photoScale },
                      ],
                    },
                  ]}
                >
                  <Image
                    source={{ uri: selectedPhoto.displayUri }}
                    style={styles.fullPhoto}
                    resizeMode="contain"
                  />
                </Animated.View>
              </GestureDetector>
            )}
            {viewerPhotos.length > 1 && (
              <>
                <Pressable
                  style={[styles.photoArrow, styles.previousPhoto]}
                  onPress={() => showRelativePhoto(-1)}
                  accessibilityRole="button"
                  accessibilityLabel="Previous photo"
                >
                  <Text style={styles.photoArrowLabel}>‹</Text>
                </Pressable>
                <Pressable
                  style={[styles.photoArrow, styles.nextPhoto]}
                  onPress={() => showRelativePhoto(1)}
                  accessibilityRole="button"
                  accessibilityLabel="Next photo"
                >
                  <Text style={styles.photoArrowLabel}>›</Text>
                </Pressable>
              </>
            )}
          </View>
          <Text style={[styles.zoomHint, { paddingBottom: Math.max(insets.bottom, SPACING.md) }]}>
            Pinch to zoom · Drag to move
          </Text>
        </GestureHandlerRootView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: COLORS.cream },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  content: { paddingHorizontal: SPACING.lg, paddingBottom: SPACING.xxl, gap: SPACING.lg },
  summaryCard: {
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    gap: SPACING.sm,
  },
  restaurantName: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 18,
    color: COLORS.ink,
  },
  context: { ...text.bodyMuted, lineHeight: 19 },
  rating: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 14,
    color: COLORS.gold,
  },
  section: {
    padding: SPACING.lg,
    borderWidth: 1,
    borderColor: COLORS.border,
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
    gap: SPACING.md,
  },
  sectionHeading: {
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'space-between',
    gap: SPACING.md,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 19,
    color: COLORS.ink,
  },
  note: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 16,
    lineHeight: 24,
    color: COLORS.ink,
  },
  emptyText: { ...text.bodyMuted, fontStyle: 'italic' },
  emptyTitle: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 20,
    color: COLORS.ink,
  },
  photoCount: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: COLORS.muted,
  },
  photoGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: SPACING.sm },
  photoButton: {
    width: '48%',
    aspectRatio: 1,
    overflow: 'hidden',
    borderRadius: RADII.sm,
    backgroundColor: COLORS.cream,
  },
  photo: { width: '100%', height: '100%' },
  editButton: {
    minHeight: 50,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: RADII.sm,
    backgroundColor: COLORS.pine,
  },
  editLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 14,
    color: COLORS.ink,
  },
  photoViewer: { flex: 1, backgroundColor: 'rgba(12, 20, 19, 0.98)' },
  photoToolbar: {
    minHeight: 94,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
  },
  closePhotoButton: {
    minWidth: 72,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closePhotoLabel: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 15,
    color: COLORS.surface,
  },
  photoPosition: {
    flex: 1,
    textAlign: 'center',
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 14,
    color: COLORS.surface,
  },
  resetPhotoButton: {
    minWidth: 72,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resetPhotoLabel: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 14,
    color: COLORS.surface,
  },
  photoStage: { flex: 1, overflow: 'hidden', justifyContent: 'center' },
  fullPhotoFrame: { flex: 1, width: '100%' },
  fullPhoto: { flex: 1, width: '100%' },
  photoArrow: {
    position: 'absolute',
    top: '44%',
    width: 52,
    height: 72,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 26,
    backgroundColor: 'rgba(12, 20, 19, 0.58)',
  },
  previousPhoto: { left: SPACING.sm },
  nextPhoto: { right: SPACING.sm },
  photoArrowLabel: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 48,
    lineHeight: 50,
    color: COLORS.surface,
  },
  zoomHint: {
    paddingTop: SPACING.sm,
    textAlign: 'center',
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12,
    color: COLORS.surface,
  },
});
