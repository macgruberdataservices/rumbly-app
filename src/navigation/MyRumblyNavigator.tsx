import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MyRumblyHomeScreen } from '../screens/MyRumblyHomeScreen';
import { MyActivityScreen } from '../screens/MyActivityScreen';
import { ChallengeDetailScreen } from '../screens/ChallengeDetailScreen';
import { ChallengeListScreen } from '../screens/ChallengeListScreen';
import { RestaurantDetailScreen } from '../screens/RestaurantDetailScreen';
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen';
import { AccountManagementScreen } from '../screens/AccountManagementScreen';
import { ChangeEmailScreen } from '../screens/ChangeEmailScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { GeneralSettingsScreen } from '../screens/GeneralSettingsScreen';
import { ProfileSettingsScreen } from '../screens/ProfileSettingsScreen';
import { SettingsPlaceholderScreen } from '../screens/SettingsPlaceholderScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';
import type { RestaurantDetailRouteParams } from './browseTypes';

export type MyRumblyStackParamList = {
  MyRumblyHome: undefined;
  MyActivity: undefined;
  AccountSettings: undefined;
  AccountManagement: undefined;
  ProfileSettings: undefined;
  ChangeEmail: undefined;
  ChangePassword: undefined;
  GeneralSettings: undefined;
  SettingsPlaceholder: { title: string };
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
        options={{ headerShown: false, title: 'My Bites' }}
      />
      <Stack.Screen name="MyActivity" component={MyActivityScreen} options={{ headerShown: false }} />
      <Stack.Screen
        name="AccountSettings"
        component={AccountSettingsScreen}
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="AccountManagement"
        component={AccountManagementScreen}
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ProfileSettings"
        component={ProfileSettingsScreen}
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ChangeEmail"
        component={ChangeEmailScreen}
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="GeneralSettings"
        component={GeneralSettingsScreen}
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="SettingsPlaceholder"
        component={SettingsPlaceholderScreen}
        options={{ headerShown: false, animation: 'slide_from_right' }}
      />
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
