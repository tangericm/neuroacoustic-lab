import { isScenario } from '../hooks/uiUtils';
import type { DemoPlane, FocusDemoFixture, ImagingDemoFixture } from './types';
import type { FlowFixture } from '../core/flow/types';

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

let flowPromise: Promise<FlowFixture> | undefined;
/** The independent imaging probe has its own contract; focused-head constraints do not apply. */
export function loadFlowDemo(): Promise<FlowFixture> {
  return flowPromise ??= (async () => {
    const fixture = await json<FlowFixture>('/demo/flow.json');
    const c = fixture.config, plane = fixture.plane;
    const np = plane?.size ** 2, shape = fixture.acquisition?.channelShape;
    const invalid = () => { throw new Error('The flow imaging demonstration has invalid data.'); };
    if (fixture.version !== 1 || fixture.kind !== 'temporal-flow-imaging' || !validPlane(plane) || plane.rowDirection !== 'decreasing-z' || !c ||
      !Number.isInteger(c.frames) || c.frames < 4 || c.frames > 64 || c.size !== plane.size ||
      !Number.isInteger(c.elementCount) || c.elementCount < 2 || c.elementCount > 128 ||
      !Number.isInteger(c.samples) || c.samples < 32 || c.samples > 8192 || !Number.isFinite(c.seed) ||
      [c.frequencyHz, c.soundSpeedMps, c.samplingRateHz, c.frameIntervalS, c.elementPitchM, c.elementRadiusM, c.extentM].some(v => !Number.isFinite(v) || v <= 0) ||
      [c.tissueDisplacementM, c.bloodSpeedMps, c.noiseRmsRelative, c.probeZM, c.centerZM].some(v => !Number.isFinite(v)) ||
      !Number.isInteger(c.clutterRank) || c.clutterRank < 0 || c.clutterRank >= c.frames ||
      !Array.isArray(shape) || shape.length !== 4 || shape[0] !== c.frames || shape[1] !== 1 || shape[2] !== c.elementCount || shape[3] !== c.samples ||
      !finiteArray(fixture.acquisition.frameTimesS, c.frames) || !Number.isFinite(fixture.acquisition.timeOriginS) || !Number.isFinite(fixture.acquisition.noiseRms)) invalid();
    const cine = fixture.cine, power = fixture.power, flow = fixture.flow;
    if (!cine || !finiteArray(cine.frameIndices) || !cine.frameIndices.length || cine.frameIndices.length > c.frames ||
      cine.frameIndices.some((n, i) => !Number.isInteger(n) || n < 0 || n >= c.frames || (i > 0 && n <= cine.frameIndices[i - 1])) ||
      !finiteArray(cine.timeMs, cine.frameIndices.length) || !Array.isArray(cine.bmode) || cine.bmode.length !== cine.frameIndices.length ||
      cine.bmode.some(frame => !finiteArray(frame, np) || frame.some(v => v < 0 || v > 255)) ||
      !Number.isFinite(cine.referenceAmplitude) || cine.referenceAmplitude <= 0 || !Number.isFinite(cine.floorDb) || cine.floorDb >= 0 ||
      !power || !finiteArray(power.before, np) || !finiteArray(power.after, np) || [...power.before, ...power.after].some(v => v < 0) ||
      !Number.isFinite(power.referencePower) || power.referencePower <= 0 || !Number.isFinite(power.floorDb) || power.floorDb >= 0 ||
      !flow || !finiteArray(flow.velocityMps, np) || !finiteArray(flow.coherence, np) || !finiteArray(flow.valid, np) ||
      flow.valid.some(v => v !== 0 && v !== 1) || flow.coherence.some(v => v < 0 || v > 1.000001) ||
      !Number.isFinite(flow.nyquistMps) || flow.nyquistMps <= 0 || typeof flow.positiveDirection !== 'string' ||
      !Number.isFinite(flow.powerThreshold) || !Number.isFinite(flow.coherenceThreshold)) invalid();
    const truth = fixture.truth, displacement = fixture.displacement, spectrum = fixture.spectrum;
    if (!truth || !Array.isArray(truth.vessels) || truth.vessels.length > 64 || truth.vessels.some(v =>
      typeof v.id !== 'string' || !Number.isFinite(v.radiusM) || v.radiusM <= 0 || !Number.isFinite(v.speedMps) ||
      !Array.isArray(v.pointsM) || v.pointsM.length < 2 || v.pointsM.some(p => !finiteArray(p, 2))) ||
      !displacement || !Array.isArray(displacement.points) || displacement.points.some(p =>
        [p.xM, p.zM, p.dzM, p.confidence].some(v => !Number.isFinite(v)) || typeof p.valid !== 'boolean') ||
      !spectrum || !finiteArray(spectrum.singularValues, c.frames) || spectrum.removedModes !== c.clutterRank ||
      !Array.isArray(fixture.methods) || fixture.methods.length < 4 || fixture.methods.some(m =>
        [m.title, m.formula, m.variables, m.explanation, m.limitation].some(v => typeof v !== 'string')) ||
      !Array.isArray(fixture.metrics) || fixture.metrics.some(m => m.value !== null && !Number.isFinite(m.value)) ||
      !fixture.rf || !finiteArray(fixture.rf.timeUs) || !Array.isArray(fixture.rf.traces) || fixture.rf.traces.some(t => !finiteArray(t.values, fixture.rf.timeUs.length)) ||
      !fixture.provenance || !Array.isArray(fixture.provenance.assumptions) || !Array.isArray(fixture.provenance.sources)) invalid();
    return fixture;
  })().catch(error => { flowPromise = undefined; throw error; });
}
