import { StyleSheet, Text, View } from 'react-native';
import type { RatingAverage } from '../data/ratingAverage';
import { DAYLIGHT, RADII, SPACING } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';

export function MenuItemRatingSummary({
  ratingAverage,
  variant = 'compact',
}: {
  ratingAverage: RatingAverage | undefined;
  variant?: 'compact' | 'feature';
}) {
  if (!ratingAverage || ratingAverage.count === 0) return null;

  const score = ratingAverage.average.toFixed(1);

  if (variant === 'compact') {
    return (
      <View
        style={styles.compact}
        accessible
        accessibilityLabel={`Your average rating is ${score} out of 5`}
      >
        <Text style={styles.compactStar}>★</Text>
        <Text style={styles.compactScore}>{score}</Text>
      </View>
    );
  }

  return (
    <View
      style={styles.feature}
      accessible
      accessibilityLabel={`Your average rating is ${score} out of 5 from ${ratingAverage.count} rated ${ratingAverage.count === 1 ? 'visit' : 'visits'}`}
    >
      <View style={styles.medallion}>
        <Text style={styles.medallionStar}>★</Text>
      </View>
      <View style={styles.featureCopy}>
        <Text style={styles.eyebrow}>YOUR TAKE</Text>
        <View style={styles.scoreRow}>
          <Text style={styles.featureScore}>{score}</Text>
          <Text style={styles.outOf}>/ 5</Text>
        </View>
        <Text style={styles.visitCount}>
          {ratingAverage.count} rated {ratingAverage.count === 1 ? 'visit' : 'visits'}
        </Text>
      </View>
      <View style={styles.starTrail} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {[1, 2, 3, 4, 5].map((value) => (
          <Text
            key={value}
            style={[styles.trailStar, value <= Math.round(ratingAverage.average) && styles.trailStarFilled]}
          >
            ★
          </Text>
        ))}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  compact: {
    minHeight: 23,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
    borderRadius: 12,
    paddingHorizontal: SPACING.sm,
    backgroundColor: '#FFF0BD',
  },
  compactStar: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 12,
    color: DAYLIGHT.coral,
  },
  compactScore: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 10.5,
    color: DAYLIGHT.amberInk,
  },
  feature: {
    minHeight: 92,
    flexDirection: 'row',
    alignItems: 'center',
    overflow: 'hidden',
    marginTop: SPACING.lg,
    borderRadius: RADII.lg,
    padding: SPACING.md,
    backgroundColor: '#FFF0BD',
  },
  medallion: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: DAYLIGHT.sun,
    transform: [{ rotate: '-7deg' }],
  },
  medallionStar: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 31,
    color: DAYLIGHT.coral,
  },
  featureCopy: {
    marginLeft: SPACING.md,
  },
  eyebrow: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 8.5,
    lineHeight: 11,
    letterSpacing: 1.05,
    color: DAYLIGHT.amberInk,
  },
  scoreRow: {
    flexDirection: 'row',
    alignItems: 'baseline',
  },
  featureScore: {
    fontFamily: FONT_FAMILY.piazzollaExtraBold,
    fontSize: 28,
    lineHeight: 31,
    color: DAYLIGHT.ink,
  },
  outOf: {
    marginLeft: 2,
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 11,
    color: DAYLIGHT.muted,
  },
  visitCount: {
    fontFamily: FONT_FAMILY.workSansMedium,
    fontSize: 9.5,
    color: DAYLIGHT.muted,
  },
  starTrail: {
    position: 'absolute',
    right: SPACING.md,
    top: SPACING.md,
    flexDirection: 'row',
    gap: 1,
  },
  trailStar: {
    fontSize: 9,
    color: 'rgba(121, 80, 0, 0.18)',
  },
  trailStarFilled: {
    color: DAYLIGHT.coral,
  },
});
