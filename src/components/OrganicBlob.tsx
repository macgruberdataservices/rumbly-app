import Svg, { Path } from 'react-native-svg';
import { StyleSheet, View, type ViewStyle } from 'react-native';

type OrganicBlobProps = {
  /** Fill color, typically a translucent white/rgba over a colored tile. */
  color: string;
  size?: number;
  style?: ViewStyle;
};

// One reusable irregular-blob shape (color-and-shapes pass, 2026-08-09),
// standing in for ad hoc rotated-rectangle "accents" like ExploreHomeScreen's
// old cardAccent. Reused wherever a card/tile wants a soft organic flourish
// in a corner, rather than each screen inventing its own shape -- keeps the
// motif reading as an intentional part of the design language instead of
// scattered decoration. See also OrganicDivider for the header/content-seam
// counterpart of this same idea.
export function OrganicBlob({ color, size = 46, style }: OrganicBlobProps) {
  return (
    <View style={[styles.container, { width: size, height: size }, style]} pointerEvents="none">
      <Svg width="100%" height="100%" viewBox="0 0 100 100">
        <Path
          d="M50,8 C74,10 90,28 88,52 C86,74 66,90 44,88 C22,86 8,66 10,44 C12,22 28,6 50,8 Z"
          fill={color}
        />
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
  },
});
