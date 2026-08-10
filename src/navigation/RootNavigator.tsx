import { NavigationContainer, type NavigatorScreenParams } from '@react-navigation/native';
import {
  createBottomTabNavigator,
  type BottomTabBarButtonProps,
} from '@react-navigation/bottom-tabs';
import { PlatformPressable } from '@react-navigation/elements';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { FindNavigator, type FindStackParamList } from './FindNavigator';
import { ExploreNavigator, type ExploreStackParamList } from './ExploreNavigator';
import { MyRumblyNavigator, type MyRumblyStackParamList } from './MyRumblyNavigator';
import { AskRumblyNavigator, type AskRumblyStackParamList } from './AskRumblyNavigator';
import { SettingsNavigator } from './SettingsNavigator';
import { JournalComposerScreen } from '../screens/journal/JournalComposerScreen';
import type { AppRootStackParamList } from './journalTypes';
import { DAYLIGHT, SPACING } from '../theme/tokens';

export type RootTabParamList = {
  Find: NavigatorScreenParams<FindStackParamList>;
  Explore: NavigatorScreenParams<ExploreStackParamList>;
  AskRumbly: NavigatorScreenParams<AskRumblyStackParamList>;
  // Nested params so screens in other tabs (Find, Explore) can jump
  // straight to a specific My Rumbly screen -- e.g. AccountSettings,
  // via useOpenAccountSettings -- rather than only landing on its home.
  MyRumbly: NavigatorScreenParams<MyRumblyStackParamList>;
};

const Tab = createBottomTabNavigator<RootTabParamList>();
const AppStack = createNativeStackNavigator<AppRootStackParamList>();

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

function AskRumblyIcon({ color }: { color: string }) {
  return (
    <View style={styles.iconFrame}>
      <View style={[styles.askBubble, { borderColor: color }]}>
        <View style={[styles.askDot, { backgroundColor: color }]} />
        <View style={[styles.askDot, { backgroundColor: color }]} />
        <View style={[styles.askDot, { backgroundColor: color }]} />
      </View>
    </View>
  );
}

function TabIcon({ routeName, color }: { routeName: keyof RootTabParamList; color: string }) {
  if (routeName === 'Find') return <FindIcon color={color} />;
  if (routeName === 'Explore') return <ExploreIcon color={color} />;
  if (routeName === 'AskRumbly') return <AskRumblyIcon color={color} />;
  return <MyRumblyIcon color={color} />;
}

function DaylightTabButton(props: BottomTabBarButtonProps) {
  const selected = props['aria-selected'];
  return (
    <PlatformPressable
      {...props}
      style={[
        props.style,
        styles.tabButton,
        selected && styles.tabButtonActive,
      ]}
    />
  );
}

// Floating "pill" tab bar matching current iOS system chrome (the
// inset-from-edges, rounded, frosted-glass bar iOS itself now uses) rather
// than the previous edge-to-edge bar docked flush against the bottom.
// tabBarStyle.position:'absolute' is what makes it float over content
// instead of reserving its own row -- screens don't currently pad their
// scroll content to account for that, so the last bit of a long list can
// still tuck in behind the pill. Worth a follow-up pass per-screen if that
// turns out to matter in practice; out of scope for this visual pass.
function MainTabs() {
  const insets = useSafeAreaInsets();
  return (
    <Tab.Navigator
        screenOptions={({ route }) => ({
          headerShown: false,
          tabBarIcon: ({ color }) => <TabIcon routeName={route.name} color={color} />,
          tabBarActiveTintColor: DAYLIGHT.ocean,
          tabBarInactiveTintColor: DAYLIGHT.muted,
          tabBarButton: (props) => <DaylightTabButton {...props} />,
          tabBarLabelStyle: { fontSize: 11, lineHeight: 14, fontWeight: '600' },
          tabBarBackground: () => <View style={styles.tabBarBackground} />,
          tabBarStyle: {
            position: 'absolute',
            // start/end, not left/right -- @react-navigation/bottom-tabs'
            // own base style (BottomTabBar.js's styles.bottom) sets
            // start:0/end:0 (RN's logical, RTL-aware properties). Setting
            // left/right here doesn't override that -- start/end and
            // left/right aren't the same style keys, so both apply and
            // start/end wins the actual layout, which is exactly why an
            // earlier attempt at left/right silently had zero visual
            // effect at any value. With four tabs, 64pt margins left only
            // ~66pt per item on a standard iPhone and forced Ask Rumbly and
            // My Rumbly to ellipsize. These margins keep the floating-pill
            // treatment while giving every label enough room.
            start: 20,
            end: 20,
            bottom: insets.bottom + SPACING.sm,
            height: 62,
            // The base style (same file, above the tabBarStyle merge) also
            // sets paddingBottom: insets.bottom unconditionally for a
            // bottom-position bar -- meant for a bar docked flush against
            // the physical edge, reserving room so its content clears the
            // home indicator. This bar already clears the home indicator
            // via its own `bottom` offset above, so that reserved padding
            // just ate into the 62pt height with nothing to show for it,
            // squeezing icon+label down until the icons' bottoms clipped.
            // Overriding back to 0 here is what actually fixes that.
            paddingTop: 7,
            paddingBottom: 0,
            borderRadius: 31,
            borderWidth: 1,
            borderColor: DAYLIGHT.border,
            backgroundColor: 'transparent',
            shadowColor: '#000',
            shadowOpacity: 0.12,
            shadowRadius: 16,
            shadowOffset: { width: 0, height: 6 },
            elevation: 10,
          },
        })}
      >
        <Tab.Screen
          name="Find"
          component={FindNavigator}
        />
        <Tab.Screen name="Explore" component={ExploreNavigator} />
        <Tab.Screen name="AskRumbly" component={AskRumblyNavigator} options={{ title: 'Ask Rumbly' }} />
        <Tab.Screen
          name="MyRumbly"
          component={MyRumblyNavigator}
          options={{ title: 'My Rumbly', freezeOnBlur: true }}
        />
    </Tab.Navigator>
  );
}

export function RootNavigator() {
  return (
    <NavigationContainer>
      <AppStack.Navigator screenOptions={{ headerShown: false }}>
        <AppStack.Screen name="MainTabs" component={MainTabs} />
        <AppStack.Screen
          name="JournalComposer"
          component={JournalComposerScreen}
          options={{ animation: 'slide_from_bottom', presentation: 'modal' }}
        />
        <AppStack.Screen name="Settings" component={SettingsNavigator} options={{ animation: 'slide_from_right' }} />
      </AppStack.Navigator>
    </NavigationContainer>
  );
}

const styles = StyleSheet.create({
  // Opaque in daylight: translucent chrome loses too much separation over
  // scrolling content outdoors. The outer container keeps the shadow while
  // this inner surface owns clipping and the rounded fill.
  tabBarBackground: {
    ...StyleSheet.absoluteFill,
    borderRadius: 31,
    overflow: 'hidden',
    backgroundColor: 'rgba(255, 255, 255, 0.98)',
  },
  tabButton: {
    marginVertical: 5,
    borderRadius: 22,
  },
  tabButtonActive: {
    backgroundColor: DAYLIGHT.sky,
  },
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
  askBubble: {
    width: 23,
    height: 17,
    borderRadius: 8,
    borderWidth: 2,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 3,
    position: 'relative',
  },
  askDot: {
    width: 3,
    height: 3,
    borderRadius: 2,
  },
});
