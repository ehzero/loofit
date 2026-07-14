export const HOME_WIDGET_GUIDE_DISMISSED_SETTING_KEY = 'home_widget_guide_dismissed';
export const HOME_WIDGET_GUIDE_DISMISSED_SETTING_VALUE = '1';

export type HomeWidgetGuideDismissal = 'loading' | 'visible' | 'dismissed';

export function resolveHomeWidgetGuideDismissal(
  savedValue: string | null
): HomeWidgetGuideDismissal {
  return savedValue === HOME_WIDGET_GUIDE_DISMISSED_SETTING_VALUE ? 'dismissed' : 'visible';
}

export function shouldShowHomeWidgetGuide({
  hasRoutine,
  dismissal,
}: {
  hasRoutine: boolean;
  dismissal: HomeWidgetGuideDismissal;
}): boolean {
  return hasRoutine && dismissal === 'visible';
}
