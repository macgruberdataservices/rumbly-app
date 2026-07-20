import { Text, type StyleProp, type TextStyle } from 'react-native';
import { findMatchRange } from '../search/highlight';
import { COLORS } from '../theme/tokens';
import { FONT_FAMILY } from '../theme/typography';

// Default highlight is a font-family swap to the Fraunces bold variant
// (not RN's generic fontWeight: 'bold', which custom-loaded Google Fonts
// mostly ignore since each weight is its own named family) plus a color
// accent — weight *and* color together, per the search spec's "in
// addition to color" requirement. Both current call sites (ItemResultRow,
// RestaurantCard) share the same Fraunces-based text.restaurantName base
// style, so one default covers both; pass highlightStyle to override for
// a different base font.
const DEFAULT_HIGHLIGHT_STYLE: TextStyle = {
  fontFamily: FONT_FAMILY.frauncesBold,
  color: COLORS.gold,
};

export function HighlightedText({
  text,
  query,
  style,
  highlightStyle = DEFAULT_HIGHLIGHT_STYLE,
  numberOfLines,
}: {
  text: string;
  query: string | undefined;
  style?: StyleProp<TextStyle>;
  highlightStyle?: StyleProp<TextStyle>;
  numberOfLines?: number;
}) {
  const range = query ? findMatchRange(text, query) : null;

  if (!range) {
    return (
      <Text style={style} numberOfLines={numberOfLines}>
        {text}
      </Text>
    );
  }

  return (
    <Text style={style} numberOfLines={numberOfLines}>
      {text.slice(0, range.start)}
      <Text style={[style, highlightStyle]}>{text.slice(range.start, range.end)}</Text>
      {text.slice(range.end)}
    </Text>
  );
}
