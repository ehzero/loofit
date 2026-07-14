import { Feather, MaterialCommunityIcons } from '@expo/vector-icons';
import type { ComponentType } from 'react';

// Semantic icon names mapped to @expo/vector-icons glyphs. The design
// (루핏.dc.html) uses thin line SVGs, so we default to Feather and reach for
// MaterialCommunityIcons only where Feather lacks a fitting glyph (dumbbell).
type IconSet = { Component: ComponentType<{ name: never; size?: number; color?: string }>; glyph: string };

const feather = (glyph: string): IconSet => ({ Component: Feather as never, glyph });
const mci = (glyph: string): IconSet => ({ Component: MaterialCommunityIcons as never, glyph });

const ICONS = {
  home: feather('home'),
  records: feather('list'),
  dashboard: feather('bar-chart-2'),
  settings: feather('settings'),
  chevronRight: feather('chevron-right'),
  chevronLeft: feather('chevron-left'),
  chevronUp: feather('chevron-up'),
  chevronDown: feather('chevron-down'),
  check: feather('check'),
  close: feather('x'),
  trash: feather('trash-2'),
  bolt: feather('zap'),
  info: feather('info'),
  moon: feather('moon'),
  sun: feather('sun'),
  edit: feather('sliders'),
  plus: feather('plus'),
  minus: feather('minus'),
  download: feather('download'),
  widget: feather('grid'),
  dumbbell: mci('dumbbell'),
} satisfies Record<string, IconSet>;

export type IconName = keyof typeof ICONS;

type IconProps = {
  name: IconName;
  size?: number;
  color: string;
};

export function Icon({ name, size = 20, color }: IconProps) {
  const { Component, glyph } = ICONS[name];
  return <Component name={glyph as never} size={size} color={color} />;
}
