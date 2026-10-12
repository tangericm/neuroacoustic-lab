import { describe, expect, it } from 'vitest';
import { sharedPressureScale, pressureFraction } from '../src/components/reference-utils';
describe('reference pressure display', () => {
  it('uses a shared scale so attenuation remains visible across maps', () => {
    const scale = sharedPressureScale([[0, 10], [0, 2], [0, 12]]);
    expect(scale).toBe(12);
    expect(pressureFraction(2, scale)).toBeCloseTo(1 / 6);
    expect(pressureFraction(10, scale)).toBeGreaterThan(pressureFraction(2, scale));
  });
  it('handles empty or nonfinite maps without invalid canvas colors', () => {
    expect(sharedPressureScale([[], [NaN, Infinity, -2]])).toBe(1);
    expect(pressureFraction(NaN, 1)).toBe(0);
    expect(pressureFraction(-1, 1)).toBe(0);
  });
});
