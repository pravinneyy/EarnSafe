// ─── EarnSafe Design System ─────────────────────────────────────
// Navy Blue (Trust) + Emerald Green (Success/Payouts)
// Dual palette: lightColors & darkColors, with improved contrast

// ── Shared scales (never change between themes) ────────────────
const navy = {
  900: '#080E1A',
  800: '#0F1D32',
  700: '#162744',
  600: '#1E3050',
  500: '#2A3F6B',
  400: '#3D5A99',
  300: '#6B87BF',
  200: '#94A3B8',
  100: '#CBD5E1',
  50: '#E2E8F0',
};

const emerald = {
  700: '#047857',
  600: '#059669',
  500: '#10B981',
  400: '#34D399',
  300: '#6EE7B7',
  200: '#A7F3D0',
  100: '#D1FAE5',
  50: '#ECFDF5',
};

// ── DARK PALETTE ───────────────────────────────────────────────
export const darkColors = {
  // Navy scale (expose for direct use)
  navy900: navy[900], navy800: navy[800], navy700: navy[700],
  navy600: navy[600], navy500: navy[500], navy400: navy[400],
  navy300: navy[300], navy200: navy[200], navy100: navy[100], navy50: navy[50],

  // Emerald scale
  emerald700: emerald[700], emerald600: emerald[600], emerald500: emerald[500],
  emerald400: emerald[400], emerald300: emerald[300], emerald200: emerald[200],
  emerald100: emerald[100], emerald50: emerald[50],

  // Surfaces — wider contrast gaps
  background: '#080E1A',
  surface: '#111B2E',
  surfaceElevated: '#1A2740',
  surfaceMuted: '#223352',
  surfaceNavy: '#0F1D32',

  // Borders — visible on dark
  border: '#2A3F6B',
  borderLight: '#1E3050',
  borderNavy: '#2A3F6B',

  // Text — high contrast
  text: '#F8FAFC',
  textSecondary: '#94A3B8',
  textMuted: '#64748B',
  textOnDark: '#F8FAFC',
  textOnDarkMuted: '#94A3B8',

  // Primary
  primary: '#2A3F6B',
  primarySoft: '#1A2740',
  primaryBorder: '#3D5A99',

  // Accent
  accent: '#10B981',
  accentDark: '#059669',
  accentSoft: 'rgba(16, 185, 129, 0.15)',
  accentBorder: 'rgba(16, 185, 129, 0.35)',

  // Semantic
  success: '#10B981',
  successSoft: 'rgba(16, 185, 129, 0.15)',
  successBorder: 'rgba(16, 185, 129, 0.35)',

  warning: '#F59E0B',
  warningSoft: 'rgba(245, 158, 11, 0.15)',
  warningBorder: 'rgba(245, 158, 11, 0.35)',

  danger: '#EF4444',
  dangerSoft: 'rgba(239, 68, 68, 0.15)',
  dangerBorder: 'rgba(239, 68, 68, 0.35)',

  info: '#3B82F6',
  infoSoft: 'rgba(59, 130, 246, 0.15)',
  infoBorder: 'rgba(59, 130, 246, 0.35)',

  // Misc
  overlay: 'rgba(8, 14, 26, 0.75)',
  mapOverlay: 'rgba(8, 14, 26, 0.85)',
  white: '#FFFFFF',
  black: '#000000',

  // Auth hero
  heroGradientStart: '#0F1D32',
  heroGradientEnd: '#162744',
  cardBackground: '#111B2E',
};

// ── LIGHT PALETTE ──────────────────────────────────────────────
export const lightColors = {
  navy900: navy[900], navy800: navy[800], navy700: navy[700],
  navy600: navy[600], navy500: navy[500], navy400: navy[400],
  navy300: navy[300], navy200: navy[200], navy100: navy[100], navy50: navy[50],

  emerald700: emerald[700], emerald600: emerald[600], emerald500: emerald[500],
  emerald400: emerald[400], emerald300: emerald[300], emerald200: emerald[200],
  emerald100: emerald[100], emerald50: emerald[50],

  // Surfaces
  background: '#F0F4F8',
  surface: '#FFFFFF',
  surfaceElevated: '#FFFFFF',
  surfaceMuted: '#E2E8F0',
  surfaceNavy: '#0F1D32',

  // Borders
  border: '#CBD5E1',
  borderLight: '#E2E8F0',
  borderNavy: '#1E3050',

  // Text
  text: '#0F172A',
  textSecondary: '#475569',
  textMuted: '#94A3B8',
  textOnDark: '#F8FAFC',
  textOnDarkMuted: '#94A3B8',

  // Primary
  primary: '#1E3050',
  primarySoft: '#E2E8F0',
  primaryBorder: '#94A3B8',

  // Accent
  accent: '#059669',
  accentDark: '#047857',
  accentSoft: '#ECFDF5',
  accentBorder: '#A7F3D0',

  // Semantic
  success: '#059669',
  successSoft: '#ECFDF5',
  successBorder: '#A7F3D0',

  warning: '#D97706',
  warningSoft: '#FFFBEB',
  warningBorder: '#FCD34D',

  danger: '#DC2626',
  dangerSoft: '#FEF2F2',
  dangerBorder: '#FECACA',

  info: '#2563EB',
  infoSoft: '#EFF6FF',
  infoBorder: '#BFDBFE',

  // Misc
  overlay: 'rgba(15, 23, 42, 0.5)',
  mapOverlay: 'rgba(15, 23, 42, 0.7)',
  white: '#FFFFFF',
  black: '#000000',

  // Auth hero
  heroGradientStart: '#0F1D32',
  heroGradientEnd: '#1E3050',
  cardBackground: '#FFFFFF',
};

// Default export — starts as dark. ThemeContext mutates this on toggle.
export const colors = { ...darkColors };

export const spacing = {
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
  xxxl: 64,
};

export const radii = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 22,
  xl: 28,
  full: 999,
};

export const typography = {
  hero: { fontSize: 32, fontWeight: '800', letterSpacing: -0.5 },
  h1: { fontSize: 26, fontWeight: '700', letterSpacing: -0.3 },
  h2: { fontSize: 22, fontWeight: '700', letterSpacing: -0.2 },
  h3: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 15, fontWeight: '400', lineHeight: 22 },
  bodyBold: { fontSize: 15, fontWeight: '600', lineHeight: 22 },
  caption: { fontSize: 13, fontWeight: '500', lineHeight: 18 },
  small: { fontSize: 11, fontWeight: '600', letterSpacing: 0.5, textTransform: 'uppercase' },
  metric: { fontSize: 28, fontWeight: '700', letterSpacing: -0.5 },
};

export const shadows = {
  sm: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 6,
    elevation: 2,
  },
  card: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.1,
    shadowRadius: 12,
    elevation: 3,
  },
  elevated: {
    shadowColor: '#000000',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 24,
    elevation: 6,
  },
  glow: {
    shadowColor: '#10B981',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.35,
    shadowRadius: 12,
    elevation: 4,
  },
};
