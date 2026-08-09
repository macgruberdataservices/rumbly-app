import { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts } from 'expo-font';
import { Yellowtail_400Regular } from '@expo-google-fonts/yellowtail';
import {
  Piazzolla_700Bold,
  Piazzolla_800ExtraBold,
  Piazzolla_400Regular_Italic,
} from '@expo-google-fonts/piazzolla';
import {
  Fredoka_500Medium,
  Fredoka_600SemiBold,
  Fredoka_700Bold,
} from '@expo-google-fonts/fredoka';
import {
  WorkSans_400Regular,
  WorkSans_500Medium,
  WorkSans_600SemiBold,
  WorkSans_700Bold,
  WorkSans_800ExtraBold,
} from '@expo-google-fonts/work-sans';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DataProvider } from './src/data/dataProvider';
import { AuthProvider } from './src/data/authProvider';
import { EntitlementsProvider } from './src/data/entitlementsProvider';
import { ActivityProvider } from './src/data/activityProvider';
import { JournalProvider } from './src/data/journalProvider';
import { AppSettingsProvider } from './src/data/appSettingsProvider';
import { NearMeProvider } from './src/data/nearMeProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Yellowtail_400Regular,
    Piazzolla_700Bold,
    Piazzolla_800ExtraBold,
    Piazzolla_400Regular_Italic,
    Fredoka_500Medium,
    Fredoka_600SemiBold,
    Fredoka_700Bold,
    WorkSans_400Regular,
    WorkSans_500Medium,
    WorkSans_600SemiBold,
    WorkSans_700Bold,
    WorkSans_800ExtraBold,
  });

  const onLayoutRootView = useCallback(async () => {
    if (fontsLoaded || fontError) {
      await SplashScreen.hideAsync();
    }
  }, [fontsLoaded, fontError]);

  useEffect(() => {
    onLayoutRootView();
  }, [onLayoutRootView]);

  if (!fontsLoaded && !fontError) {
    return null;
  }

  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <SafeAreaProvider>
        <AppSettingsProvider>
          <DataProvider>
            <AuthProvider>
              <NearMeProvider>
                <EntitlementsProvider>
                  <ActivityProvider>
                    <JournalProvider>
                      <RootNavigator />
                    </JournalProvider>
                  </ActivityProvider>
                </EntitlementsProvider>
              </NearMeProvider>
            </AuthProvider>
          </DataProvider>
        </AppSettingsProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
