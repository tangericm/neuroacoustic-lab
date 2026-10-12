import * as THREE from 'three';
import type { Vec3 } from '../core/types';
import type { FocusDemoFixture } from './types';

/** Fourier amplitude of exp(-u²/(2σ²)): full width between the two half-amplitude frequencies. */
export function gaussianAmplitudeBandwidthHz(sigmaS: number): number {
  return Math.sqrt(2 * Math.log(2)) / (Math.PI * sigmaS);
}

/** Finite by default; looped playback restarts the recorded physical time each cycle. */
export class FocusTimeline {
  elapsedMs = 0;
  frame = 0;
  done = false;
  constructor(readonly count: number, readonly durationMs: number, readonly snapshot: number, readonly loop = false) {}
  advance(deltaMs: number, active: boolean): void {
    if (!active || this.done) return;
    if (this.loop) {
      this.elapsedMs = (this.elapsedMs + Math.max(0, deltaMs)) % this.durationMs;
      this.frame = Math.min(this.count - 1, Math.floor(this.elapsedMs / this.durationMs * this.count));
      return;
    }
    this.elapsedMs = Math.min(this.durationMs, this.elapsedMs + Math.max(0, deltaMs));
    this.done = this.elapsedMs >= this.durationMs;
    this.frame = this.done ? this.snapshot : Math.min(this.count - 1, Math.floor(this.elapsedMs / this.durationMs * (this.count - 1)));
  }
  reset(): void { this.elapsedMs = 0; this.frame = 0; this.done = false; }
}

/** Own the demand-frame chain: inactive and completed finite movies never schedule a successor. */
export function tickFocusPlayback(timeline: FocusTimeline, deltaMs: number, active: boolean, sample: (frame: number, captured: boolean) => void, complete: () => void, invalidate: () => void): void {
  if (!active || timeline.done) return;
  const previous = timeline.frame;
  timeline.advance(deltaMs, true);
  if (previous !== timeline.frame || timeline.done) sample(timeline.frame, timeline.done);
  if (timeline.done) complete();
  else invalidate();
}

/** Capture the strongest cached coherent packet amplitude near the predicted target arrival. */
export function focusSnapshotFrame(fixture: FocusDemoFixture, frames: Int16Array): number {
  const { plane, scenario, frames: timing } = fixture;
  const arrival = Math.max(0, Math.min(timing.count - 1, Math.round((fixture.targetArrivalS - timing.startS) / timing.stepS)));
  const x = Math.round(((scenario.targetM[0] - plane.centerM[0]) / plane.extentM + .5) * (plane.size - 1));
  const z = Math.round((.5 - (scenario.targetM[2] - plane.centerM[2]) / plane.extentM) * (plane.size - 1));
  const window = Math.max(1, Math.ceil(2e-6 / timing.stepS));
  let selected = arrival, peak = -1;
  for (let frame = Math.max(0, arrival - window); frame <= Math.min(timing.count - 1, arrival + window); frame++) {
    for (let row = Math.max(0, z - 1); row <= Math.min(plane.size - 1, z + 1); row++) {
      for (let col = Math.max(0, x - 1); col <= Math.min(plane.size - 1, x + 1); col++) {
        const amplitude = Math.abs(frames[frame * plane.size * plane.size + row * plane.size + col]);
        if (amplitude > peak) { peak = amplitude; selected = frame; }
      }
    }
  }
  return selected;
}

export function createFocusTexture(size: number): THREE.DataTexture {
  const texture = new THREE.DataTexture(new Uint8Array(size * size * 4), size, size, THREE.RGBAFormat);
  texture.magFilter = THREE.LinearFilter;
  texture.minFilter = THREE.LinearFilter;
  // Raw typed-array row 0 is uploaded at v=0. Plane +π/2 maps local v=1 to +Z.
  // Flip the shader UV explicitly rather than relying on DOM-image unpack flipping.
  texture.flipY = false;
  texture.repeat.y = -1;
  texture.offset.y = 1;
  texture.updateMatrix();
  texture.colorSpace = THREE.SRGBColorSpace;
  return texture;
}

/** Fixed pulse-envelope contrast; no frame-dependent normalization, allocation, or texture replacement. */
export function paintFocusFrame(texture: THREE.DataTexture, frames: Int16Array, frame: number, size: number): void {
  const pixels = texture.image.data as Uint8Array;
  const offset = frame * size * size;
  for (let i = 0; i < size * size; i++) {
    const amplitude = Math.min(1, Math.abs(frames[offset + i]) / 32767);
    const contrast = Math.pow(amplitude, .4);
    const pixel = i * 4;
    pixels[pixel] = Math.round(50 + 205 * contrast);
    pixels[pixel + 1] = Math.round(210 + 45 * contrast);
    pixels[pixel + 2] = 255;
    pixels[pixel + 3] = amplitude < .004 ? 0 : Math.round(255 * Math.pow(amplitude, .3));
  }
  texture.needsUpdate = true;
}

/** Nominal x–z ellipsoid intersection, displaced only to avoid depth fighting. */
export function createBoundaryGeometry(radii: Vec3, displayY: number): THREE.BufferGeometry {
  const points = new Float32Array(96 * 3);
  for (let i = 0; i < 96; i++) {
    const angle = i / 96 * 2 * Math.PI;
    points[i * 3] = radii[0] * Math.cos(angle);
    points[i * 3 + 1] = displayY;
    points[i * 3 + 2] = radii[2] * Math.sin(angle);
  }
  return new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(points, 3));
}
