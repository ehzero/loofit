import { describe, expect, it } from 'vitest';

import {
  HOME_WIDGET_GUIDE_DISMISSED_SETTING_VALUE,
  resolveHomeWidgetGuideDismissal,
  shouldShowHomeWidgetGuide,
} from './home-widget-guide';

describe('home widget guide', () => {
  it('shows only after a routine exists', () => {
    expect(shouldShowHomeWidgetGuide({ hasRoutine: true, dismissal: 'visible' })).toBe(true);
    expect(shouldShowHomeWidgetGuide({ hasRoutine: false, dismissal: 'visible' })).toBe(false);
  });

  it('waits for the saved preference and stays hidden after dismissal', () => {
    expect(shouldShowHomeWidgetGuide({ hasRoutine: true, dismissal: 'loading' })).toBe(false);
    expect(shouldShowHomeWidgetGuide({ hasRoutine: true, dismissal: 'dismissed' })).toBe(false);
    expect(resolveHomeWidgetGuideDismissal(null)).toBe('visible');
    expect(resolveHomeWidgetGuideDismissal(HOME_WIDGET_GUIDE_DISMISSED_SETTING_VALUE)).toBe(
      'dismissed'
    );
  });
});
