import { Image, StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';
import { ILLUSTRATION_ASSETS } from '../../illustrations/assets';
import { ILLUSTRATION_SPECS, type IllustrationTagId } from '../../illustrations/catalog';
import { DAYLIGHT, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY } from '../../theme/typography';

export function IllustrationSlot({
  tagId,
  style,
  showTag = true,
  variant = 'labeled',
}: {
  tagId: IllustrationTagId;
  style?: StyleProp<ViewStyle>;
  showTag?: boolean;
  variant?: 'labeled' | 'artwork';
}) {
  const spec = ILLUSTRATION_SPECS[tagId];
  const source = ILLUSTRATION_ASSETS[tagId];

  return (
    <View
      style={[styles.slot, { backgroundColor: spec.backgroundColor }, style]}
      accessibilityRole="image"
      accessibilityLabel={source ? spec.label : `Illustration placeholder: ${spec.label}, tag ${tagId}`}
    >
      {source ? (
        <Image source={source} style={StyleSheet.absoluteFill} resizeMode="cover" />
      ) : variant === 'artwork' ? (
        <>
          <View style={[styles.artworkSun, { backgroundColor: spec.accentColor }]} />
          <View style={[styles.artworkTrail, { backgroundColor: spec.accentColor }]} />
          <View style={[styles.artworkTile, { borderColor: spec.accentColor }]}>
            <View style={[styles.artworkTileDot, { backgroundColor: spec.accentColor }]} />
          </View>
          {showTag && (
            <View style={styles.artworkTagPill}>
              <Text style={[styles.artworkTag, { color: spec.accentColor }]} numberOfLines={1} ellipsizeMode="middle">
                {tagId}
              </Text>
            </View>
          )}
        </>
      ) : (
        <>
          <View style={[styles.cornerCircle, { backgroundColor: spec.accentColor }]} />
          <View style={[styles.diagonalRule, { backgroundColor: spec.accentColor }]} />
          <View style={styles.copy}>
            <Text style={[styles.pending, { color: spec.accentColor }]}>ILLUSTRATION</Text>
            <Text style={[styles.label, { color: DAYLIGHT.ink }]} numberOfLines={2}>
              {spec.label}
            </Text>
            {showTag && (
              <Text style={[styles.tag, { color: spec.accentColor }]} numberOfLines={2} ellipsizeMode="middle">
                {tagId}
              </Text>
            )}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  slot: {
    position: 'relative',
    overflow: 'hidden',
    minHeight: 96,
    borderRadius: RADII.lg,
  },
  cornerCircle: {
    position: 'absolute',
    width: 74,
    height: 74,
    borderRadius: 37,
    right: -24,
    top: -24,
    opacity: 0.16,
  },
  diagonalRule: {
    position: 'absolute',
    width: 92,
    height: 10,
    right: -24,
    bottom: 16,
    borderRadius: 5,
    opacity: 0.24,
    transform: [{ rotate: '-28deg' }],
  },
  copy: {
    flex: 1,
    justifyContent: 'center',
    padding: SPACING.md,
    paddingRight: SPACING.xl,
  },
  pending: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 9,
    letterSpacing: 0.7,
  },
  label: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 17,
    marginTop: 2,
  },
  tag: {
    fontFamily: FONT_FAMILY.workSansMedium,
    fontSize: 8,
    lineHeight: 10,
    marginTop: SPACING.xs,
  },
  artworkSun: {
    position: 'absolute',
    width: 76,
    height: 76,
    borderRadius: 38,
    right: -8,
    top: -12,
    opacity: 0.28,
  },
  artworkTrail: {
    position: 'absolute',
    width: 132,
    height: 16,
    right: -28,
    bottom: 28,
    borderRadius: 8,
    opacity: 0.34,
    transform: [{ rotate: '-28deg' }],
  },
  artworkTile: {
    position: 'absolute',
    width: 66,
    height: 82,
    left: 18,
    top: 26,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 5,
    borderRadius: 20,
    backgroundColor: 'rgba(255, 253, 248, 0.76)',
    transform: [{ rotate: '-7deg' }],
  },
  artworkTileDot: {
    width: 22,
    height: 22,
    borderRadius: 11,
    opacity: 0.72,
  },
  artworkTagPill: {
    position: 'absolute',
    left: SPACING.sm,
    right: SPACING.sm,
    bottom: SPACING.sm,
    minHeight: 20,
    justifyContent: 'center',
    borderRadius: 10,
    paddingHorizontal: SPACING.sm,
    backgroundColor: 'rgba(255, 253, 248, 0.88)',
  },
  artworkTag: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 7.5,
    textAlign: 'center',
  },
});
