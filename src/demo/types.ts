import type { Scenario, Vec3 } from '../core/types';

/** Frozen educational experiments. Physical values are SI; pressures are relative. */
export interface DemoPlane { size: number; extentM: number; centerM: Vec3; axes: 'xz' }
export interface DemoProvenance {
  modelVersion: string; generatedUtc: string; seed: number;
  sourceHashes: Record<string, string>; assumptions: string[];
}
export interface FocusDemoFixture {
  version: 1; kind: 'fixed-focused-pulse'; scenario: Scenario;
  plane: DemoPlane;
  frames: { url: string; encoding: 'signed-int16-le'; quantity: 'coherent-pulse-envelope'; count: number; startS: number; stepS: number; pressureScale: number };
  targetArrivalS: number; delaysS: number[]; weights: number[]; driveEnergy: number;
  provenance: DemoProvenance;
}
export interface DemoTrace { receiverId: number; arrivalS: number; raw: number[]; aligned: number[] }
export interface ImagingDemoFixture {
  version: 1; kind: 'synthetic-aperture-imaging'; scenario: Scenario; plane: DemoPlane;
  channelShape: [number, number, number]; samplingRateHz: number; timeOriginS: number;
  transmitIds: number[]; receiveIds: number[];
  traceTimeUs: number[]; alignedTimeUs: number[]; traces: DemoTrace[];
  pointTargetsM: Vec3[];
  calibratedEnvelope: number[]; uncalibratedEnvelope: number[];
  partials: { receivers: number; envelope: number[] }[];
  display: { referencePeak: number; floorDb: number };
  calibration: { actualSoundSpeedMps: number; assumedSoundSpeedMps: number };
  channelsUrl: string;
  provenance: DemoProvenance;
}
