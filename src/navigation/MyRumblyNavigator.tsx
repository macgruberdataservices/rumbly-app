import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MyRumblyHomeScreen } from '../screens/MyRumblyHomeScreen';
import { RestaurantDetailScreen } from '../screens/RestaurantDetailScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';
import type { RestaurantDetailRouteParams } from './browseTypes';

// One-screen stack for now (see roadmap: real Need It, Got It, Love It,
// ratings, history, and settings content lands later). Nested now so those
// phases don't need another navigation restructure.
export type MyRumblyStackParamList = {
  MyRumblyHome: undefined;
  RestaurantDetail: RestaurantDetailRouteParams;
};

const Stack = createNativeStackNavigator<MyRumblyStackParamList>();

export function MyRumblyNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.forest },
        headerTintColor: COLORS.goldLight,
        headerTitleStyle: { fontFamily: FONT_FAMILY.frauncesSemiBold },
        contentStyle: { backgroundColor: COLORS.surface },
      }}
    >
      <Stack.Screen
        name="MyRumblyHome"
        component={MyRumblyHomeScreen}
        options={{ headerShown: false, title: 'My Rumbly' }}
      />
      <Stack.Screen name="RestaurantDetail" component={RestaurantDetailScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
