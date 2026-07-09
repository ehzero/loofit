// Design tokens ported from 핏로그.dc.html.
// The design is dark-first with a light variant and a swappable accent color.

import type { TextStyle } from 'react-native';

export type ThemeScheme = 'dark' | 'light';
export type ThemeMode = 'system' | ThemeScheme;

// ---- Layout scales ----------------------------------------------------
// Every spacing/radius in the UI must come from these scales; ad-hoc values
// drift (audit found 17 distinct radii before this existed).

export const spacing = {
  xxs: 4,
  xs: 8,
  sm: 12,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
} as const;

export const radius = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  pill: 999,
} as const;

// ---- Typography scale --------------------------------------------------
// Variant = size + default weight. Screens override weight/color only when
// the variant's default doesn't fit.

export type TypeVariant =
  | 'caption'
  | 'label'
  | 'footnote'
  | 'body'
  | 'item'
  | 'cta'
  | 'title'
  | 'heading'
  | 'display'
  | 'hero'
  | 'timer';

export const typeScale: Record<TypeVariant, TextStyle> = {
  caption: { fontSize: 10, fontWeight: '700' },
  label: { fontSize: 12, fontWeight: '700' },
  footnote: { fontSize: 13, fontWeight: '600' },
  body: { fontSize: 14, fontWeight: '600', lineHeight: 20 },
  item: { fontSize: 15, fontWeight: '700' },
  cta: { fontSize: 17, fontWeight: '800' },
  title: { fontSize: 18, fontWeight: '800' },
  heading: { fontSize: 22, fontWeight: '800', letterSpacing: -0.3 },
  display: { fontSize: 26, fontWeight: '800', letterSpacing: -0.5 },
  hero: { fontSize: 42, fontWeight: '800', letterSpacing: -1, lineHeight: 44 },
  timer: { fontSize: 74, fontWeight: '800', letterSpacing: -2, fontVariant: ['tabular-nums'] },
};

export type ThemePalette = {
  bg: string;
  bg2: string;
  phone: string;
  card: string;
  g1: string;
  g2: string;
  surface2: string;
  chip: string;
  border: string;
  border2: string;
  line: string;
  nav: string;
  navb: string;
  tx: string;
  tx2: string;
  tx3: string;
  tx4: string;
  tx5: string;
  tx6: string;
  handle: string;
  grip: string;
  heat0: string;
  heatbase: string;
  heatoff: string;
  danger: string;
  /** Emphasis color for in-progress states (e.g. "진행 중" badges). */
  warning: string;
  /** Solid destructive-action background (confirm dialogs). */
  dangerSolid: string;
};

export type ThemeColors = ThemePalette & {
  accent: string;
  accentText: string;
};

export const DARK_PALETTE: ThemePalette = {
  bg: '#050506',
  bg2: '#101015',
  phone: '#0A0A0C',
  card: '#141416',
  g1: '#18181D',
  g2: '#101013',
  surface2: '#1B1B1F',
  chip: '#1E1E22',
  border: '#26262A',
  border2: '#2A2A2F',
  line: '#212125',
  nav: '#0C0C0E',
  navb: '#1C1C20',
  tx: '#F4F4F2',
  tx2: '#C9C9CE',
  tx3: '#8A8A90',
  tx4: '#7C7C82',
  tx5: '#5C5C62',
  tx6: '#4C4C52',
  handle: '#2A2A2E',
  grip: '#2E2E33',
  heat0: '#1B1B1F',
  heatbase: '#16161A',
  heatoff: 'rgba(255,255,255,0.04)',
  danger: '#C87A7A',
  warning: '#F5A623',
  dangerSolid: '#E05555',
};

export const LIGHT_PALETTE: ThemePalette = {
  bg: '#E6E6E9',
  bg2: '#F4F4F6',
  phone: '#FFFFFF',
  card: '#F5F5F6',
  g1: '#FCFCFD',
  g2: '#F0F0F2',
  surface2: '#EDEDEF',
  chip: '#ECECEF',
  border: '#E4E4E7',
  border2: '#DBDBDF',
  line: '#EBEBEE',
  nav: '#FBFBFC',
  navb: '#E7E7EA',
  tx: '#17171A',
  tx2: '#3A3A40',
  tx3: '#6A6A71',
  tx4: '#78787F',
  tx5: '#A2A2A8',
  tx6: '#BEBEC4',
  handle: '#D2D2D7',
  grip: '#D2D2D7',
  heat0: '#E7E7EB',
  heatbase: '#FFFFFF',
  heatoff: 'rgba(0,0,0,0.045)',
  danger: '#C0392B',
  warning: '#E8930C',
  dangerSolid: '#E05555',
};

export const DEFAULT_ACCENT = '#CFF56A';

export const ACCENT_OPTIONS = [
  '#CFF56A',
  '#F5A623',
  '#5AC8FA',
  '#FF6B6B',
  '#B08CFF',
  '#EDEDED',
] as const;

function parseHex(hex: string): { r: number; g: number; b: number } {
  const value = hex.replace('#', '');
  return {
    r: parseInt(value.substring(0, 2), 16),
    g: parseInt(value.substring(2, 4), 16),
    b: parseInt(value.substring(4, 6), 16),
  };
}

function toHex({ r, g, b }: { r: number; g: number; b: number }): string {
  const channel = (n: number) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return `#${channel(r)}${channel(g)}${channel(b)}`;
}

/** Mirrors CSS `color-mix(in srgb, a weight%, b)` with a simple sRGB channel lerp. */
export function mixHex(a: string, b: string, weight: number): string {
  const ca = parseHex(a);
  const cb = parseHex(b);
  return toHex({
    r: ca.r * weight + cb.r * (1 - weight),
    g: ca.g * weight + cb.g * (1 - weight),
    b: ca.b * weight + cb.b * (1 - weight),
  });
}

/** Perceived-brightness test used to pick contrasting text on the accent color. */
export function isLightHex(hex: string): boolean {
  const { r, g, b } = parseHex(hex);
  return (0.299 * r + 0.587 * g + 0.114 * b) / 255 > 0.62;
}

export function accentTextFor(accent: string): string {
  return isLightHex(accent) ? '#0B0B0B' : '#FFFFFF';
}

export function makeColors(scheme: ThemeScheme, accent: string): ThemeColors {
  const palette = scheme === 'light' ? LIGHT_PALETTE : DARK_PALETTE;
  return {
    ...palette,
    accent,
    accentText: accentTextFor(accent),
  };
}

/**
 * Heatmap cell color for a duration bucket (0-4), matching the design's
 * accent-mixed ramp. `inRange = false` renders the out-of-range placeholder.
 */
export function heatColor(colors: ThemeColors, bucket: number, inRange = true): string {
  if (!inRange) {
    return colors.heatoff;
  }
  switch (bucket) {
    case 1:
      return mixHex(colors.accent, colors.heatbase, 0.24);
    case 2:
      return mixHex(colors.accent, colors.heatbase, 0.48);
    case 3:
      return mixHex(colors.accent, colors.heatbase, 0.74);
    case 4:
      return colors.accent;
    default:
      return colors.heat0;
  }
}
