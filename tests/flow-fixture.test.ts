import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {describe,expect,it} from 'vitest';
import type {FlowFixture} from '../src/core/flow/types';
describe('frozen flow scientific provenance',()=>{
  const fixture:FlowFixture=JSON.parse(readFileSync('public/demo/flow.json','utf8'));
  const validation=JSON.parse(readFileSync('public/demo/flow-validation.json','utf8'));
  it('keeps current canonical source hashes and intact independent-reference archives',()=>{
    for(const [path,expected] of Object.entries(fixture.provenance.sourceHashes))expect(createHash('sha256').update(readFileSync(path,'utf8').replace(/\r\n/g,'\n')).digest('hex')).toBe(expected);
    for(const archive of validation.archives)expect(createHash('sha256').update(readFileSync(`reference/${archive.name}`)).digest('hex')).toBe(archive.sha256);
    expect(validation.oracle.passed).toBe(true);expect(validation.oracle.errors.validMaskDisagreements).toBe(0);
  });
  it('retains fixed rank, honest coverage and the slow-flow failure case',()=>{
    expect(validation.rankFrozen).toBe(2);
    expect(validation.cases.map((v:{config:{clutterRank:number}})=>v.config.clutterRank)).toEqual([2,2,2,2]);
    const main=validation.cases[0].metrics,slow=validation.cases[3].metrics;
    expect(main.tubeCoverage).toBeGreaterThan(.8);expect(main.tubeCoverage).toBeLessThan(1);
    expect(main.tubePowerFwhmM.every((width:number)=>width<.005)).toBe(true);
    expect(main.branchPowerContrastDb).toHaveLength(7);
    expect(main.branchPowerContrastDb.every((b:{contrastDb:number})=>b.contrastDb>3)).toBe(true);
    expect(main.tubeSignAccuracy).toBeGreaterThan(.9);
    expect(main.motionMedianAbsoluteErrorM).toBeLessThan(.0001);
    // This acquisition preserves more slow flow than the old 32-frame fixture.
    // Keep its measured loss explicit: fewer than half the blood energy/pixels survive.
    expect(10 ** (slow.bloodRetentionDb / 10)).toBeLessThan(.5);
    expect(slow.tubeCoverage).toBeLessThan(main.tubeCoverage / 2);
  });
  it('ships measured maps and shared-scale cine without invalid-data substitutions',()=>{
    const pixels=fixture.plane.size**2;
    for(const a of [fixture.power.before,fixture.power.after,fixture.flow.velocityMps,fixture.flow.valid,fixture.flow.coherence]){expect(a.length).toBe(pixels);expect(a.every(Number.isFinite)).toBe(true);}
    expect(fixture.cine.bmode.every(a=>a.length===pixels&&a.every(v=>Number.isInteger(v)&&v>=0&&v<=255))).toBe(true);
    expect(fixture.flow.valid.some(v=>v===0)).toBe(true);expect(fixture.flow.valid.some(v=>v===1)).toBe(true);
    expect(fixture.methods).toHaveLength(4);
  });
});
