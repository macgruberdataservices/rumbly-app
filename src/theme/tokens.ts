// Transcribed from Disney Dining Dev's Front_End/index.html :root CSS custom
// properties (the "parkguide" theme — the only theme actually in use).

export const COLORS = {
  forest: '#3B4A32',
  pine: '#2F5C3F',
  pineLight: '#6E8B5D',
  gold: '#B5651D',
  goldLight: '#F0DCC4',
  cream: '#DCD1BB',
  surface: '#FBF7EE',
  ink: '#2B2620',
  muted: '#6F6555',
  dim: '#A39A87',
  border: '#D4C39E',
  borderMid: '#C7B998',
  barkBrown: '#5A4632', // menu header background
  wordmarkCream: '#FFE9C7', // brand-script text on the forest header
  menuHeaderText: '#F5E6C8',
  menuHeaderSubtext: '#D9C7A0',
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
