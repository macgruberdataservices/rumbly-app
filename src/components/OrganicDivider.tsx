import Svg, { Path } from 'react-native-svg';
import { View, type ViewStyle } from 'react-native';

type OrganicDividerProps = {
  /** Fill color -- typically the color of the section *below* the divider,
   * since it reads as that section's top edge curving up into whatever
   * sits above it (a colored hero/header band). */
  color: string;
  height?: number;
  /** Typically position: 'absolute', bottom: 0 to overlay the last N px of
   * a colored parent so the parent appears to end in a curve. */
  style?: ViewStyle;
};

// One reusable wave motif for hero/header -> content boundaries app-wide
// (color-and-shapes pass, 2026-08-09), rather than a bespoke curve
// invented per screen -- keeps it reading as an intentional design-
// language element instead of decoration sprinkled randomly. Not wired
// into a screen yet: ExploreHomeScreen's header is a shared component
// (SettingsButton, used by Find/Explore/My Rumbly alike) that assumes a
// light background, so turning that particular bar into a colored band
// wasn't a same-pass, single-screen change. Staged for the next hero-band
// pass (Journal or My Rumbly's own greeting).
export function OrganicDivider({ color, height = 28, style }: OrganicDividerProps) {
  return (
    <View style={[{ height, width: '100%', overflow: 'hidden' }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 20" preserveAspectRatio="none">
        <Path d="M0,9 C22,20 45,-2 68,7 C82,12 92,4 100,8 L100,20 L0,20 Z" fill={color} />
      </Svg>
    </View>
  );
}
