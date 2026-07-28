import { useWindowDimensions, Pressable, StyleSheet, Text as RNText, View } from 'react-native';
import {
  Button,
  ContextMenu,
  Host,
  List,
  RNHostView,
  SwipeActions,
} from '@expo/ui/swift-ui';
import {
  listRowBackground,
  listRowInsets,
  listRowSeparator,
  listStyle,
  scrollContentBackground,
  scrollDisabled,
  tint,
} from '@expo/ui/swift-ui/modifiers';
import { COLORS, RADII, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

export function NativeInteractionDemo({ onEvent }: { onEvent: (message: string) => void }) {
  const { width } = useWindowDimensions();
  const rowWidth = width;

  return (
    <Host
      seedColor={COLORS.forest}
      style={{ width: rowWidth, height: 84 }}
    >
      <List
        modifiers={[
          listStyle('plain'),
          scrollContentBackground('hidden'),
          scrollDisabled(true),
        ]}
      >
        <SwipeActions
          modifiers={[
            listRowInsets({ top: 0, bottom: 0, leading: 0, trailing: 0 }),
            listRowSeparator('hidden'),
            listRowBackground(COLORS.surface),
          ]}
        >
          <ContextMenu>
            <ContextMenu.Items>
              <Button
                label="Need It"
                systemImage="star"
                onPress={() => onEvent('Need It selected from the native preview menu')}
              />
              <Button
                label="Got It"
                systemImage="checkmark.circle"
                onPress={() => onEvent('Got It selected from the native preview menu')}
              />
              <Button
                label="Love It"
                systemImage="heart"
                onPress={() => onEvent('Love It selected from the native preview menu')}
              />
            </ContextMenu.Items>

            <ContextMenu.Trigger>
              <RNHostView matchContents>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="Open Tiffins Bread Service"
                  onPress={() => onEvent('Card tapped — open the full menu or restaurant page')}
                  style={[styles.row, { width: rowWidth }]}
                >
                  <View style={styles.rowCopy}>
                    <RNText style={styles.title}>Tiffins Bread Service</RNText>
                    <RNText style={styles.subtitle}>Tiffins Restaurant · Appetizers · $14</RNText>
                  </View>
                  <RNText style={styles.chevron}>›</RNText>
                </Pressable>
              </RNHostView>
            </ContextMenu.Trigger>

            <ContextMenu.Preview>
              <RNHostView matchContents>
                <View style={styles.preview}>
                  <View style={styles.previewArtwork}>
                    <RNText style={styles.previewMark}>BITE</RNText>
                    <RNText style={styles.previewEyebrow}>NATIVE SWIFTUI PREVIEW</RNText>
                  </View>
                  <View style={styles.previewCopy}>
                    <RNText style={styles.previewTitle}>Tiffins Bread Service</RNText>
                    <RNText style={text.bodyMuted}>
                      Pomegranate molasses, muhammara, zhough, and house-made bread.
                    </RNText>
                    <RNText style={styles.previewHint}>
                      Use the native actions below. Tap the normal row to open fully.
                    </RNText>
                  </View>
                </View>
              </RNHostView>
            </ContextMenu.Preview>
          </ContextMenu>

          <SwipeActions.Actions edge="trailing" allowsFullSwipe={false}>
            <Button
              label="Need It"
              systemImage="star"
              modifiers={[tint('#5A6CF2')]}
              onPress={() => onEvent('Need It selected from native swipe actions')}
            />
            <Button
              label="Got It"
              systemImage="checkmark.circle"
              modifiers={[tint(COLORS.gold)]}
              onPress={() => onEvent('Got It selected from native swipe actions')}
            />
            <Button
              label="Love It"
              systemImage="heart"
              modifiers={[tint('#D22AD6')]}
              onPress={() => onEvent('Love It selected from native swipe actions')}
            />
          </SwipeActions.Actions>
        </SwipeActions>
      </List>
    </Host>
  );
}

const styles = StyleSheet.create({
  row: {
    height: 84,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: SPACING.lg,
    backgroundColor: COLORS.surface,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
  },
  rowCopy: { flex: 1, minWidth: 0 },
  title: {
    fontFamily: FONT_FAMILY.interSemiBold,
    fontSize: 17,
    color: COLORS.ink,
  },
  subtitle: {
    ...text.bodyMuted,
    marginTop: SPACING.xs,
  },
  chevron: {
    fontFamily: FONT_FAMILY.interRegular,
    fontSize: 28,
    color: COLORS.dim,
    marginLeft: SPACING.sm,
  },
  preview: {
    width: 300,
    overflow: 'hidden',
    borderRadius: RADII.lg,
    backgroundColor: COLORS.surface,
  },
  previewArtwork: {
    height: 132,
    justifyContent: 'flex-end',
    padding: SPACING.lg,
    backgroundColor: COLORS.pineLight,
  },
  previewMark: {
    fontFamily: FONT_FAMILY.workSansExtraBold,
    fontSize: 30,
    color: COLORS.forest,
  },
  previewEyebrow: {
    fontFamily: FONT_FAMILY.interBold,
    fontSize: 10,
    letterSpacing: 0.7,
    color: COLORS.muted,
  },
  previewCopy: { padding: SPACING.lg, gap: SPACING.sm },
  previewTitle: {
    fontFamily: FONT_FAMILY.frauncesSemiBold,
    fontSize: 23,
    color: COLORS.ink,
  },
  previewHint: {
    fontFamily: FONT_FAMILY.interSemiBold,
    fontSize: 12,
    color: COLORS.forest,
  },
});
