import type { ImageSourcePropType } from 'react-native';
import type { IllustrationTagId } from './catalog';

// The only illustration swap point in the app. When a final asset exists,
// add one static require here; every slot using that tag updates at once.
// Example:
// 'menu.category.drinks.v1': require('../../assets/illustrations/menu-category-drinks-v1.png'),
//
// The artwork is transparent, so each slot's `backgroundColor` from
// ILLUSTRATION_SPECS still supplies the field color behind it. Vector sources
// live in Design/illustrations/; re-export with Design/illustrations/export.sh.
export const ILLUSTRATION_ASSETS: Partial<Record<IllustrationTagId, ImageSourcePropType>> = {
  'find.editorial.feature-card.v1': require('../../assets/illustrations/find-editorial-feature-card-v1.png'),
  'journal.hero.memory-book.v1': require('../../assets/illustrations/journal-hero-memory-book-v1.png'),
  'journal.composer.capture-memory.v1': require('../../assets/illustrations/journal-composer-capture-memory-v1.png'),
  'journal.state.empty.v1': require('../../assets/illustrations/journal-state-empty-v1.png'),
  'my-rumbly.hero.collection.v1': require('../../assets/illustrations/my-rumbly-hero-collection-v1.png'),
  'ask.hero.companion.v1': require('../../assets/illustrations/ask-hero-companion-v1.png'),
  'activity.state.empty.v1': require('../../assets/illustrations/activity-state-empty-v1.png'),
  'changes.hero.whats-new.v1': require('../../assets/illustrations/changes-hero-whats-new-v1.png'),
  'explore.editorial.challenge.v1': require('../../assets/illustrations/explore-editorial-challenge-v1.png'),
  'explore.editorial.exclusive-items.v1': require('../../assets/illustrations/explore-editorial-exclusive-items-v1.png'),
};
