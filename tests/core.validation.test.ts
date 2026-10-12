import { describe, expect, it } from 'vitest';
import { defaultScenario, simulate, optimizePlacement, createPhantom } from '../src/core';
import type { Scenario } from '../src/core';
const invalid:Array<[string,(s:Scenario)=>void,RegExp]>=[
  ['nonfinite position',s=>{s.array.elements[0].position[0]=NaN;},/position/i],
  ['nonfinite normal',s=>{s.array.elements[0].normal[0]=NaN;},/normal/i],
  ['nonunit normal',s=>{s.array.elements[0].normal=[0,0,2];},/unit normal/i],
  ['nonfinite piston radius',s=>{s.array.elements[0].radiusM=NaN;},/element radius/i],
  ['nonfinite attenuation exponent',s=>{s.medium.materials.skull.attenuationPower=NaN;},/attenuation exponent/i],
  ['overlapping elements',s=>{s.array.elements[0].position=[...s.array.elements[1].position];},/separation/i],
  ['head clearance',s=>{s.array.elements[0].position=[0,0,.09];},/clearance/i],
  ['negative layer',s=>{s.medium.skullThicknessM=-.001;},/thickness/i],
  ['nonnested layers',s=>{s.medium.skullThicknessM=.09;},/nest/i],
  ['nonfinite outer radius',s=>{s.medium.outerRadiiM[0]=NaN;},/radii/i],
  ['no enabled elements',s=>{s.array.elements.forEach(e=>{e.enabled=false;});},/enable/i],
];
describe('public simulation input boundary',()=>{
  for(const [name,mutate,message] of invalid)it(`rejects ${name} before simulation and optimization`,async()=>{
    const s=defaultScenario();s.gridSize=16;mutate(s);
    expect(()=>simulate(s)).toThrow(message);await expect(optimizePlacement(s)).rejects.toThrow(message);
  });
  it('retains a legitimate single-element scenario',()=>{
    const s=defaultScenario();s.gridSize=16;s.acquisitions=1;s.array.elements=s.array.elements.slice(0,1);
    expect(simulate(s).metrics.activeElements).toBe(1);
  });
});
it('keeps every point reflector within brain for a peripheral target',()=>{
  const s=defaultScenario();s.targetM=[.065,0,0];const p=createPhantom(s);
  const inset=s.medium.scalpThicknessM+s.medium.skullThicknessM+s.medium.fluidThicknessM;
  for(const scatterer of p.scatterers)expect(scatterer.positionM.reduce((sum,v,i)=>sum+(v/(s.medium.outerRadiiM[i]-inset))**2,0)).toBeLessThan(1);
  expect(p.scatterers.some(p=>p.kind==='point'&&p.positionM[0]===.065&&p.positionM[2]===0)).toBe(true);
});
it('sums the weighted individual complex fields to the coherent field',()=>{
  const s=defaultScenario();s.gridSize=16;s.acquisitions=1;s.array.elements[1].enabled=false;
  const result=simulate(s),individual=result.elementFields;expect(individual).toBeDefined();
  const n=s.gridSize**2;expect(individual!.real.length).toBe(n*s.array.elements.length);
  for(let p=0;p<n;p++){
    let re=0,im=0;for(let e=0;e<s.array.elements.length;e++){re+=individual!.real[e*n+p];im+=individual!.imag[e*n+p];}
    expect(re).toBeCloseTo(result.field.real[p],5);expect(im).toBeCloseTo(result.field.imag[p],5);
    expect(Math.abs(individual!.real[n+p])).toBe(0);expect(Math.abs(individual!.imag[n+p])).toBe(0);
  }
});
