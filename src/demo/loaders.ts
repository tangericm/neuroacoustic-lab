import { isScenario } from '../hooks/uiUtils';
import type { DemoPlane, FocusDemoFixture, ImagingDemoFixture } from './types';

const vector = (v: unknown): v is number[] => Array.isArray(v) && v.length === 3 && v.every(Number.isFinite);
const finiteArray = (v: unknown, length?: number): v is number[] => Array.isArray(v) && (length === undefined || v.length === length) && v.every(Number.isFinite);
function validPlane(p: DemoPlane) {
  return p && Number.isInteger(p.size) && p.size >= 16 && p.size <= 192 && Number.isFinite(p.extentM) && p.extentM > 0 && p.extentM <= .4 && vector(p.centerM) && p.axes === 'xz';
}
const asset = (path: string) => {
  if (!/^\/demo\/[a-zA-Z0-9._-]+$/.test(path)) throw new Error('Invalid demonstration asset path.');
  return `${import.meta.env.BASE_URL}${path.slice(1)}`;
};
async function json<T>(path: string): Promise<T> {
  const response = await fetch(asset(path));
  if (!response.ok) throw new Error('The demonstration could not be loaded. Please retry.');
  return response.json() as Promise<T>;
}

/** Also accepts bytes a host/browser has already decompressed through Content-Encoding. */
export async function decodePressureFrames(bytes: Uint8Array, expectedSamples: number): Promise<Int16Array> {
  const expectedBytes = expectedSamples * 2;
  if (!Number.isSafeInteger(expectedSamples) || expectedSamples <= 0 || expectedBytes > 16 * 1024 * 1024) throw new Error('Invalid wave-frame dimensions.');
  let decoded = bytes;
  if (bytes[0] === 0x1f && bytes[1] === 0x8b) {
    if (typeof DecompressionStream === 'undefined') throw new Error('This browser cannot decode the wave animation. Ultrasound imaging remains available.');
    const copy = new Uint8Array(bytes.length); copy.set(bytes);
    const reader = new Blob([copy.buffer]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
    decoded = new Uint8Array(expectedBytes); let offset = 0;
    try {
      for (;;) {
        const chunk = await reader.read(); if (chunk.done) break;
        if (offset + chunk.value.byteLength > expectedBytes) { await reader.cancel(); throw new Error('Wave-frame data exceeds its declared dimensions.'); }
        decoded.set(chunk.value, offset); offset += chunk.value.byteLength;
      }
      if (offset !== expectedBytes) throw new Error('Wave-frame data is incomplete.');
    } finally { reader.releaseLock(); }
  }
  if (decoded.byteLength !== expectedBytes) throw new Error('Wave-frame data does not match its declared dimensions.');
  const view = new DataView(decoded.buffer, decoded.byteOffset, decoded.byteLength), frames = new Int16Array(expectedSamples);
  for (let i = 0; i < frames.length; i++) frames[i] = view.getInt16(i * 2, true);
  return frames;
}

let focusPromise: Promise<{ fixture: FocusDemoFixture; frames: Int16Array }> | undefined;
export function loadFocusDemo() {
  return focusPromise ??= (async () => {
    const fixture = await json<FocusDemoFixture>('/demo/focus.json');
    const f = fixture.frames, count = fixture.scenario?.array?.elements?.length;
    if (f?.quantity !== 'coherent-pulse-envelope') throw new Error('The focusing demonstration has invalid data.');
    if (fixture.version !== 1 || fixture.kind !== 'fixed-focused-pulse' || !validPlane(fixture.plane) || !isScenario(fixture.scenario) || !f || f.encoding !== 'signed-int16-le' || !Number.isInteger(f.count) || f.count < 2 || f.count > 512 || !Number.isFinite(f.startS) || !Number.isFinite(f.stepS) || f.stepS <= 0 || !Number.isFinite(f.pressureScale) || f.pressureScale <= 0 || !finiteArray(fixture.delaysS, count) || !finiteArray(fixture.weights, count) || !Number.isFinite(fixture.targetArrivalS) || fixture.targetArrivalS < f.startS || fixture.targetArrivalS > f.startS + (f.count - 1) * f.stepS || Math.abs(fixture.driveEnergy - 1) > 1e-8) throw new Error('The focusing demonstration has invalid data.');
    const response = await fetch(asset(f.url));
    if (!response.ok) throw new Error('The wave animation could not be loaded. Please retry.');
    const frames = await decodePressureFrames(new Uint8Array(await response.arrayBuffer()), fixture.plane.size ** 2 * f.count);
    return { fixture, frames };
  })().catch(error => { focusPromise = undefined; throw error; });
}

let imagingPromise: Promise<ImagingDemoFixture> | undefined;
export function loadImagingDemo() {
  return imagingPromise ??= (async () => {
    const fixture = await json<ImagingDemoFixture>('/demo/imaging.json'), np = fixture.plane?.size ** 2;
    const shape = fixture.channelShape;
    if (fixture.version !== 1 || fixture.kind !== 'synthetic-aperture-imaging' || !validPlane(fixture.plane) || !isScenario(fixture.scenario) || !Array.isArray(shape) || shape.length !== 3 || shape.some(n => !Number.isInteger(n) || n <= 0) || !Number.isFinite(fixture.samplingRateHz) || fixture.samplingRateHz <= 0 || !Number.isFinite(fixture.timeOriginS) || !finiteArray(fixture.transmitIds, shape[0]) || !finiteArray(fixture.receiveIds, shape[1]) || !finiteArray(fixture.calibratedEnvelope, np) || !finiteArray(fixture.uncalibratedEnvelope, np) || !Number.isFinite(fixture.display?.referencePeak) || fixture.display.referencePeak <= 0 || !Number.isFinite(fixture.display.floorDb) || fixture.display.floorDb >= 0 || !finiteArray(fixture.traceTimeUs, shape[2]) || !finiteArray(fixture.alignedTimeUs) || !fixture.alignedTimeUs.length || !Array.isArray(fixture.traces) || !fixture.traces.length || fixture.traces.some(t => !Number.isFinite(t.arrivalS) || !fixture.receiveIds.includes(t.receiverId) || !finiteArray(t.raw, fixture.traceTimeUs.length) || !finiteArray(t.aligned, fixture.alignedTimeUs.length)) || !Array.isArray(fixture.partials) || !fixture.partials.length || fixture.partials.some((p, i) => !Number.isInteger(p.receivers) || p.receivers <= (i ? fixture.partials[i - 1].receivers : 0) || p.receivers > shape[1] || !finiteArray(p.envelope, np)) || fixture.partials.at(-1)!.receivers !== shape[1] || !Array.isArray(fixture.pointTargetsM) || fixture.pointTargetsM.some(p => !vector(p))) throw new Error('The imaging demonstration has invalid data.');
    return fixture;
  })().catch(error => { imagingPromise = undefined; throw error; });
}
