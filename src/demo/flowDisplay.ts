import type { FlowFixture } from '../core/flow/types';

export type FlowImageKind = 'bmode' | 'power' | 'velocity';
const clamp = (x:number) => Math.max(0, Math.min(1, x));
/** Fixed presentation range from the prescribed speed, capped at the acquisition's Nyquist limit. */
export const velocityDisplayLimit=(fixture:FlowFixture)=>Math.min(fixture.flow.nyquistMps,1.5*Math.abs(fixture.config.bloodSpeedMps))||fixture.flow.nyquistMps;

/** B-mode is already log-mapped by the generator; power and velocity remain physical values. */
export function flowImagePixels(values:readonly number[], size:number, kind:FlowImageKind, reference:number, floorDb:number, valid?:readonly number[]):Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(size * size * 4);
  for (let i=0; i<size*size; i++) {
    const value=values[i]; let r=0,g=0,b=0;
    if(kind==='bmode') r=g=b=Number.isFinite(value)?Math.max(0,Math.min(255,value)):0;
    else if(kind==='power') {
      const db=value>0&&reference>0?10*Math.log10(value/reference):floorDb;
      const t=clamp((db-floorDb)/-floorDb);
      // Black → red → amber → pale yellow, one common physical power reference.
      r=255*clamp(3*t);g=255*clamp(3*t-1);b=220*clamp(3*t-2);
    } else if(!valid?.[i] || !Number.isFinite(value)) {r=45;g=52;b=57;}
    else {
      const t=clamp(Math.abs(value)/reference);
      const low=[225,229,230],high=value>=0?[239,78,70]:[59,142,245];
      [r,g,b]=low.map((v,j)=>v+(high[j]-v)*t);
    }
    pixels.set([r,g,b,255],i*4);
  }
  return pixels;
}

export function paintFlowImage(canvas:HTMLCanvasElement,values:readonly number[],fixture:FlowFixture,kind:FlowImageKind) {
  const size=fixture.plane.size;canvas.width=size;canvas.height=size;
  const context=canvas.getContext('2d');if(!context)return;
  const reference=kind==='power'?fixture.power.referencePower:kind==='velocity'?velocityDisplayLimit(fixture):fixture.cine.referenceAmplitude;
  const frame=context.createImageData(size,size);
  frame.data.set(flowImagePixels(values,size,kind,reference,fixture.power.floorDb,fixture.flow.valid));context.putImageData(frame,0,0);
}

/** x right; physical +z up. No transpose or truth-dependent masking. */
export function planePercent(x:number,z:number,plane:FlowFixture['plane']):[number,number] {
  return [50+100*(x-plane.centerM[0])/plane.extentM,50-100*(z-plane.centerM[2])/plane.extentM];
}

export function tracePolyline(values:readonly number[],times:readonly number[],reference:number):string {
  const first=times[0]??0,span=(times.at(-1)??first)-first||1;
  return values.map((v,i)=>`${100*((times[i]??first)-first)/span},${50-45*Math.max(-1,Math.min(1,v/(reference||1)))}`).join(' ');
}
