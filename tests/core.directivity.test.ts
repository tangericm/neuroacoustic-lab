import { expect, it } from 'vitest';
import { pistonDirectivity } from '../src/core/physics';
import oracle from './core.directivity.scipy.json';

it('preserves the signed high-ka sidelobe that Taylor cancellation previously distorted',()=>{
  expect(pistonDirectivity(37.69911184307752)).toBeCloseTo(-0.004826737932183564,12);
});
it('matches independent SciPy through ka40 including the branch boundary and near zeros',()=>{
  for(const [x,expected] of oracle.samples){
    expect(Math.abs(pistonDirectivity(x)-expected),`2J1(x)/x at x=${x}`).toBeLessThan(2e-12);
    expect(Math.abs(pistonDirectivity(-x)-expected),`even directivity at x=${-x}`).toBeLessThan(2e-12);
  }
});
