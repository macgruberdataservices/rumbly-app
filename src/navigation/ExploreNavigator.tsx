import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { ExploreHomeScreen } from '../screens/ExploreHomeScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';

// One-screen stack for now (see roadmap: Explore gets real content in
// Phase 4). Nested now rather than a bare screen so Phase 4 doesn't need
// another navigation restructure when it adds real destinations.
export type ExploreStackParamList = {
  ExploreHome: undefined;
};

const Stack = createNativeStackNavigator<ExploreStackParamList>();

export function ExploreNavigator() {
  return (
    <Stack.Navigator
      screenOptions={{
        headerStyle: { backgroundColor: COLORS.forest },
        headerTintColor: COLORS.goldLight,
        headerTitleStyle: { fontFamily: FONT_FAMILY.frauncesSemiBold },
        contentStyle: { backgroundColor: COLORS.surface },
      }}
    >
      <Stack.Screen name="ExploreHome" component={ExploreHomeScreen} options={{ title: 'Explore' }} />
    </Stack.Navigator>
  );
}
