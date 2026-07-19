import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FindHomeScreen } from '../screens/FindHomeScreen';
import { ParkListScreen } from '../screens/ParkListScreen';
import { RestaurantListScreen } from '../screens/RestaurantListScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';

export type FindStackParamList = {
  FindHome: undefined;
  LocationList: undefined;
  RestaurantList: { groupKey: string; groupLabel: string };
  // Route added now so Milestone 3 doesn't need another nav restructure —
  // not navigated to yet (RestaurantCard.onPress is still a no-op stub).
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
    </Stack.Navigator>
  );
}
