import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExploreHomeScreen } from '../screens/ExploreHomeScreen';
import { ParkListScreen } from '../screens/ParkListScreen';
import { RestaurantDetailScreen } from '../screens/RestaurantDetailScreen';
import { RestaurantListScreen } from '../screens/RestaurantListScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';
import type { BrowseStackParamList } from './browseTypes';

export type ExploreStackParamList = BrowseStackParamList & {
  ExploreHome: undefined;
};

const Stack = createNativeStackNavigator<ExploreStackParamList>();

export function ExploreNavigator() {
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
        name="ExploreHome"
        component={ExploreHomeScreen}
        options={{ headerShown: false, title: 'Explore' }}
      />
      <Stack.Screen name="LocationList" component={ParkListScreen} options={{ title: 'Explore by Location' }} />
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
