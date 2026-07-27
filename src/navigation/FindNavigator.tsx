import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FindHomeScreen } from '../screens/FindHomeScreen';
import { RestaurantDetailScreen } from '../screens/RestaurantDetailScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';
import type { FindRestoreState } from '../search/findState';
import type { RestaurantDetailRouteParams } from './browseTypes';

export type FindStackParamList = {
  FindHome: { state?: FindRestoreState } | undefined;
  RestaurantDetail: RestaurantDetailRouteParams;
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
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
