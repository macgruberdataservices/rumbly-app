import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { JournalHomeScreen } from '../screens/journal/JournalHomeScreen';
import { JournalPageDetailScreen } from '../screens/journal/JournalPageDetailScreen';
import { JournalComposerScreen } from '../screens/journal/JournalComposerScreen';
import type { JournalStackParamList } from './journalTypes';

const Stack = createNativeStackNavigator<JournalStackParamList>();

export function JournalNavigator() {
  return (
    <Stack.Navigator screenOptions={{ headerShown: false }}>
      <Stack.Screen name="JournalHome" component={JournalHomeScreen} />
      <Stack.Screen
        name="JournalPageDetail"
        component={JournalPageDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="JournalComposer"
        component={JournalComposerScreen}
        options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
      />
    </Stack.Navigator>
  );
}
