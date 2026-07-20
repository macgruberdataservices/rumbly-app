// Restaurant-level taxonomy for the search spec's "Related" result
// category. Deliberately built from the pipeline's already-normalized
// restaurant fields (cuisine_tags, is_character_dining, service_style,
// experience_type, meal_periods) rather than raw_facets — see
// Docs/ROADMAP.md's 2026-07-19 data-spike resolution (open question #4)
// for why: raw_facets is Disney's raw, duplicative internal
// marketing/filter metadata (three different spellings of "lounge" split
// across two facet groups, no single count), while these fields are the
// pipeline's own single source of truth for the same underlying facts.

import type { Restaurant } from '../data/types';

export type RelatedKind =
  | 'cuisine'
  | 'character_dining'
  | 'buffet_prix_fixe'
  | 'lounge'
  | 'service_type'
  | 'meal_type';

export interface RelatedTag {
  kind: RelatedKind;
  value: string;
  label: string;
}

// cuisine_tags are lowercase, sometimes slash-joined ("cajun/creole") —
// capitalize after any whitespace/slash boundary, not just the first
// character.
function titleCase(s: string): string {
  return s.replace(/(^|[\s/])([a-z])/g, (_match, sep: string, ch: string) => sep + ch.toUpperCase());
}

export function tagsEqual(a: RelatedTag | null, b: RelatedTag | null): boolean {
  if (!a || !b) return a === b;
  return a.kind === b.kind && a.value === b.value;
}

export function collectRelatedTags(restaurants: Restaurant[]): RelatedTag[] {
  const seen = new Map<string, RelatedTag>();
  const add = (kind: RelatedKind, value: string, label: string) => {
    const key = `${kind}:${value}`;
    if (!seen.has(key)) seen.set(key, { kind, value, label });
  };

  for (const r of restaurants) {
    for (const c of r.cuisine_tags) add('cuisine', c, titleCase(c));
    if (r.is_character_dining) add('character_dining', 'true', 'Character Dining');
    if (r.service_style === 'Buffet' || r.service_style === 'Prix Fixe' || r.service_style === 'Family Style') {
      add('buffet_prix_fixe', r.service_style, r.service_style);
    }
    if (r.experience_type === 'Bar / Lounge') add('lounge', 'Bar / Lounge', 'Lounges');
    if (r.experience_type) add('service_type', r.experience_type, r.experience_type);
    for (const mp of r.meal_periods) add('meal_type', mp, mp);
  }

  return Array.from(seen.values());
}

export function restaurantHasRelatedTag(r: Restaurant, tag: RelatedTag): boolean {
  switch (tag.kind) {
    case 'cuisine':
      return r.cuisine_tags.includes(tag.value);
    case 'character_dining':
      return r.is_character_dining;
    case 'buffet_prix_fixe':
      return r.service_style === tag.value;
    case 'lounge':
      return r.experience_type === 'Bar / Lounge';
    case 'service_type':
      return r.experience_type === tag.value;
    case 'meal_type':
      return r.meal_periods.includes(tag.value);
    default:
      return false;
  }
}
