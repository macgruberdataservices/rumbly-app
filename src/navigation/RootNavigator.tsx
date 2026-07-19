import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { FindNavigator, type FindStackParamList } from './FindNavigator';
import { ExploreNavigator } from './ExploreNavigator';
import { MyRumblyNavigator } from './MyRumblyNavigator';
import { COLORS } from '../theme/tokens';

export type RootTabParamList = {
  Find: NavigatorScreenParams<FindStackParamList>;
  Explore: undefined;
  MyRumbly: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Tab.Navigator
        screenOptions={{
          // Each tab renders its own nested stack with its own header —
          // no icon library installed yet, text-only labels are fine for now.
          headerShown: false,
          tabBarActiveTintColor: COLORS.forest,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarStyle: { backgroundColor: COLORS.surface, borderTopColor: COLORS.border },
        }}
      >
        <Tab.Screen name="Find" component={FindNavigator} />
        <Tab.Screen name="Explore" component={ExploreNavigator} />
        <Tab.Screen name="MyRumbly" component={MyRumblyNavigator} options={{ title: 'My Rumbly' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
