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
} as const;

export const text = StyleSheet.create({
  brandWordmark: {
    fontFamily: FONT_FAMILY.yellowtail,
    fontSize: 27,
    color: COLORS.wordmarkCream,
  },
  restaurantName: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 17,
    color: COLORS.ink,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.frauncesMedium,
    fontSize: 22,
    color: COLORS.ink,
  },
  categoryHeader: {
    fontFamily: FONT_FAMILY.frauncesItalic,
    fontSize: 14,
    color: COLORS.muted,
  },
  greeting: {
    fontFamily: FONT_FAMILY.frauncesItalic,
    fontSize: 20,
    color: COLORS.ink,
  },
  body: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 15,
    color: COLORS.ink,
  },
  bodyMuted: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 13,
    color: COLORS.muted,
  },
  chip: {
    fontFamily: FONT_FAMILY.interMedium,
    fontSize: 13,
    color: COLORS.ink,
  },
  buttonLabel: {
    fontFamily: FONT_FAMILY.interSemiBold,
    fontSize: 13,
    color: COLORS.forest,
  },
  sectionToggle: {
    fontFamily: FONT_FAMILY.interBold,
    fontSize: 11,
    color: COLORS.muted,
  },
});
