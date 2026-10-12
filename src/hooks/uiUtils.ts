import type { FieldPlane, Scenario, SimulationResult, Vec3 } from '../core/types';

/** Share only reproducible inputs. No simulation, RF samples, or images enter the URL. */
export function encodeScenario(scenario: Scenario): string {
  const bytes = new TextEncoder().encode(JSON.stringify(scenarioSettings(scenario)));
  let binary = ''; for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replace(/=+$/, '');
}
export function decodeScenario(encoded: string): Scenario {
  if (encoded.length > 30000 || !/^[\w-]+$/.test(encoded)) throw new Error('Invalid or oversized scenario link.');
  const binary = atob(encoded.replaceAll('-', '+').replaceAll('_', '/'));
  const parsed: unknown = JSON.parse(new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))));
  if (!isScenario(parsed)) throw new Error('This scenario link has invalid settings.');
  return scenarioSettings(parsed);
}
function scenarioSettings(s: Scenario): Scenario {
  return {
    version: 1, seed: s.seed, frequencyHz: s.frequencyHz, assumedSoundSpeedMps: s.assumedSoundSpeedMps, mode: s.mode, apodization: s.apodization,
    targetM: [...s.targetM], acquisitions: s.acquisitions, noiseDb: s.noiseDb, gridSize: s.gridSize, fieldOfViewM: s.fieldOfViewM,
    array: { radiusM: s.array.radiusM, rotationRad: [...s.array.rotationRad], elements: s.array.elements.map(e => ({ id: e.id, position: [...e.position], normal: [...e.normal], radiusM: e.radiusM, enabled: e.enabled, azimuthRad: e.azimuthRad, polarRad: e.polarRad })) },
    medium: { outerRadiiM: [...s.medium.outerRadiiM], scalpThicknessM: s.medium.scalpThicknessM, skullThicknessM: s.medium.skullThicknessM, fluidThicknessM: s.medium.fluidThicknessM,
      materials: Object.fromEntries(['water', 'scalp', 'skull', 'fluid', 'brain'].map(key => { const m = s.medium.materials[key as keyof typeof s.medium.materials]; return [key, { name: m.name, soundSpeedMps: m.soundSpeedMps, densityKgM3: m.densityKgM3, attenuationDbCmAtMHz: m.attenuationDbCmAtMHz, attenuationPower: m.attenuationPower }]; })) as Scenario['medium']['materials'] },
  };
}
const finiteRange = (v: unknown, min: number, max: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max;
const vector = (v: unknown, min: number, max: number): boolean => Array.isArray(v) && v.length === 3 && v.every(n => finiteRange(n, min, max));
export function isScenario(value: unknown): value is Scenario {
  if (!value || typeof value !== 'object') return false;
  const s = value as Scenario;
  return s.version === 1 && finiteRange(s.seed, 0, 2 ** 32 - 1) && Number.isInteger(s.seed)
    && finiteRange(s.frequencyHz, 100000, 2000000) && finiteRange(s.assumedSoundSpeedMps, 1200, 2000)
    && ['homogeneous', 'uncorrected', 'corrected'].includes(s.mode) && ['uniform', 'cosine'].includes(s.apodization)
    && vector(s.targetM, -.15, .15) && finiteRange(s.acquisitions, 1, 64) && Number.isInteger(s.acquisitions)
    && finiteRange(s.noiseDb, -100, 0) && finiteRange(s.gridSize, 16, 256) && Number.isInteger(s.gridSize)
    && finiteRange(s.fieldOfViewM, .01, .3) && !!s.array && vector(s.array.rotationRad, -Math.PI * 2, Math.PI * 2)
    && finiteRange(s.array.radiusM, .09, .18) && Array.isArray(s.array.elements) && s.array.elements.length >= 8 && s.array.elements.length <= 128
    && new Set(s.array.elements.map(e => e.id)).size === s.array.elements.length
    && s.array.elements.every(e => Number.isInteger(e.id) && e.id >= 0 && vector(e.position, -.2, .2) && vector(e.normal, -1, 1)
      && finiteRange(e.radiusM, .001, .015) && typeof e.enabled === 'boolean' && finiteRange(e.azimuthRad, -1000, 1000) && finiteRange(e.polarRad, 0, 1.35))
    && !!s.medium && vector(s.medium.outerRadiiM, .03, .15) && finiteRange(s.medium.scalpThicknessM, 0, .02)
    && finiteRange(s.medium.skullThicknessM, 0, .02) && finiteRange(s.medium.fluidThicknessM, 0, .02)
    && s.medium.outerRadiiM.every(r => r > s.medium.scalpThicknessM + s.medium.skullThicknessM + s.medium.fluidThicknessM + .015)
    && s.targetM.reduce((sum, v, i) => sum + (v / (s.medium.outerRadiiM[i] - s.medium.scalpThicknessM - s.medium.skullThicknessM - s.medium.fluidThicknessM)) ** 2, 0) < 1
    && ['water', 'scalp', 'skull', 'fluid', 'brain'].every(key => {
      const m = s.medium.materials?.[key as keyof typeof s.medium.materials];
      return !!m && typeof m.name === 'string' && finiteRange(m.soundSpeedMps, 1000, 4000) && finiteRange(m.densityKgM3, 500, 3000)
        && finiteRange(m.attenuationDbCmAtMHz, 0, 50) && finiteRange(m.attenuationPower, .1, 3);
    });
}
export function acceptsResult(latestId: number, receivedId: number): boolean { return latestId === receivedId; }
/** Recover local spherical angles from a world-space point after Rx, Ry, Rz pose rotation. */
export function elementAngles(position: Vec3, rotation: Vec3): [number, number] {
  const [a, b, c] = rotation;
  const x = position[0] * Math.cos(c) + position[1] * Math.sin(c), y = -position[0] * Math.sin(c) + position[1] * Math.cos(c);
  const u = x * Math.cos(b) - position[2] * Math.sin(b), w = x * Math.sin(b) + position[2] * Math.cos(b);
  const v = y * Math.cos(a) + w * Math.sin(a), z = -y * Math.sin(a) + w * Math.cos(a);
  return [Math.atan2(v, u), Math.acos(Math.max(-1, Math.min(1, z / Math.hypot(u, v, z))))];
}
export function displayAzimuth(radians: number): number { return ((radians * 180 / Math.PI + 180) % 360 + 360) % 360 - 180; }
export function selectedElementField(result: SimulationResult, selectedId: number | null): FieldPlane | undefined {
  const fields = result.elementFields, index = result.scenario.array.elements.findIndex(e => e.id === selectedId);
  if (!fields || index < 0) return undefined;
  const count = fields.size ** 2, start = index * count;
  const real = fields.real.slice(start, start + count), imag = fields.imag.slice(start, start + count);
  const magnitude = Float32Array.from(real, (r, i) => Math.hypot(r, imag[i]));
  return { ...result.field, size: fields.size, real, imag, magnitude, peak: magnitude.reduce((a, b) => Math.max(a, b), 0) };
}
export function formatNumber(value: number | undefined, digits = 1): string { return value !== undefined && Number.isFinite(value) ? value.toFixed(digits) : '—'; }
export function totalRuntime(timings: Record<string, number>): number { return Number.isFinite(timings.total) ? timings.total : Object.values(timings).filter(Number.isFinite).reduce((a, b) => a + b, 0); }
