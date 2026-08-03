import type { NavigatorScreenParams } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MyRumblyHomeScreen } from '../screens/MyRumblyHomeScreen';
import { MyActivityScreen } from '../screens/MyActivityScreen';
import { ChallengeDetailScreen } from '../screens/ChallengeDetailScreen';
import { ChallengeListScreen } from '../screens/ChallengeListScreen';
import { RestaurantDetailScreen } from '../screens/RestaurantDetailScreen';
import { NativeMenuPilotScreen } from '../screens/NativeMenuPilotScreen';
import { JournalNavigator } from './JournalNavigator';
import type { JournalStackParamList } from './journalTypes';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';
import type { NativeMenuPilotRouteParams, RestaurantDetailRouteParams } from './browseTypes';

export type MyRumblyStackParamList = {
  MyRumblyHome: undefined;
  MyActivity: undefined;
  NativeMenuPilot: NativeMenuPilotRouteParams;
  ChallengeList: undefined;
  ChallengeDetail: { challengeId: string };
  RestaurantDetail: RestaurantDetailRouteParams;
  // Journal moved off its own bottom tab and in here (2026-08-02) --
  // nested params so a card on MyRumblyHome can still deep-link straight
  // to e.g. a specific entry, the same way it could when Journal was a
  // top-level tab.
  Journal: NavigatorScreenParams<JournalStackParamList> | undefined;
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
      <Stack.Screen
        name="NativeMenuPilot"
        component={NativeMenuPilotScreen}
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Stack.Screen name="ChallengeList" component={ChallengeListScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="ChallengeDetail"
        component={ChallengeDetailScreen}
        options={{ headerShown: false }}
      />
      <Stack.Screen
        name="RestaurantDetail"
        component={RestaurantDetailScreen}
        options={{ headerShown: false, gestureEnabled: false }}
      />
      <Stack.Screen name="Journal" component={JournalNavigator} options={{ headerShown: false }} />
    </Stack.Navigator>
  );
}
