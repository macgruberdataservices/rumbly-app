import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { HomeScreen } from '../screens/HomeScreen';
import { ParkListScreen } from '../screens/ParkListScreen';
import { RestaurantListScreen } from '../screens/RestaurantListScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';

export type RootStackParamList = {
  Home: undefined;
  ParkList: undefined;
  RestaurantList: { groupKey: string; groupLabel: string };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export function RootNavigator() {
  return (
    <NavigationContainer>
      <Stack.Navigator
        screenOptions={{
          headerStyle: { backgroundColor: COLORS.forest },
          headerTintColor: COLORS.goldLight,
          headerTitleStyle: { fontFamily: FONT_FAMILY.frauncesSemiBold },
          headerBackTitle: '',
          contentStyle: { backgroundColor: COLORS.surface },
        }}
      >
        <Stack.Screen name="Home" component={HomeScreen} options={{ title: 'Rumbly' }} />
        <Stack.Screen name="ParkList" component={ParkListScreen} options={{ title: 'Browse by Park' }} />
        <Stack.Screen
          name="RestaurantList"
          component={RestaurantListScreen}
          options={({ route }) => ({ title: route.params.groupLabel })}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
}
