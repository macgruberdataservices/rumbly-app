import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MyRumblyHomeScreen } from '../screens/MyRumblyHomeScreen';
import { MyActivityScreen } from '../screens/MyActivityScreen';
import { ChallengeDetailScreen } from '../screens/ChallengeDetailScreen';
import { ChallengeListScreen } from '../screens/ChallengeListScreen';
import { RestaurantDetailScreen } from '../screens/RestaurantDetailScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';
import type { RestaurantDetailRouteParams } from './browseTypes';

export type MyRumblyStackParamList = {
  MyRumblyHome: undefined;
  MyActivity: undefined;
  ChallengeList: undefined;
  ChallengeDetail: { challengeId: string };
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
      <Stack.Screen name="MyActivity" component={MyActivityScreen} options={{ headerShown: false }} />
      <Stack.Screen name="ChallengeList" component={ChallengeListScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ChallengeDetail"
        component={ChallengeDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen name="RestaurantDetail" component={RestaurantDetailScreen} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
