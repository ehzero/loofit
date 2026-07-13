import type { ThemeColors } from '@/src/theme/tokens';

import { WIDGET_RENDERER_CONTRACT } from './widget-spec';

export const WIDGET_DESIGN_SYSTEM = WIDGET_RENDERER_CONTRACT.designSystem;

export type WidgetColorRole = keyof typeof WIDGET_DESIGN_SYSTEM.colorRoles;

export function widgetColor(colors: ThemeColors, role: WidgetColorRole): string {
  const paletteKey = WIDGET_DESIGN_SYSTEM.colorRoles[role] as keyof ThemeColors;
  return colors[paletteKey];
}
