import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { FindHomeScreen } from '../screens/FindHomeScreen';
import { RestaurantDetailScreen } from '../screens/RestaurantDetailScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';
import type { FindRestoreState } from '../search/findState';
import type { RestaurantDetailRouteParams } from './browseTypes';

export type FindStackParamList = {
  // resetToken: set by RootNavigator's Find tab listener when the Find
  // tab is pressed while it's already the active tab -- FindHomeScreen
  // watches for it changing and resets to its pristine home state
  // (cleared search, closed filters, scrolled to top).
  FindHome: { state?: FindRestoreState; resetToken?: number } | undefined;
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
