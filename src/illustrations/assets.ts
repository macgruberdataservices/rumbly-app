import type { ImageSourcePropType } from 'react-native';
import type { IllustrationTagId } from './catalog';

// The only illustration swap point in the app. When a final asset exists,
// add one static require here; every slot using that tag updates at once.
// Example:
// 'menu.category.drinks.v1': require('../../assets/illustrations/menu-category-drinks-v1.png'),
export const ILLUSTRATION_ASSETS: Partial<Record<IllustrationTagId, ImageSourcePropType>> = {};
