// Shared visual system. Semantic names remain stable while the presentation
// evolves, keeping feature components independent from literal color values.

export const COLORS = {
  forest: '#8AC7E1',
  pine: '#8AC7E1',
  pineLight: '#BDE5F1',
  gold: '#EEB853',
  goldLight: '#FFFCF5',
  cream: '#F5FBFD',
  surface: '#FFFFFF',
  ink: '#202A2E',
  muted: '#65747B',
  dim: '#94A5AA',
  border: '#D5EEF4',
  borderMid: '#BDE5F1',
  barkBrown: '#8AC7E1',
  wordmarkCream: '#FFFFFF',
  menuHeaderText: '#202A2E',
  menuHeaderSubtext: '#65747B',
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
