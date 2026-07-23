// Font-family keys map to the exact names @expo-google-fonts packages export
// once loaded via useFonts() in App.tsx. Only the weights actually used in
// the source CSS are loaded — see Docs/ROADMAP.md session notes for the
// font-weight inventory this was confirmed against.

import { StyleSheet } from 'react-native';
import { COLORS } from './tokens';

export const FONT_FAMILY = {
  interRegular: 'Inter_400Regular',
  interMedium: 'Inter_500Medium',
  interSemiBold: 'Inter_600SemiBold',
  interBold: 'Inter_700Bold',
  frauncesRegular: 'Fraunces_400Regular',
  frauncesItalic: 'Fraunces_400Regular_Italic',
  frauncesMedium: 'Fraunces_500Medium',
  frauncesSemiBold: 'Fraunces_600SemiBold',
  frauncesBold: 'Fraunces_700Bold',
  yellowtail: 'Yellowtail_400Regular',
  besleyBold: 'Besley_700Bold',
  workSansRegular: 'WorkSans_400Regular',
  workSansBold: 'WorkSans_700Bold',
  workSansExtraBold: 'WorkSans_800ExtraBold',
} as const;

export const text = StyleSheet.create({
  brandWordmark: {
    fontFamily: FONT_FAMILY.yellowtail,
    fontSize: 27,
    color: COLORS.wordmarkCream,
  },
  // Same wordmark, dark variant for light-background contexts (e.g. the
  // Find tab's headerless default state) — brandWordmark's cream color
  // was tuned for the dark-forest native-stack header.
  brandWordmarkDark: {
    fontFamily: FONT_FAMILY.yellowtail,
    fontSize: 27,
    color: COLORS.forest,
  },
  restaurantName: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 17,
    color: COLORS.ink,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.besleyBold,
    fontSize: 22,
    color: COLORS.ink,
  },
  categoryHeader: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.ink,
  },
  greeting: {
    fontFamily: FONT_FAMILY.frauncesItalic,
    fontSize: 20,
    color: COLORS.ink,
  },
  body: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 15,
    color: COLORS.ink,
  },
  bodyMuted: {
    fontFamily: FONT_FAMILY.workSansRegular,
    fontSize: 12.5,
    color: COLORS.muted,
  },
  chip: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.ink,
  },
  buttonLabel: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.ink,
  },
  sectionToggle: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.muted,
  },
});
