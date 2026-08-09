// Font-family keys map to the exact names @expo-google-fonts packages export
// once loaded via useFonts() in App.tsx. Only the weights actually used
// below are loaded — do not add a useFonts() entry (or a new
// @expo-google-fonts/* package) without a corresponding FONT_FAMILY key
// that's actually referenced somewhere, and don't reference a new font
// family at all without updating this file first. This file is the
// typography system, not just a lookup table for one.
//
// THE RULE-SET (owner decision, 2026-08-05, after the app organically
// drifted to 5 competing typefaces with no assigned roles -- Inter vs
// WorkSans both doing "UI text," Besley vs Fraunces both doing "heading,"
// depending which screen you happened to be on):
//
//   Yellowtail   -- the brand wordmark ONLY. Never body text, never a
//                   heading, never anything a user reads as content.
//   Piazzolla    -- the one heading/display voice. Section and page
//                   titles, restaurant-detail's own name, and the
//                   matched-substring accent in HighlightedText. Bold for
//                   headings, Italic for the rare editorial aside (e.g.
//                   `greeting`). If something needs emphasis and it isn't
//                   Yellowtail's job, it's Piazzolla's. ExtraBold is a
//                   deliberate exception reserved for exactly one spot --
//                   restaurant-detail's own hero title (owner decision,
//                   2026-08-05: a 22px Bold heading and THE single most
//                   important name on the whole screen looked like the same
//                   weight of thing) -- don't reach for ExtraBold anywhere
//                   else without a similarly specific reason, or it stops
//                   meaning "the one hero title" and starts meaning nothing.
//   WorkSans     -- everything else: body copy, restaurant/item names as
//                   they appear in lists and rows, buttons, chips, labels,
//                   captions. Regular/Medium/SemiBold/Bold/ExtraBold cover
//                   the full weight range a UI actually needs, so there's
//                   no reason to reach for a second sans.
//
// New screens reference these FONT_FAMILY keys (or, better, the `text.*`
// presets below where one already fits) rather than inventing a local
// style with a font this file doesn't know about.

import { StyleSheet } from 'react-native';
import { COLORS } from './tokens';

export const FONT_FAMILY = {
  yellowtail: 'Yellowtail_400Regular',
  piazzollaBold: 'Piazzolla_700Bold',
  piazzollaExtraBold: 'Piazzolla_800ExtraBold',
  piazzollaItalic: 'Piazzolla_400Regular_Italic',
  workSansRegular: 'WorkSans_400Regular',
  workSansMedium: 'WorkSans_500Medium',
  workSansSemiBold: 'WorkSans_600SemiBold',
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
  // Restaurant/item names as they appear in lists, rows, and cards --
  // WorkSans, per the rule-set above. restaurant-detail's own header
  // overrides this to Piazzolla for its one big hero instance (see
  // ExpandedHeader.tsx's restaurantTitle) rather than this shared default
  // changing for every row everywhere.
  restaurantName: {
    fontFamily: FONT_FAMILY.workSansBold,
    fontSize: 17,
    color: COLORS.ink,
  },
  sectionTitle: {
    fontFamily: FONT_FAMILY.piazzollaBold,
    fontSize: 22,
    color: COLORS.ink,
  },
  categoryHeader: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 12,
    color: COLORS.ink,
  },
  greeting: {
    fontFamily: FONT_FAMILY.piazzollaItalic,
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
