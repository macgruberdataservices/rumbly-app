import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { StyleSheet, View } from 'react-native';
import { FindNavigator, type FindStackParamList } from './FindNavigator';
import { ExploreNavigator, type ExploreStackParamList } from './ExploreNavigator';
import { MyRumblyNavigator } from './MyRumblyNavigator';
import { COLORS } from '../theme/tokens';

export type RootTabParamList = {
  Find: NavigatorScreenParams<FindStackParamList>;
  Explore: NavigatorScreenParams<ExploreStackParamList>;
  MyRumbly: undefined;
};

const Tab = createBottomTabNavigator<RootTabParamList>();

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

export function RootNavigator() {
  return (
    <NavigationContainer>
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
        <Tab.Screen name="Find" component={FindNavigator} />
        <Tab.Screen name="Explore" component={ExploreNavigator} />
        <Tab.Screen name="MyRumbly" component={MyRumblyNavigator} options={{ title: 'My Rumbly' }} />
      </Tab.Navigator>
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
