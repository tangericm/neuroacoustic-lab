import { describe, expect, it } from 'vitest';
import golden from '../public/reference/golden.json';
import { defaultScenario, pathBetween, pistonDirectivity, fieldPlane } from '../src/core';
import type { Vec3 } from '../src/core';
if(golden.medium.outerRadiiM.length!==3)throw new Error('Oracle radii must have three axes');
const medium={...golden.medium,outerRadiiM:golden.medium.outerRadiiM as Vec3};
describe('independent Python float64 fixtures',()=>{
  it('matches travel, all shell lengths, attenuation and directional pressure',()=>{
    for(const test of golden.paths){
      const actual=pathBetween(test.start as Vec3,test.end as Vec3,medium,golden.frequencyHz,test.homogeneous);
      expect(actual.travelTimeS).toBeCloseTo(test.expected.travelTimeS,12);
      expect(actual.amplitude).toBeCloseTo(test.expected.amplitude,8);
      expect(actual.attenuationDb).toBeCloseTo(test.expected.attenuationDb,8);
      for(const [key,value] of Object.entries(test.expected.layerLengthsM))expect(actual.layerLengthsM[key]).toBeCloseTo(value,10);
    }
  });
  it('matches independent piston Bessel response including sidelobes',()=>{
    for(const test of golden.piston)expect(pistonDirectivity(test.argument)).toBeCloseTo(test.expected,8);
  });
  it('matches complex field for homogeneous, uncorrected and corrected phases',()=>{
    for(const test of golden.fields){
      const s=defaultScenario();s.medium=medium;s.frequencyHz=golden.frequencyHz;s.assumedSoundSpeedMps=golden.assumedSoundSpeedMps;s.mode=test.mode as typeof s.mode;
      s.array.elements=golden.elements.map((e,id)=>({...e,id,position:e.position as Vec3,normal:e.normal as Vec3,enabled:true,azimuthRad:0,polarRad:0}));
      // 3x3 field has the requested fixture point exactly at its center.
      s.targetM=test.point as Vec3;
      const f=fieldPlane(s,{delaysS:new Float64Array(test.delaysS),weights:new Float64Array(test.weights),activeIds:s.array.elements.map(e=>e.id),driveEnergy:1,acquisitions:[0]},3);
      expect(f.real[4]).toBeCloseTo(test.expected.real,6);expect(f.imag[4]).toBeCloseTo(test.expected.imag,6);expect(f.magnitude[4]).toBeCloseTo(test.expected.magnitude,6);
    }
  });
});
