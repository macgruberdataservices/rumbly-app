import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import type { ChangesStackParamList } from '../navigation/changesTypes';
import { ChangeEventGroups } from '../components/changes/ChangeEventGroups';
import { COLORS, SPACING } from '../theme/tokens';
import { text } from '../theme/typography';

type Props = NativeStackScreenProps<ChangesStackParamList, 'ChangesCategory'>;

// Level 2 of the ported See Changes feature: one category's actual
// events, either scoped to a single restaurant (hides the redundant
// restaurant name on each row) or "all restaurants" for that category.
export function ChangesCategoryScreen({ navigation, route }: Props) {
  const { catLabel, events, scopeRestaurant, groupMode } = route.params;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
      <View style={styles.header}>
        <Pressable onPress={() => navigation.goBack()} hitSlop={8} style={styles.backButton}>
          <Text style={text.buttonLabel}>‹ Back</Text>
        </Pressable>
        <Text style={styles.title}>{catLabel}</Text>
        <Text style={text.bodyMuted}>
          {scopeRestaurant ? '' : 'All restaurants · '}
          {events.length} change{events.length === 1 ? '' : 's'} in this range
        </Text>
      </View>

      <ScrollView contentContainerStyle={styles.scrollContent}>
        <ChangeEventGroups
          events={events}
          groupMode={groupMode}
          hideRestaurant={scopeRestaurant}
          onPressEvent={(restaurantId) => navigation.navigate('RestaurantDetail', { restaurantId })}
        />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.surface,
  },
  scrollContent: {
    paddingBottom: SPACING.xl,
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
});
