import { describe, expect, it } from 'vitest';

import { makeColors } from './tokens';

describe('makeColors', () => {
  it('adds the selected accent to the light hero gradient', () => {
    const green = makeColors('light', '#CFF56A');
    const blue = makeColors('light', '#5AC8FA');

    expect(green.g1).toBe('#fafcf7');
    expect(green.g2).toBe('#eff0ef');
    expect(blue.g1).toBe('#f6fafd');
    expect(blue.g2).toBe('#edeff2');
  });

  it('adds the selected accent to the dark hero gradient with the same ratios', () => {
    const green = makeColors('dark', '#CFF56A');
    const blue = makeColors('dark', '#5AC8FA');

    expect(green.g1).toBe('#1f2120');
    expect(green.g2).toBe('#141515');
    expect(blue.g1).toBe('#1b1f26');
    expect(blue.g2).toBe('#111418');
  });
});
