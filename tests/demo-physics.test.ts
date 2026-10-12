import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { createFocusFixture, createImagingFixture, pulseEnvelopeAt } from '../src/demo/generate-fixtures';
import { defaultScenario, distance, elementAmplitude, pathBetween, focusSequence, reconstruct } from '../src/core';
import type { DemoProvenance } from '../src/demo/types';

const provenance: DemoProvenance = { modelVersion:'test',generatedUtc:'2026-10-12T00:00:00Z',seed:1729,sourceHashes:{},assumptions:[] };
describe('frozen scientific demonstrations', () => {
  it('aligns finite pulses with fixed drive and quantizes a single absolute scale', () => {
    const {fixture,frames}=createFocusFixture(provenance,17);
    const s=defaultScenario(),q=focusSequence(s);
    expect(fixture.driveEnergy).toBeCloseTo(1,12);
    expect(fixture.targetArrivalS*1e6).toBeCloseTo(76.9859581419,8);
    const arrivals=s.array.elements.map((e,i)=>pathBetween(e.position,s.targetM,s.medium,s.frequencyHz).travelTimeS+q.delaysS[i]);
    expect(Math.max(...arrivals)-Math.min(...arrivals)).toBeLessThan(1e-18);
    const sum=s.array.elements.reduce((v,e,i)=>v+q.weights[i]*elementAmplitude(s,e,s.targetM),0);
    expect(fixture.frames.quantity).toBe('coherent-pulse-envelope');
    expect(pulseEnvelopeAt(s,q,s.targetM,fixture.targetArrivalS)).toBeCloseTo(sum,10);
    expect(pulseEnvelopeAt(s,q,s.targetM,fixture.targetArrivalS+12e-6)).toBeLessThan(sum*1e-12);
    expect(frames.length).toBe(241*17*17);
    for(const [frame,x,z] of [[120,8,4],[154,9,7],[175,7,8],[200,6,9]]) {
      const p:[number,number,number]=[(x/16-.5)*.26,0,(.5-z/16)*.26];
      const direct=pulseEnvelopeAt(s,q,p,frame*.5e-6);
      const clamped=Math.min(fixture.frames.pressureScale,direct);
      expect(Math.abs(frames[frame*289+z*17+x]/32767*fixture.frames.pressureScale-clamped)).toBeLessThan(fixture.frames.pressureScale/32767*.6+1e-6);
    }
  });
  it('takes magnitude after coherent summation, retaining destructive interference',()=>{
    // Isolated superposition test: two identical mathematical sources, not an admitted physical array.
    const s=defaultScenario(),e=s.array.elements[0];s.array.elements=[e,{...e,id:1}];
    const q=focusSequence(s),arrival=pathBetween(e.position,s.targetM,s.medium,s.frequencyHz).travelTimeS;
    expect(pulseEnvelopeAt(s,q,s.targetM,arrival)).toBeCloseTo(Math.SQRT2*elementAmplitude(s,e,s.targetM),10);
    q.delaysS[1]=.5/s.frequencyHz;
    expect(pulseEnvelopeAt(s,q,s.targetM,arrival+.25/s.frequencyHz)).toBeLessThan(1e-12);
  });
  it('retains channel-derived partials, shared image scale and true echo alignment', () => {
    const {fixture,channels}=createImagingFixture(provenance);
    const corrected=reconstruct(fixture.scenario,channels,false);
    expect(fixture.calibratedEnvelope).toEqual(Array.from(corrected.envelope));
    expect(fixture.partials.at(-1)!.envelope).toEqual(fixture.calibratedEnvelope);
    const masked={...channels,samples:channels.samples.slice()};
    const [nt,nr,ns]=channels.shape;
    for(let tx=0;tx<nt;tx++)for(let rx=4;rx<nr;rx++)masked.samples.fill(0,(tx*nr+rx)*ns,(tx*nr+rx+1)*ns);
    expect(fixture.partials.find(p=>p.receivers===4)!.envelope).toEqual(Array.from(reconstruct(fixture.scenario,masked,false).envelope));
    expect(fixture.display.referencePeak).toBe(corrected.peak);
    const wrong=reconstruct({...fixture.scenario,assumedSoundSpeedMps:1450},channels,false);
    expect(fixture.uncalibratedEnvelope).toEqual(Array.from(wrong.envelope));
    expect(wrong.envelope).not.toEqual(corrected.envelope);
    const s=fixture.scenario,tx=s.array.elements.find(e=>e.id===channels.transmitIds[0])!;
    for(const trace of fixture.traces){
      const rx=s.array.elements.find(e=>e.id===trace.receiverId)!;
      expect(trace.arrivalS).toBeCloseTo((distance(tx.position,s.targetM)+distance(rx.position,s.targetM))/1560,12);
      expect(trace.raw.length).toBe(fixture.traceTimeUs.length);
      expect(trace.aligned.length).toBe(fixture.alignedTimeUs.length);
      const j=fixture.alignedTimeUs.indexOf(0),k=trace.arrivalS*channels.samplingRateHz,i=Math.floor(k);
      expect(trace.aligned[j]).toBeCloseTo(trace.raw[i]*(1-(k-i))+trace.raw[i+1]*(k-i),8);
    }
  });
  // Regeneration verifies numerical content, rather than a device-specific latency budget.
  it('ships exact generated frames and RF with current source provenance',()=>{
    const saved=JSON.parse(readFileSync('public/demo/focus.json','utf8'));
    const rebuilt=createFocusFixture(saved.provenance);
    const bytes=gunzipSync(readFileSync('public/demo/focus-pressure.i16.gz'));
    expect(bytes.length).toBe(rebuilt.frames.length*2);
    for(let i=0;i<rebuilt.frames.length;i+=997)expect(bytes.readInt16LE(i*2)).toBe(rebuilt.frames[i]);
    const image=JSON.parse(readFileSync('public/demo/imaging.json','utf8'));
    const recreated=createImagingFixture(image.provenance),rf=gunzipSync(readFileSync('public/demo/imaging-rf.f32.gz'));
    expect(rf.length).toBe(recreated.channels.samples.length*4);
    for(let i=0;i<recreated.channels.samples.length;i+=127)expect(rf.readFloatLE(i*4)).toBe(recreated.channels.samples[i]);
    expect(image.calibratedEnvelope).toEqual(recreated.fixture.calibratedEnvelope);
    for(const fixture of [saved,image])for(const [path,hash] of Object.entries(fixture.provenance.sourceHashes)){
      expect(createHash('sha256').update(readFileSync(path,'utf8').replace(/\r\n/g,'\n')).digest('hex')).toBe(hash);
    }
  },15_000);
});
