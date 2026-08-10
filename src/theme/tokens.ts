// Shared visual system. Semantic names remain stable while the presentation
// evolves, keeping feature components independent from literal color values.

export const COLORS = {
  forest: '#8AC7E1',
  pine: '#8AC7E1',
  pineLight: '#BDE5F1',
  gold: '#EEB853',
  goldLight: '#FFF8EE',
  cream: '#F7FBFC',
  surface: '#FFFFFF',
  ink: '#17282D',
  muted: '#53656B',
  dim: '#708288',
  border: '#C8D7DA',
  borderMid: '#B7D1D7',
  barkBrown: '#8AC7E1',
  wordmarkCream: '#FFFFFF',
  menuHeaderText: '#17282D',
  menuHeaderSubtext: '#53656B',
} as const;

// Light-first, high-contrast palette for surfaces that are likely to be
// read outdoors. Kept separate from the historical semantic aliases above
// so the daylight restyle can roll through the app in controlled slices
// without silently changing the meaning of hundreds of older call sites.
export const DAYLIGHT = {
  paper: '#FFFDF8',
  mist: '#F7FBFC',
  sky: '#DCEFF3',
  ocean: '#1E6278',
  oceanPressed: '#174B5C',
  coral: '#D96F4D',
  sun: '#EEB853',
  amberInk: '#795000',
  sage: '#64B48F',
  ink: '#17282D',
  muted: '#53656B',
  border: '#B7D1D7',
  open: '#3B6D11',
} as const;

// Category/tile accent palette (color-and-shapes pass, 2026-08-09).
// COLORS.forest / .pine / .barkBrown are leftover names from what was
// evidently once a differentiated woodland-themed palette -- all three
// have drifted to point at the exact same blue, #8AC7E1. That's why
// arrays like ExploreHomeScreen's CARD_COLORS, which look like they cycle
// through 8 distinct colors, actually only cycle through ~3 in practice.
//
// These four are genuinely distinct hues, deliberately chosen at roughly
// matched lightness/chroma so cycling through them reads as "lively" (hue
// variety at consistent intensity) rather than one color dominating the
// others -- the actual mechanism behind why category-tile grids in apps
// like Grab feel alive. White text stays legible on all four. Use ONLY as
// bounded fills -- tiles, badges, illustration accents -- never as body
// text or a full-screen background, so the core blue/gold brand identity
// (COLORS.forest / COLORS.gold) stays the dominant read everywhere else.
export const TILE_COLORS = {
  blue: '#5FA8C7',
  gold: '#EEB853',
  terracotta: '#DB7A57',
  sage: '#64B48F',
} as const;

// Deeper shades of the two brand hues, for contexts that need more visual
// weight than the pale tints in COLORS provide -- e.g. a colored hero
// band, a primary CTA's pressed state. The existing ramp had a light tint
// (pineLight, goldLight) but nothing at the dark end, so there was no way
// to add weight without leaving the brand hue family entirely. Not wired
// into any screen yet -- staged for the next hero-band pass.
export const DEEP = {
  ocean: '#2E6E85',
  amber: '#C98A28',
} as const;

export const RADII = {
  sm: 10,
  md: 14,
  lg: 18,
  xl: 24,
} as const;

export const SPACING = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
} as const;
