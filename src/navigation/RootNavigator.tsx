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
          headerShown: false,
          tabBarIcon: () => null,
          tabBarIconStyle: { display: 'none' },
          tabBarActiveTintColor: COLORS.forest,
          tabBarInactiveTintColor: COLORS.muted,
          tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
          tabBarStyle: {
            height: 54,
            paddingTop: 6,
            paddingBottom: 8,
            backgroundColor: COLORS.surface,
            borderTopColor: COLORS.border,
          },
        }}
      >
        <Tab.Screen name="Find" component={FindNavigator} />
        <Tab.Screen name="Explore" component={ExploreNavigator} />
        <Tab.Screen name="MyRumbly" component={MyRumblyNavigator} options={{ title: 'My Rumbly' }} />
      </Tab.Navigator>
    </NavigationContainer>
  );
}
