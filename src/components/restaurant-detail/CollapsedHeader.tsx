import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HoursStatus } from '../../data/hoursStatus';
import { COLORS, DAYLIGHT, SPACING } from '../../theme/tokens';
import { text } from '../../theme/typography';

// This is Rumbly's persistent restaurant-detail nav bar — Back and
// overflow are ALWAYS rendered (a restaurant with a short menu may never
// scroll far enough to "collapse," so back navigation can't live only in
// a scroll-gated layer). Only the center name/status content fades in via
// `titleOpacity` as the expanded header collapses, per the spec's
// distinction between the always-present nav bar and the
// scroll-dependent collapsed summary content.
export function CollapsedHeader({
  restaurantName,
  hoursStatus,
  titleOpacity,
  onBack,
}: {
  restaurantName: string;
  hoursStatus: HoursStatus;
  titleOpacity: Animated.AnimatedInterpolation<number> | number;
  onBack: () => void;
}) {
  return (
    <SafeAreaView edges={['top']} style={styles.safeArea}>
      <Animated.View style={styles.container}>
        <Pressable onPress={onBack} hitSlop={8} style={styles.backButton}>
          <Text style={[text.buttonLabel, styles.backLabel]}>‹ Back</Text>
        </Pressable>
        <Animated.View style={[styles.titleBlock, { opacity: titleOpacity }]}>
          <Text style={[text.restaurantName, styles.name]} numberOfLines={1}>
            {restaurantName}
          </Text>
          {hoursStatus.kind !== 'none' && (
            <Text style={[styles.status, hoursStatus.kind === 'open' ? styles.statusOpen : styles.statusClosed]}>
              {hoursStatus.kind === 'open' ? 'Open' : 'Closed'}
            </Text>
          )}
        </Animated.View>
        {/* No overflow menu -- there's nothing behind it to open. Kept as
            an empty same-width spacer (not the backButton's mirror) so
            titleBlock's centered text still centers on the real screen
            middle, not the backButton-only remaining width. */}
        <View style={styles.overflowSpacer} />
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // Same tint as ExpandedHeader's infoCard, and no seam between them --
  // the tinted "restaurant info" surface now runs continuously from the
  // very top of the device (behind the status bar, via this SafeAreaView)
  // down through the nav bar and the info card below it.
  safeArea: {
    backgroundColor: DAYLIGHT.sky,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    height: 52,
  },
  backButton: {
    width: 76,
    paddingRight: SPACING.sm,
  },
  backLabel: {
    color: DAYLIGHT.ocean,
  },
  titleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    justifyContent: 'center',
    gap: SPACING.sm,
  },
  name: {
    flexShrink: 1,
    textAlign: 'center',
    color: COLORS.ink,
    fontSize: 16,
  },
  status: {
    fontSize: 12,
  },
  statusOpen: { color: DAYLIGHT.open },
  statusClosed: { color: COLORS.muted },
  overflowSpacer: {
    width: 76,
  },
});
