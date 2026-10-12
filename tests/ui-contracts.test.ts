import { describe, expect, it } from 'vitest';
import { defaultScenario, rotate } from '../src/core/scenario';
import { acceptsResult, decodeScenario, displayAzimuth, elementAngles, encodeScenario, formatNumber, isScenario, selectedElementField, totalRuntime } from '../src/hooks/uiUtils';
import type { SimulationResult } from '../src/core/types';

describe('portable scenario settings', () => {
  it('round-trips the complete default including unwrapped Fibonacci angles', () => {
    const original = defaultScenario();
    expect(original.array.elements.at(-1)!.azimuthRad).toBeGreaterThan(2 * Math.PI);
    expect(JSON.parse(JSON.stringify(decodeScenario(encodeScenario(original))))).toEqual(JSON.parse(JSON.stringify(original)));
  });
  it('round-trips edited elements and retains no echo payload', () => {
    const original = Object.assign(defaultScenario(), { channels: { samples: [3, 4, 5] }, reconstruction: { envelope: [9] } }); original.array.elements[3].enabled = false; original.targetM = [-.022, .01, .018]; original.seed = 42;
    const encoded = encodeScenario(original), restored = decodeScenario(encoded);
    expect(restored.targetM).toEqual(original.targetM); expect(restored.array.elements[3].enabled).toBe(false);
    expect(Object.keys(restored)).not.toContain('channels'); expect(Object.keys(restored)).not.toContain('reconstruction');
  });
  it('rejects malformed, oversized and physically impossible links', () => {
    expect(() => decodeScenario('!bad')).toThrow(); expect(() => decodeScenario('a'.repeat(30001))).toThrow();
    const s = defaultScenario(); s.targetM = [.3, 0, 0]; expect(isScenario(s)).toBe(false);
    const layered = defaultScenario(); layered.medium.outerRadiiM = [.03, .03, .03]; layered.medium.skullThicknessM = .02; expect(isScenario(layered)).toBe(false);
    const invalid = defaultScenario(); invalid.array.elements[0].id = invalid.array.elements[1].id; expect(isScenario(invalid)).toBe(false);
  });
});
describe('worker result fencing and measured values', () => {
  it('slices weighted complex element fields by element id rather than assuming id is its index', () => {
    const scenario = defaultScenario(); scenario.array.elements[1].id = 91;
    const result = { scenario, field: { size: 2, extentM: .12, centerM: [.015, 0, .015], axes: 'xz' }, elementFields: { size: 2, real: new Float32Array([1, 1, 1, 1, 3, 0, -3, 4]), imag: new Float32Array([0, 0, 0, 0, 4, 5, -4, 3]) } } as SimulationResult;
    const selected = selectedElementField(result, 91)!;
    expect(Array.from(selected.real)).toEqual([3, 0, -3, 4]); expect(Array.from(selected.magnitude)).toEqual([5, 5, 5, 5]);
    expect(selected.extentM).toBe(.12); expect(selected.centerM).toEqual([.015, 0, .015]); expect(selectedElementField(result, 777)).toBeUndefined();
  });
  it('keeps element edits on the same local sphere after array rotation', () => {
    const rotation: [number, number, number] = [.14, -.2, .1], azimuth = -.75, polar = .8;
    const world = rotate([Math.sin(polar) * Math.cos(azimuth), Math.sin(polar) * Math.sin(azimuth), Math.cos(polar)], rotation);
    const recovered = elementAngles(world, rotation);
    expect(recovered[0]).toBeCloseTo(azimuth, 12); expect(recovered[1]).toBeCloseTo(polar, 12);
    expect(displayAzimuth(17 * Math.PI)).toBeCloseTo(-180); expect(displayAzimuth(-Math.PI / 2)).toBe(-90);
  });
  it('allows only the newest request after edits, optimization or cancellation', () => {
    const requests = [1, 2, 3, 4]; const arrivals = [3, 1, 4, 2];
    expect(arrivals.filter(id => acceptsResult(requests.at(-1)!, id))).toEqual([4]);
    expect(acceptsResult(5, 4)).toBe(false);
  });
  it('does not double count a reported total or invent finite metrics', () => {
    expect(totalRuntime({ field: 50, rf: 20, reconstruction: 30, total: 102 })).toBe(102);
    expect(totalRuntime({ field: 50, rf: 20, reconstruction: 30 })).toBe(100);
    expect(formatNumber(undefined)).toBe('—'); expect(formatNumber(Infinity)).toBe('—'); expect(formatNumber(.1946, 2)).toBe('0.19');
  });
});
