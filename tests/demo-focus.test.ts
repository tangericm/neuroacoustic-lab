import { describe, expect, it } from 'vitest';
import { FocusTimeline, createBoundaryGeometry, createFocusTexture, focusSnapshotFrame, gaussianAmplitudeBandwidthHz, paintFocusFrame, tickFocusPlayback } from '../src/demo/focusSceneUtils';
import type { FocusDemoFixture } from '../src/demo/types';
import { defaultScenario } from '../src/core/scenario';
import { Vector2 } from 'three';

const fixture: FocusDemoFixture = {
  version: 1, kind: 'fixed-focused-pulse', scenario: { ...defaultScenario(), targetM: [0, 0, 0] },
  plane: { axes: 'xz', size: 3, extentM: .2, centerM: [0, 0, 0] },
  frames: { count: 5, startS: 0, stepS: .5e-6, pressureScale: 2, encoding: 'signed-int16-le', quantity: 'coherent-pulse-envelope', url: '' },
  targetArrivalS: 1e-6, delaysS: [], weights: [], driveEnergy: 1,
  provenance: { modelVersion: 'test', generatedUtc: '', seed: 1, sourceHashes: {}, assumptions: [] },
};

describe('finite focus playback', () => {
  it('holds elapsed time while inactive and finishes on the selected captured frame', () => {
    const timeline = new FocusTimeline(5, 8000, 2);
    timeline.advance(4000, true);
    expect(timeline.frame).toBe(2);
    timeline.advance(90000, false);
    expect(timeline.elapsedMs).toBe(4000);
    timeline.advance(4000, true);
    expect(timeline.done).toBe(true);
    expect(timeline.frame).toBe(2);
    timeline.advance(4000, true);
    expect(timeline.elapsedMs).toBe(8000);
    timeline.reset();
    expect(timeline.frame).toBe(0);
    expect(timeline.done).toBe(false);
  });
  it('captures the strongest cached packet amplitude near the predicted target arrival', () => {
    const frames = new Int16Array(45);
    frames[1 * 9 + 4] = 12000;
    frames[2 * 9 + 4] = 0;
    frames[3 * 9 + 4] = 30000;
    expect(focusSnapshotFrame(fixture, frames)).toBe(3);
  });
  it('samples a superior target from top rows rather than mirroring the z axis', () => {
    const superior = { ...fixture, plane: { ...fixture.plane, size: 5 }, scenario: { ...fixture.scenario, targetM: [0, 0, .05] as [number, number, number] } };
    const frames = new Int16Array(125);
    frames[1 * 25 + 2] = 12000;
    frames[3 * 25 + 22] = 30000;
    expect(focusSnapshotFrame(superior, frames)).toBe(1);
  });
  it('stops requesting render frames when paused, hidden, or complete', () => {
    const timeline = new FocusTimeline(5, 8000, 2);
    const effects: string[] = [];
    const sample = (frame: number, done: boolean) => effects.push(`paint:${frame}:${done}`);
    const complete = () => effects.push('finish');
    const invalidate = () => effects.push('request');
    tickFocusPlayback(timeline, 4000, true, sample, complete, invalidate);
    expect(effects).toEqual(['paint:2:false', 'request']);
    effects.length = 0;
    tickFocusPlayback(timeline, 90000, false, sample, complete, invalidate);
    expect(effects).toEqual([]);
    expect(timeline.elapsedMs).toBe(4000);
    tickFocusPlayback(timeline, 4000, true, sample, complete, invalidate);
    expect(effects).toEqual(['paint:2:true', 'finish']);
    effects.length = 0;
    tickFocusPlayback(timeline, 4000, true, sample, complete, invalidate);
    expect(effects).toEqual([]);
  });
});

describe('cached coherent pulse-envelope display', () => {
  it('reuses one texture buffer, preserves a fixed amplitude scale, and leaves zero amplitude transparent', () => {
    const texture = createFocusTexture(2);
    const buffer = texture.image.data;
    const frames = new Int16Array([0, 32767, 16000, 1000, 0, 16000, 16000, 1000]);
    paintFocusFrame(texture, frames, 0, 2);
    const first = [...buffer];
    expect(first[3]).toBe(0);
    expect(first[7]).toBe(255);
    expect(first[11]).toBeLessThan(first[7]);
    paintFocusFrame(texture, frames, 1, 2);
    expect(texture.image.data).toBe(buffer);
    // Unchanged amplitudes retain their pixels even when the next frame has a lower peak.
    expect([...buffer.slice(8)]).toEqual(first.slice(8));
    expect([...buffer.slice(4, 8)]).toEqual(first.slice(8, 12));
    expect(buffer[7]).toBeLessThan(first[7]);
    texture.dispose();
  });
  it('maps the superior plane edge to encoded row zero through the actual shader UV matrix', () => {
    const texture = createFocusTexture(2);
    const superior = new Vector2(.25, 1).applyMatrix3(texture.matrix);
    const inferior = new Vector2(.25, 0).applyMatrix3(texture.matrix);
    expect(superior.toArray()).toEqual([.25, 0]);
    expect(inferior.toArray()).toEqual([.25, 1]);
    texture.dispose();
  });
  it('creates acoustic cross-section outlines at the actual ellipsoid radii', () => {
    const geometry = createBoundaryGeometry([.08, .1, .09], -.001);
    const points = geometry.getAttribute('position');
    expect(points.getX(0)).toBeCloseTo(.08, 6);
    expect(points.getY(0)).toBeCloseTo(-.001, 6);
    expect(points.getZ(24)).toBeCloseTo(.09, 6);
    geometry.dispose();
  });
});

describe('Gaussian pulse explanation', () => {
  it('reports amplitude-spectrum FWHM rather than the narrower power-spectrum width', () => {
    const sigmaS = 1.4e-6;
    const bandwidthHz = gaussianAmplitudeBandwidthHz(sigmaS);
    expect(bandwidthHz).toBeCloseTo(267700.9, 1);
    // Fourier amplitude of g(u)=exp(-u²/(2σ²)) is half at ±FWHM/2.
    const edgeAmplitude = Math.exp(-2 * Math.PI ** 2 * sigmaS ** 2 * (bandwidthHz / 2) ** 2);
    expect(edgeAmplitude).toBeCloseTo(.5, 12);
  });
});
