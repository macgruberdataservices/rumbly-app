import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { FindNavigator, type FindStackParamList } from './FindNavigator';
import { ExploreNavigator, type ExploreStackParamList } from './ExploreNavigator';
import { MyRumblyNavigator, type MyRumblyStackParamList } from './MyRumblyNavigator';
import { SettingsNavigator } from './SettingsNavigator';
import { JournalComposerScreen } from '../screens/journal/JournalComposerScreen';
import type { AppRootStackParamList } from './journalTypes';
import { COLORS } from '../theme/tokens';

export type RootTabParamList = {
  Find: NavigatorScreenParams<FindStackParamList>;
  Explore: NavigatorScreenParams<ExploreStackParamList>;
  // Nested params so screens in other tabs (Find, Explore) can jump
  // straight to a specific My Rumbly screen -- e.g. AccountSettings,
  // via useOpenAccountSettings -- rather than only landing on its home.
  MyRumbly: NavigatorScreenParams<MyRumblyStackParamList>;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const AppStack = createNativeStackNavigator<AppRootStackParamList>();

function FindIcon({ color }: { color: string }) {
  return (
    <View style={styles.iconFrame}>
      <View style={[styles.searchCircle, { borderColor: color }]} />
      <View style={[styles.searchHandle, { backgroundColor: color }]} />
    </View>
  );
}

function ExploreIcon({ color }: { color: string }) {
  return (
    <View style={styles.iconFrame}>
      <View style={[styles.compassOuter, { borderColor: color }]}>
        <View style={[styles.compassNeedle, { borderBottomColor: color }]} />
      </View>
    </View>
  );
}

function MyRumblyIcon({ color }: { color: string }) {
  return (
    <View style={styles.iconFrame}>
      <View style={[styles.personHead, { borderColor: color }]} />
      <View style={[styles.personBody, { borderColor: color }]} />
    </View>
  );
}

function TabIcon({ routeName, color }: { routeName: keyof RootTabParamList; color: string }) {
  if (routeName === 'Find') return <FindIcon color={color} />;
  if (routeName === 'Explore') return <ExploreIcon color={color} />;
  return <MyRumblyIcon color={color} />;
}

function MainTabs() {
  return (
    <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon routeName={route.name} color={color} />,
          tabBarActiveTintColor: COLORS.forest,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          tabBarStyle: {
            height: 66,
            paddingTop: 7,
            paddingBottom: 8,
            backgroundColor: COLORS.surface,
            borderTopColor: COLORS.border,
          },
        })}
      >
        <Tab.Screen
          name="Find"
          component={FindNavigator}
        />
        <Tab.Screen name="Explore" component={ExploreNavigator} />
        <Tab.Screen name="MyRumbly" component={MyRumblyNavigator} options={{ title: 'My Rumbly' }} />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <AppStack.Navigator screenOptions={{ headerShown: false }}>
        <AppStack.Screen name="MainTabs" component={MainTabs} />
        <AppStack.Screen
          name="JournalComposer"
          component={JournalComposerScreen}
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <AppStack.Screen name="Settings" component={SettingsNavigator} options={{ animation: 'slide_from_right' }} />
      </AppStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  iconFrame: {
    width: 24,
    height: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchCircle: {
    width: 15,
    height: 15,
    borderRadius: 8,
    borderWidth: 2,
    marginLeft: -2,
    marginTop: -2,
  },
  searchHandle: {
    width: 8,
    height: 2,
    borderRadius: 1,
    transform: [{ rotate: '45deg' }],
    marginLeft: 12,
    marginTop: -1,
  },
  compassOuter: {
    width: 21,
    height: 21,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  compassNeedle: {
    width: 0,
    height: 0,
    borderLeftWidth: 4,
    borderRightWidth: 4,
    borderBottomWidth: 11,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    transform: [{ rotate: '35deg' }],
  },
  personHead: {
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 2,
    marginBottom: 2,
  },
  personBody: {
    width: 18,
    height: 9,
    borderTopLeftRadius: 9,
    borderTopRightRadius: 9,
    borderWidth: 2,
    borderBottomWidth: 0,
  },
});
