import { describe, it, expect } from 'vitest';
import type { Scenario, Phantom } from '../src/core/types';
const core = await import('../src/core/index').catch(() => ({})) as typeof import('../src/core/index');
const scenario = await import('../src/core/scenario').catch(() => ({})) as typeof import('../src/core/scenario');
function homogeneous(): Scenario {
  const s = scenario.defaultScenario(); s.mode = 'homogeneous'; s.noiseDb = -300;
  s.gridSize = 41; s.fieldOfViewM = .08; s.targetM = [0,0,0]; s.acquisitions = 4;
  return s;
}
describe('scalar acoustic physics', () => {
  it('exposes a working physical path solver', () => { expect(core.pathBetween).toBeTypeOf('function'); });
  it('integrates analytic concentric shell lengths and travel time', () => {
    const s = scenario.defaultScenario();
    const p = core.pathBetween([0,0,.118], [0,0,0], s.medium, 500000);
    expect(p.layerLengthsM.water).toBeCloseTo(.028,10);
    expect(p.layerLengthsM.scalp).toBeCloseTo(.004,10);
    expect(p.layerLengthsM.skull).toBeCloseTo(.0065,10);
    expect(p.layerLengthsM.fluid).toBeCloseTo(.002,10);
    expect(p.layerLengthsM.brain).toBeCloseTo(.0775,10);
    expect(p.travelTimeS).toBeCloseTo(.028/1500+.004/1540+.0065/2800+.002/1500+.0775/1560,10);
  });
  it('uses 20log10 attenuation for pressure rather than intensity', () => {
    const s = scenario.defaultScenario();
    s.medium.materials.water.attenuationDbCmAtMHz = 10;
    const a = core.pathBetween([.2,0,0],[.21,0,0],s.medium,1e6);
    s.medium.materials.water.attenuationDbCmAtMHz = 0;
    const b = core.pathBetween([.2,0,0],[.21,0,0],s.medium,1e6);
    expect(a.attenuationDb).toBeCloseTo(10);
    expect(a.amplitude / b.amplitude).toBeCloseTo(10**(-10/20),8);
  });
  it('keeps sum squared drive weights one for both apodizations and masking', () => {
    const s = scenario.defaultScenario(); s.array.elements[0].enabled = false;
    for (const apodization of ['uniform','cosine'] as const) { s.apodization = apodization;
      const q = core.focusSequence(s); expect(q.driveEnergy).toBeCloseTo(1,12);
      expect(q.weights[0]).toBe(0); expect(q.activeIds).toHaveLength(63);
    }
  });
  it('aligns corrected arrivals and improves target coherent pressure', () => {
    const s = scenario.defaultScenario(); s.mode = 'corrected'; const q = core.focusSequence(s);
    const arrivals = s.array.elements.map((e,i) => core.pathBetween(e.position,s.targetM,s.medium,s.frequencyHz).travelTimeS + q.delaysS[i]);
    expect(Math.max(...arrivals)-Math.min(...arrivals)).toBeLessThan(1e-12);
    const a = core.targetPressure(s,q); s.mode='uncorrected';
    expect(a).toBeGreaterThan(core.targetPressure(s,core.focusSequence(s))*1.00001);
  });
  it('enforces physical element separation and rejects overlapping edits', () => {
    const s=scenario.defaultScenario(); const es=s.array.elements;
    for(let i=0;i<es.length;i++) for(let j=0;j<i;j++) expect(Math.hypot(...es[i].position.map((v,k)=>v-es[j].position[k]))).toBeGreaterThanOrEqual(.008);
    expect(()=>scenario.moveElement(s,0,es[1].azimuthRad,es[1].polarRad)).toThrow();
    expect(()=>scenario.moveElement(s,0,NaN,0)).toThrow();
  });
});
describe('synthetic aperture RF and reconstruction', () => {
  it('places one reflector echo at the independent two-way travel time', () => {
    const s=homogeneous(); const phantom:Phantom={scatterers:[{positionM:[0,0,0],amplitude:1,kind:'point'}],cystCenterM:[.03,0,0],cystRadiusM:.01,planeYM:0};
    const ch=core.acquireChannels(s,phantom); const n=ch.shape[2];
    let peak=0; for(let i=0;i<n;i++) if(Math.abs(ch.samples[i])>Math.abs(ch.samples[peak]))peak=i;
    expect(Math.abs(peak/ch.samplingRateHz+ch.timeOriginS-2*.118/1560)).toBeLessThan(1/ch.samplingRateHz);
  });
  it('obeys linear scatterer amplitude scaling with identical acquisition', () => {
    const s=homogeneous(); const p:Phantom={scatterers:[{positionM:[0,0,0],amplitude:1,kind:'point'}],cystCenterM:[.03,0,0],cystRadiusM:.01,planeYM:0};
    const a=core.acquireChannels(s,p); p.scatterers[0].amplitude=2; const b=core.acquireChannels(s,p);
    let error=0; for(let i=0;i<a.samples.length;i++) error=Math.max(error,Math.abs(b.samples[i]-2*a.samples[i]));
    expect(error).toBeLessThan(1e-6);
  });
  it('localizes a point from RF and degrades with a wrong reconstruction speed', () => {
    const s=homogeneous(); const p:Phantom={scatterers:[{positionM:[0,0,0],amplitude:1,kind:'point'}],cystCenterM:[.03,0,0],cystRadiusM:.01,planeYM:0};
    const ch=core.acquireChannels(s,p); const a=core.reconstruct(s,ch,false); const center=20*41+20;
    expect(a.envelope[center]).toBeGreaterThan(a.peak*.98);
    s.assumedSoundSpeedMps=1300; const b=core.reconstruct(s,ch,false);
    expect(b.envelope[center]).toBeLessThan(a.envelope[center]*.2);
  });
  it('keeps seeded scatterers deterministic and the cyst empty',()=>{
    const s=homogeneous();const a=core.createPhantom(s),b=core.createPhantom(s);
    expect(a).toEqual(b); expect(a.scatterers.length).toBeGreaterThan(100);
    for(const p of a.scatterers.filter(x=>x.kind==='speckle')) expect(Math.hypot(p.positionM[0]-a.cystCenterM[0],p.positionM[2]-a.cystCenterM[2])).toBeGreaterThanOrEqual(a.cystRadiusM);
  });
});


