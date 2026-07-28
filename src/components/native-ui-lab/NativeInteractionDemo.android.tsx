import { useState } from 'react';
import { StyleSheet, Text as RNText, View } from 'react-native';
import {
  DropdownMenu,
  DropdownMenuItem,
  Host,
  ListItem,
  Text,
} from '@expo/ui/jetpack-compose';
import {
  combinedClickable,
  fillMaxWidth,
} from '@expo/ui/jetpack-compose/modifiers';
import { COLORS, SPACING } from '../../theme/tokens';
import { FONT_FAMILY, text } from '../../theme/typography';

export function NativeInteractionDemo({ onEvent }: { onEvent: (message: string) => void }) {
  const [menuOpen, setMenuOpen] = useState(false);

  const choose = (label: string) => {
    setMenuOpen(false);
    onEvent(`${label} selected from the native Compose menu`);
  };

  return (
    <View>
      <Host seedColor={COLORS.forest} style={styles.host}>
        <DropdownMenu
          expanded={menuOpen}
          onDismissRequest={() => setMenuOpen(false)}
        >
          <DropdownMenu.Trigger>
            <ListItem
              colors={{
                containerColor: COLORS.surface,
                contentColor: COLORS.ink,
                supportingContentColor: COLORS.muted,
              }}
              modifiers={[
                fillMaxWidth(),
                combinedClickable({
                  onClick: () => onEvent('Row tapped — production navigation would open here'),
                  onLongClick: () => setMenuOpen(true),
                }),
              ]}
            >
              <ListItem.HeadlineContent>
                <Text style={{ fontWeight: '600', fontSize: 17 }}>Tiffins Bread Service</Text>
              </ListItem.HeadlineContent>
              <ListItem.SupportingContent>
                <Text style={{ fontSize: 13 }}>Tiffins Restaurant · Appetizers · $14</Text>
              </ListItem.SupportingContent>
            </ListItem>
          </DropdownMenu.Trigger>

          <DropdownMenu.Items>
            {['Need It', 'Got It', 'Love It'].map((label) => (
              <DropdownMenuItem key={label} onClick={() => choose(label)}>
                <DropdownMenuItem.Text>
                  <Text>{label}</Text>
                </DropdownMenuItem.Text>
              </DropdownMenuItem>
            ))}
          </DropdownMenu.Items>
        </DropdownMenu>
      </Host>
      <View style={styles.androidNote}>
        <RNText style={styles.androidNoteTitle}>ANDROID-NATIVE COMPARISON</RNText>
        <RNText style={text.bodyMuted}>
          Long-press uses Compose. The current Gesture Handler swipe row remains unchanged
          because Expo UI does not yet expose universal swipe actions.
        </RNText>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  host: { width: '100%', minHeight: 82 },
  androidNote: {
    padding: SPACING.md,
    borderRadius: 12,
    backgroundColor: COLORS.cream,
  },
  androidNoteTitle: {
    fontFamily: FONT_FAMILY.interBold,
    fontSize: 10,
    letterSpacing: 0.7,
    color: COLORS.forest,
    marginBottom: SPACING.xs,
  },
});
