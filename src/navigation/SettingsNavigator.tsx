import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AccountSettingsScreen } from '../screens/AccountSettingsScreen';
import { AccountManagementScreen } from '../screens/AccountManagementScreen';
import { ChangeEmailScreen } from '../screens/ChangeEmailScreen';
import { ChangePasswordScreen } from '../screens/ChangePasswordScreen';
import { GeneralSettingsScreen } from '../screens/GeneralSettingsScreen';
import { DevelopmentSettingsScreen } from '../screens/DevelopmentSettingsScreen';
import { AskRumblyScreen } from '../screens/AskRumblyScreen';
import { ProfileSettingsScreen } from '../screens/ProfileSettingsScreen';
import { SettingsPlaceholderScreen } from '../screens/SettingsPlaceholderScreen';
import type { SettingsStackParamList } from './settingsTypes';

// Lifted to a root-level navigator (2026-08-04) rather than living inside
// MyRumblyNavigator's own stack -- the settings gear button is reachable
// from Find, Explore, and My Rumbly alike (see useOpenAccountSettings),
// and nesting this tree inside one tab's stack meant entering it from a
// different tab silently switched the active tab to My Rumbly, so "back"
// out of settings always landed on the My Rumbly home screen no matter
// which tab you'd actually opened it from. Registering the whole tree as
// its own screen on the root AppStack (RootNavigator.tsx), sitting beside
// MainTabs, means opening it is a plain root-level push that never touches
// the tab navigator's state -- "back" pops back to MainTabs exactly where
// it was, same pattern JournalComposer already uses for the same reason.
const Stack = createNativeStackNavigator<SettingsStackParamList>();

export function SettingsNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="AccountSettings" component={AccountSettingsScreen} />
      <Stack.Screen
        name="AccountManagement"
        component={AccountManagementScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="ProfileSettings"
        component={ProfileSettingsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen name="ChangeEmail" component={ChangeEmailScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="ChangePassword"
        component={ChangePasswordScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="GeneralSettings"
        component={GeneralSettingsScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen name="Development" component={DevelopmentSettingsScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen name="AskRumbly" component={AskRumblyScreen} options={{ animation: 'slide_from_right' }} />
      <Stack.Screen
        name="SettingsPlaceholder"
        component={SettingsPlaceholderScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
