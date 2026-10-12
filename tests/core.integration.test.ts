import { expect, it } from 'vitest';
import { defaultScenario, simulate, optimizePlacement, pathBetween, distance, acquireChannels, createPropagationTable, fieldPlane, buildArray, moveElement } from '../src/core';
it('shares paths between field phases without changing physical amplitudes',()=>{
  const s=defaultScenario();s.gridSize=16;const table=createPropagationTable(s,16);
  const a=fieldPlane(s,undefined,16),b=fieldPlane(s,undefined,16,table);
  for(let i=0;i<a.real.length;i++){expect(b.real[i]).toBeCloseTo(a.real[i],5);expect(b.imag[i]).toBeCloseTo(a.imag[i],5);}
});
it('produces finite measured outputs with a common RF baseline and records actual resources',()=>{
  const s=defaultScenario(),r=simulate(s);
  for(const v of Object.values(r.metrics))expect(Number.isFinite(v)).toBe(true);
  expect(r.channels.shape[0]).toBe(8);expect(r.channels.shape[1]).toBe(64);
  expect(r.numericBytes).toBeGreaterThan(r.channels.samples.byteLength);
  expect(r.reconstruction.envelope.length).toBe(9216);
  console.info('DEFAULT_MEASURED',JSON.stringify({timingsMs:r.timingsMs,numericBytes:r.numericBytes,metrics:r.metrics,rfShape:r.channels.shape}));
});
it('rejects nonfinite scenario inputs instead of emitting a NaN dataset',()=>{
  const s=defaultScenario();s.noiseDb=NaN;expect(()=>simulate(s)).toThrow();
});
it('preserves ray time reversal and correct direction-dependent pressure transmission',()=>{
  const s=defaultScenario(),a=pathBetween([0,0,.118],[0,0,0],s.medium,s.frequencyHz),b=pathBetween([0,0,0],[0,0,.118],s.medium,s.frequencyHz);
  expect(a.travelTimeS).toBeCloseTo(b.travelTimeS,13);
  expect(a.amplitude/b.amplitude).toBeCloseTo((1560*1040)/(1500*1000),10);
});
it('uses outgoing and returning pressure transmissions in raw echoes',()=>{
  const s=defaultScenario();s.array.elements=s.array.elements.slice(0,1);s.noiseDb=-300;s.targetM=[0,0,0];s.acquisitions=1;
  const e=s.array.elements[0],out=pathBetween(e.position,s.targetM,s.medium,s.frequencyHz),back=pathBetween(s.targetM,e.position,s.medium,s.frequencyHz);
  const ch=acquireChannels(s,{scatterers:[{positionM:[0,0,0],amplitude:1,kind:'point'}],cystCenterM:[0,0,0],cystRadiusM:.01,planeYM:0});
  const k=Math.round(2*out.travelTimeS*ch.samplingRateHz),dt=k/ch.samplingRateHz-2*out.travelTimeS;
  const expected=out.amplitude*back.amplitude*Math.exp(-.5*(dt/(.7/s.frequencyHz))**2)*Math.cos(2*Math.PI*s.frequencyHz*dt);
  expect(ch.samples[k]).toBeCloseTo(expected,6);
});
it('deterministically improves or retains the pose without violating clearance/separation',async()=>{
  const s=defaultScenario();s.array=buildArray(64,.118,[.1,.1,0]);let progress=0;const a=await optimizePlacement(s,n=>{progress=n;});
  expect(progress).toBe(27);expect(a.finalObjectiveDb).toBeGreaterThanOrEqual(a.initialObjectiveDb);
  expect(a.candidates).toHaveLength(27);
  for(const e of a.scenario.array.elements)for(const other of a.scenario.array.elements)if(e.id!==other.id)expect(distance(e.position,other.position)).toBeGreaterThanOrEqual(.008);
  const e=a.scenario.array.elements[0],unchanged=moveElement(a.scenario,e.id,e.azimuthRad,e.polarRad);
  expect(distance(e.position,unchanged.array.elements[0].position)).toBeLessThan(1e-12);
});
it('reuses actual path geometry across assumed-speed edits and invalidates changed actual material',()=>{
  const s=defaultScenario();s.gridSize=16;const a=createPropagationTable(s);
  s.assumedSoundSpeedMps=1300;expect(createPropagationTable(s)).toBe(a);
  s.medium.materials.brain.soundSpeedMps=1400;const b=createPropagationTable(s);
  const centralRay=(8*16+8)*64;expect(b).not.toBe(a);expect(b.times[centralRay]).not.toBe(a.times[centralRay]);
});
