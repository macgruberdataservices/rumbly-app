// Mail-style "only one row swiped open at a time" coordination for
// MenuItemRow/ItemResultRow's Need It/Got It/Love It reveal. A plain
// module-level singleton (not context) since there's only ever one
// legitimately-open swipe row across the whole app at once, and every
// row already reaches this module directly -- no provider wiring needed.
import type { Swipeable } from 'react-native-gesture-handler';

let openSwipeable: Swipeable | null = null;

export function registerSwipeableOpen(swipeable: Swipeable) {
  if (openSwipeable && openSwipeable !== swipeable) {
    openSwipeable.close();
  }
  openSwipeable = swipeable;
}

export function unregisterSwipeable(swipeable: Swipeable) {
  if (openSwipeable === swipeable) {
    openSwipeable = null;
  }
}

// Called on any other interaction a still-open row should not survive --
// scrolling the list, long-pressing a different row, etc.
export function closeOpenSwipeable() {
  openSwipeable?.close();
  openSwipeable = null;
}
