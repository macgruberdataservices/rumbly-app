import type { Restaurant } from '../data/types';

export const ILLUSTRATION_SPECS = {
  'find.editorial.feature-card.v1': {
    label: 'Editorial feature',
    brief: 'Flexible scene for a curated story card. Leave the left third quiet for overlaid copy.',
    backgroundColor: '#F4C969',
    accentColor: '#1E6278',
  },
  'find.editorial.seasonal-overview.v1': {
    label: 'Seasonal overview',
    brief: 'A celebratory food-discovery scene with two or three generic treats and restrained confetti.',
    backgroundColor: '#F4C969',
    accentColor: '#D96F4D',
  },
  'find.editorial.food-crawl.v1': {
    label: 'Food crawl',
    brief: 'A simple path joining three distinct food stops; should suggest wandering without depicting a park map.',
    backgroundColor: '#DCEFF3',
    accentColor: '#1E6278',
  },
  'find.state.empty-search.v1': {
    label: 'No matches',
    brief: 'An upbeat empty plate or open field-guide page; reassuring, not disappointed.',
    backgroundColor: '#FFF8EE',
    accentColor: '#D96F4D',
  },
  'find.state.offline.v1': {
    label: 'Offline',
    brief: 'A compact field guide with a subtle disconnected signal; calm and useful rather than alarming.',
    backgroundColor: '#DCEFF3',
    accentColor: '#1E6278',
  },
  'explore.editorial.challenge.v1': {
    label: 'Challenge',
    brief: 'A finish marker and a small set of food tokens, suitable for badges and challenge introductions.',
    backgroundColor: '#D8EEE4',
    accentColor: '#24684C',
  },
  'explore.editorial.exclusive-items.v1': {
    label: 'Limited-time menu finds',
    brief: 'A ticket stub, short food trail, and celebratory star for event-exclusive menus; generic enough to work across seasons.',
    backgroundColor: '#F8E5B9',
    accentColor: '#D96F4D',
  },
  'journal.state.empty.v1': {
    label: 'Empty journal',
    brief: 'An open notebook with one friendly food-memory mark and generous empty space.',
    backgroundColor: '#FFF8EE',
    accentColor: '#795000',
  },
  'journal.hero.memory-book.v1': {
    label: 'Dining memory book',
    brief: 'An open field journal with a taped photo corner, a tiny location mark, and one celebratory sparkle.',
    backgroundColor: '#F4C969',
    accentColor: '#1E6278',
  },
  'journal.composer.capture-memory.v1': {
    label: 'Capture a memory',
    brief: 'A compact notebook, camera frame, and date marker arranged as a tidy still life with no people.',
    backgroundColor: '#D8EEE4',
    accentColor: '#24684C',
  },
  'my-rumbly.hero.collection.v1': {
    label: 'Your park-day story',
    brief: 'A loose trail connecting a bookmark, food token, journal page, and star; energetic but not a literal map.',
    backgroundColor: '#F4C969',
    accentColor: '#1E6278',
  },
  'ask.hero.companion.v1': {
    label: 'Dining sidekick',
    brief: 'A field guide, location pin, and small question bubble composed as useful tools, with no character or face.',
    backgroundColor: '#F4C969',
    accentColor: '#1E6278',
  },
  'activity.state.empty.v1': {
    label: 'Ready to collect',
    brief: 'Three empty but inviting collection tokens for Love It, Need It, and Got It; no sad or disappointed imagery.',
    backgroundColor: '#E7E2F2',
    accentColor: '#59477E',
  },
  'changes.hero.whats-new.v1': {
    label: 'What changed',
    brief: 'A menu card with two lively update marks and a small price tag; factual and upbeat rather than urgent.',
    backgroundColor: '#F4C969',
    accentColor: '#D96F4D',
  },
  'menu.category.drinks.v1': {
    label: 'Drinks',
    brief: 'Generic hot and cold drink vessels; no branded cup, garnish, or specific menu-item claim.',
    backgroundColor: '#DCEFF3',
    accentColor: '#1E6278',
  },
  'menu.category.sweets.v1': {
    label: 'Something sweet',
    brief: 'One generic soft-serve or pastry silhouette with a small sparkle; not a depiction of a listed item.',
    backgroundColor: '#F5DFE5',
    accentColor: '#8A3F5B',
  },
  'menu.category.breakfast.v1': {
    label: 'Breakfast',
    brief: 'Sunrise, mug, and simple breakfast plate shapes with no restaurant-specific food.',
    backgroundColor: '#F8E5B9',
    accentColor: '#795000',
  },
  'menu.category.snacks.v1': {
    label: 'Snacks and shares',
    brief: 'A small tray with two shareable, abstract bite shapes; playful but clearly generic.',
    backgroundColor: '#E7E2F2',
    accentColor: '#59477E',
  },
  'menu.category.kids.v1': {
    label: 'For kids',
    brief: 'Three simple, friendly food shapes arranged like building blocks; no faces or characters.',
    backgroundColor: '#E0EEDC',
    accentColor: '#356B2D',
  },
  'menu.category.entrees.v1': {
    label: 'Menu pick',
    brief: 'A neutral plate-and-cutlery composition for uncategorized savory menu recommendations.',
    backgroundColor: '#E3F1F4',
    accentColor: '#1E6278',
  },
  'restaurant.identity.quick-service.v1': {
    label: 'Quick service',
    brief: 'Counter-service tray and directional motion lines; designed as a reusable restaurant identity, not venue art.',
    backgroundColor: '#DCEFF3',
    accentColor: '#1E6278',
  },
  'restaurant.identity.table-service.v1': {
    label: 'Table service',
    brief: 'Place setting with a small menu card and a calm, composed rhythm.',
    backgroundColor: '#F3D4C9',
    accentColor: '#8A3F27',
  },
  'restaurant.identity.lounge-bar.v1': {
    label: 'Lounge and bar',
    brief: 'Two generic glass silhouettes and a crescent accent; polished rather than nightlife-heavy.',
    backgroundColor: '#E7E2F2',
    accentColor: '#59477E',
  },
  'restaurant.identity.kiosk-cart.v1': {
    label: 'Kiosk and cart',
    brief: 'Compact service window or cart canopy with one bold geometric accent.',
    backgroundColor: '#F8E5B9',
    accentColor: '#795000',
  },
  'restaurant.identity.bakery-cafe.v1': {
    label: 'Bakery and café',
    brief: 'Mug and pastry outline with a quiet steam curve; generic and reusable.',
    backgroundColor: '#D8EEE4',
    accentColor: '#24684C',
  },
} as const;

export type IllustrationTagId = keyof typeof ILLUSTRATION_SPECS;

export function illustrationTagForMenuItem(
  category: string | null | undefined,
  itemName: string
): IllustrationTagId {
  const normalizedItem = itemName.toLocaleLowerCase();
  const normalizedCategory = (category ?? '').toLocaleLowerCase();

  // Item names are the strongest signal. Some seasonal records use the
  // festival name as their category (for example "Food & Wine Festival
  // Offering"), so combining both strings would classify every burger in
  // that collection as a drink.
  if (/(dessert|sweet|cake|cookie|brownie|churro|donut|doughnut|pastry|ice cream|soft-serve|sundae|gelato|mousse|pudding)/.test(normalizedItem)) {
    return 'menu.category.sweets.v1';
  }
  if (/(breakfast|brunch|pancake|waffle|omelet|omelette|frittata)/.test(normalizedItem)) {
    return 'menu.category.breakfast.v1';
  }
  if (/(drink|beverage|cocktail|mocktail|wine|beer|ale|lager|coffee|latte|espresso|tea|lemonade|slush|smoothie|shake)/.test(normalizedItem)) {
    return 'menu.category.drinks.v1';
  }
  if (/(snack|appetizer|starter|shareable|side|popcorn|pretzel)/.test(normalizedItem)) {
    return 'menu.category.snacks.v1';
  }
  if (/(kids|children)/.test(normalizedItem)) {
    return 'menu.category.kids.v1';
  }

  const categoryIsEditorial = /(festival|seasonal|offering|featured|favorite)/.test(normalizedCategory);
  if (categoryIsEditorial) {
    return 'menu.category.entrees.v1';
  }
  if (/(drink|beverage|cocktail|mocktail|wine|beer|coffee|tea)/.test(normalizedCategory)) {
    return 'menu.category.drinks.v1';
  }
  if (/(dessert|sweet|bakery|pastry|ice cream|soft-serve)/.test(normalizedCategory)) {
    return 'menu.category.sweets.v1';
  }
  if (/(breakfast|brunch)/.test(normalizedCategory)) {
    return 'menu.category.breakfast.v1';
  }
  if (/(snack|appetizer|starter|shareable|side)/.test(normalizedCategory)) {
    return 'menu.category.snacks.v1';
  }
  if (/(kids|children)/.test(normalizedCategory)) {
    return 'menu.category.kids.v1';
  }
  return 'menu.category.entrees.v1';
}

export function illustrationTagForRestaurant(
  restaurant: Pick<Restaurant, 'experience_type' | 'service_style'>
): IllustrationTagId {
  const normalized = `${restaurant.experience_type ?? ''} ${restaurant.service_style ?? ''}`.toLocaleLowerCase();
  if (/(table|character|signature|fine)/.test(normalized)) {
    return 'restaurant.identity.table-service.v1';
  }
  if (/(lounge|bar|pub)/.test(normalized)) {
    return 'restaurant.identity.lounge-bar.v1';
  }
  if (/(kiosk|cart|market|stand)/.test(normalized)) {
    return 'restaurant.identity.kiosk-cart.v1';
  }
  if (/(bakery|cafe|café|coffee)/.test(normalized)) {
    return 'restaurant.identity.bakery-cafe.v1';
  }
  return 'restaurant.identity.quick-service.v1';
}
