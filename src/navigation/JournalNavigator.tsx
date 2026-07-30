import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { JournalHomeScreen } from '../screens/journal/JournalHomeScreen';
import { JournalEntryDetailScreen } from '../screens/journal/JournalEntryDetailScreen';
import { JournalPageDetailScreen } from '../screens/journal/JournalPageDetailScreen';
import { JournalStorageSettingsScreen } from '../screens/journal/JournalStorageSettingsScreen';
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
        name="JournalEntryDetail"
        component={JournalEntryDetailScreen}
        options={{ animation: 'slide_from_right' }}
      />
      <Stack.Screen
        name="JournalStorageSettings"
        component={JournalStorageSettingsScreen}
        options={{ animation: 'slide_from_right' }}
      />
    </Stack.Navigator>
  );
}
