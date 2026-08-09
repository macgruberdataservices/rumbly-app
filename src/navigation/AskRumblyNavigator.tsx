import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AskRumblyScreen } from '../screens/AskRumblyScreen';
import { NativeMenuPilotScreen } from '../screens/NativeMenuPilotScreen';
import { RestaurantDetailScreen } from '../screens/RestaurantDetailScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';
import type { NativeMenuPilotRouteParams, RestaurantDetailRouteParams } from './browseTypes';

export type AskRumblyStackParamList = {
  AskRumblyHome: undefined;
  RestaurantDetail: RestaurantDetailRouteParams;
  NativeMenuPilot: NativeMenuPilotRouteParams;
};

const Stack = createNativeStackNavigator<AskRumblyStackParamList>();

export function AskRumblyNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.forest },
        headerTintColor: COLORS.goldLight,
        headerTitleStyle: { fontFamily: FONT_FAMILY.piazzollaBold },
        headerBackTitle: '',
        contentStyle: { backgroundColor: COLORS.surface },
      }}
    >
      <Stack.Screen
        name="AskRumblyHome"
        component={AskRumblyScreen}
        options={{ headerShown: false, title: 'Ask Rumbly' }}
      />
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen
        name="NativeMenuPilot"
        component={NativeMenuPilotScreen}
        options={{ headerShown: false }}
      />
    </Stack.Navigator>
  );
}
