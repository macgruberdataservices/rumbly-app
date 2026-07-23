import { useCallback, useEffect } from 'react';
import { StatusBar } from 'expo-status-bar';
import * as SplashScreen from 'expo-splash-screen';
import { useFonts, Inter_400Regular, Inter_500Medium, Inter_600SemiBold, Inter_700Bold } from '@expo-google-fonts/inter';
import {
  Fraunces_400Regular,
  Fraunces_400Regular_Italic,
  Fraunces_500Medium,
  Fraunces_600SemiBold,
  Fraunces_700Bold,
} from '@expo-google-fonts/fraunces';
import { Yellowtail_400Regular } from '@expo-google-fonts/yellowtail';
import { Besley_700Bold } from '@expo-google-fonts/besley';
import {
  WorkSans_400Regular,
  WorkSans_700Bold,
  WorkSans_800ExtraBold,
} from '@expo-google-fonts/work-sans';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { DataProvider } from './src/data/dataProvider';
import { AuthProvider } from './src/data/authProvider';
import { EntitlementsProvider } from './src/data/entitlementsProvider';
import { ActivityProvider } from './src/data/activityProvider';
import { RootNavigator } from './src/navigation/RootNavigator';

SplashScreen.preventAutoHideAsync().catch(() => {});

export default function App() {
  const [fontsLoaded, fontError] = useFonts({
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
    Inter_700Bold,
    Fraunces_400Regular,
    Fraunces_400Regular_Italic,
    Fraunces_500Medium,
    Fraunces_600SemiBold,
    Fraunces_700Bold,
    Yellowtail_400Regular,
    Besley_700Bold,
    WorkSans_400Regular,
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
        <DataProvider>
          <AuthProvider>
            <EntitlementsProvider>
              <ActivityProvider>
                <RootNavigator />
              </ActivityProvider>
            </EntitlementsProvider>
          </AuthProvider>
        </DataProvider>
        <StatusBar style="dark" />
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}
