import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FindHomeScreen } from '../screens/FindHomeScreen';
import { ParkListScreen } from '../screens/ParkListScreen';
import { RestaurantListScreen } from '../screens/RestaurantListScreen';
import { RestaurantDetailScreen } from '../screens/RestaurantDetailScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';

export type FindStackParamList = {
  FindHome: undefined;
  LocationList: undefined;
  RestaurantList: { groupKey: string; groupLabel: string };
  // itemId/period/category are Milestone 5's "entry from search" —
  // consumed by RestaurantDetailScreen to scroll to and briefly highlight
  // the exact item; restaurantId alone still drives the plain
  // browse-through-Find-tab / Milestone 3 default-period path.
  RestaurantDetail: {
    restaurantId: string;
    itemId?: string;
    period?: string;
    category?: string;
  };
};

const Stack = createNativeStackNavigator<FindStackParamList>();

export function FindNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.forest },
        headerTintColor: COLORS.goldLight,
        headerTitleStyle: { fontFamily: FONT_FAMILY.frauncesSemiBold },
        headerBackTitle: '',
        contentStyle: { backgroundColor: COLORS.surface },
      }}
    >
      <Stack.Screen
        name="FindHome"
        component={FindHomeScreen}
        options={{ headerShown: false, title: 'Find' }}
      />
      <Stack.Screen name="LocationList" component={ParkListScreen} options={{ title: 'Browse by Location' }} />
      <Stack.Screen
        name="RestaurantList"
        component={RestaurantListScreen}
        options={({ route }) => ({ title: route.params.groupLabel })}
      />
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
