import { describe, expect, it } from 'vitest';
import { updateAdaptiveEstimate } from '../../src/tasks/adaptive-estimate.js';

describe('updateAdaptiveEstimate', () => {
  it('becomes the actual outright when there is no prior estimate', () => {
    expect(updateAdaptiveEstimate(null, 45)).toBe(45);
  });

  it('blends the actual into the previous estimate at alpha=0.3', () => {
    // 0.3*60 + 0.7*30 = 39
    expect(updateAdaptiveEstimate(30, 60)).toBe(39);
  });

  it('rounds to the nearest whole minute', () => {
    // 0.3*10 + 0.7*20 = 17 exactly
    expect(updateAdaptiveEstimate(20, 10)).toBe(17);
    // 0.3*11 + 0.7*21 = 18 exactly
    expect(updateAdaptiveEstimate(21, 11)).toBe(18.0);
  });

  it('a single outlier run pulls the estimate but never overwrites it outright', () => {
    const estimate = updateAdaptiveEstimate(30, 300);
    expect(estimate).toBeGreaterThan(30);
    expect(estimate).toBeLessThan(300);
    expect(estimate).toBe(Math.round(0.3 * 300 + 0.7 * 30));
  });

  it('converges toward a stable actual over repeated completions', () => {
    let estimate: number | null = null;
    for (let i = 0; i < 50; i += 1) {
      estimate = updateAdaptiveEstimate(estimate, 25);
    }
    expect(estimate).toBe(25);
  });

  it('is unchanged when the actual exactly matches the previous estimate', () => {
    expect(updateAdaptiveEstimate(40, 40)).toBe(40);
  });

  it('handles an actual of zero minutes', () => {
    expect(updateAdaptiveEstimate(20, 0)).toBe(Math.round(0.7 * 20));
  });
});
