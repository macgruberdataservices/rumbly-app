import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { MyRumblyHomeScreen } from '../screens/MyRumblyHomeScreen';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';

// One-screen stack for now (see roadmap: real Need It, Got It, Love It,
// ratings, history, and settings content lands later). Nested now so those
// phases don't need another navigation restructure.
export type MyRumblyStackParamList = {
  MyRumblyHome: undefined;
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
      <Stack.Screen name="MyRumblyHome" component={MyRumblyHomeScreen} options={{ title: 'My Rumbly' }} />
    </Stack.Navigator>
  );
}
