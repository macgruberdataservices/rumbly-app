import { useMemo } from 'react';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChangesStackParamList } from '../navigation/changesTypes';
import { categoryBreakdown } from '../data/changes';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<ChangesStackParamList, 'ChangesRestaurant'>;

// Level 1 of the ported See Changes feature: one restaurant's category
// breakdown (Menu Changes / Price Changes), each tappable into Level 2
// scoped to that restaurant + category.
export function ChangesRestaurantScreen({ navigation, route }: Props) {
  const { restaurantName, events, groupMode } = route.params;
  const categories = useMemo(() => categoryBreakdown(events), [events]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <Text style={text.buttonLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{restaurantName}</Text>
        <Text style={text.bodyMuted}>Changes in this range</Text>
      </View>

      <View style={styles.list}>
        {categories.map((c) => (
          <Pressable
            key={c.key}
            style={styles.row}
            onPress={() =>
              navigation.navigate('ChangesCategory', {
                catKey: c.key,
                catLabel: c.label,
                events: c.events,
                backLabel: restaurantName,
                scopeRestaurant: true,
                groupMode,
              })
            }
          >
            <Text style={styles.icon}>{c.icon}</Text>
            <View style={styles.rowLeft}>
              <Text style={text.restaurantName}>{c.label}</Text>
              <Text style={text.bodyMuted}>
                {c.events.length} change{c.events.length === 1 ? '' : 's'}
              </Text>
            </View>
            <Text style={styles.chevron}>›</Text>
          </Pressable>
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  header: {
    paddingHorizontal: SPACING.lg,
    paddingTop: SPACING.sm,
    paddingBottom: SPACING.md,
    backgroundColor: COLORS.surface,
  },
  backButton: {
    alignSelf: 'flex-start',
    marginBottom: SPACING.sm,
  },
  title: {
    fontFamily: text.sectionTitle.fontFamily,
    fontSize: 24,
    color: COLORS.ink,
  },
  list: {
    paddingTop: SPACING.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: SPACING.md,
    paddingHorizontal: SPACING.lg,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    gap: SPACING.md,
  },
  icon: {
    fontSize: 22,
  },
  rowLeft: {
    flex: 1,
    minWidth: 0,
  },
  chevron: {
    fontSize: 22,
    color: COLORS.dim,
  },
});
