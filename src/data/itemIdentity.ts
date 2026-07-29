// Item activity is restaurant-scoped. Disney can repeat the same item_id
// across meal periods/categories at one restaurant and can also reuse an
// item_id at different restaurants. Keep every consumer on this one
// identity contract so presentation context never accidentally partitions
// Need It, Got It, Love It, ratings, or Journal history.

export interface ItemIdentitySource {
  restaurant_id: string;
  item_id: string;
}

export function getItemIdentityKey(restaurantId: string, itemId: string): string {
  return `${restaurantId}:${itemId}`;
}

export function getItemIdentityKeyFor(item: ItemIdentitySource): string {
  return getItemIdentityKey(item.restaurant_id, item.item_id);
}

export function hasSameItemIdentity(
  left: ItemIdentitySource,
  right: ItemIdentitySource
): boolean {
  return left.restaurant_id === right.restaurant_id && left.item_id === right.item_id;
}

export function dedupeByItemIdentity<T extends ItemIdentitySource>(items: readonly T[]): T[] {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = getItemIdentityKeyFor(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Rows that share activity identity still need distinct anchors for
// scrolling, highlighting, previews, and native menu interactions.
export function getItemPresentationKey(
  restaurantId: string,
  itemId: string,
  rowAnchor: string
): string {
  return JSON.stringify([restaurantId, itemId, rowAnchor]);
}
