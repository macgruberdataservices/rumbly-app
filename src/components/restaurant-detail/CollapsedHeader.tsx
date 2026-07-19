import { Animated, Pressable, StyleSheet, Text } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { HoursStatus } from '../../data/hoursStatus';
import { COLORS, SPACING } from '../../theme/tokens';
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
          <Text style={styles.status}>{hoursStatus.kind === 'open' ? 'Open' : 'Closed'}</Text>
        </Animated.View>
        {/* No overflow menu items exist yet (Report Inaccurate etc. are
            later milestones) — visual placeholder only, nothing behind it. */}
        <Text style={styles.overflow}>•••</Text>
      </Animated.View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    backgroundColor: COLORS.forest,
  },
  container: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.md,
    height: 52,
  },
  backButton: {
    paddingRight: SPACING.sm,
  },
  backLabel: {
    color: COLORS.goldLight,
  },
  titleBlock: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'baseline',
    gap: SPACING.sm,
  },
  name: {
    color: COLORS.goldLight,
    fontSize: 16,
  },
  status: {
    color: COLORS.cream,
    fontSize: 12,
  },
  overflow: {
    color: COLORS.goldLight,
    fontSize: 16,
    paddingLeft: SPACING.sm,
  },
});
