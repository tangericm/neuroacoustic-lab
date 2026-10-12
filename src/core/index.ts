import type { Scenario, SimulationResult, ComparisonMetrics, FieldPlane, ReconstructionResult, Phantom, OptimizationResult, Vec3 } from './types';
import { defaultScenario, isTargetValid, rotate } from './scenario';
import { focusSequence, fieldPlane, pathBetween, targetPressure, distance, pixelPosition, createPropagationTable } from './physics';
import { createPhantom, acquireChannels, reconstruct, analyticChannels } from './imaging';
export * from './types';
export * from './scenario';
export * from './physics';
export * from './imaging';
export const MODEL_VERSION='scalar-straight-ray-v1';
function validate(s:Scenario){
  if(!Number.isFinite(s.noiseDb)||!Number.isFinite(s.seed))throw new Error('Noise and seed must be finite');
  if(!isTargetValid(s))throw new Error('Target must lie inside the brain ellipsoid');
  if(!Number.isInteger(s.gridSize)||s.gridSize<16||s.gridSize>192)throw new Error('Grid must be 16–192 pixels');
  if(!Number.isFinite(s.frequencyHz)||s.frequencyHz<1e5||s.frequencyHz>1.5e6)throw new Error('Frequency must be 0.1–1.5 MHz');
  if(!Number.isInteger(s.acquisitions)||s.acquisitions<1||s.acquisitions>32)throw new Error('Acquisitions must be 1–32');
  if(!Number.isFinite(s.assumedSoundSpeedMps)||s.assumedSoundSpeedMps<1000||s.assumedSoundSpeedMps>3500)throw new Error('Invalid assumed sound speed');
  if(!Number.isFinite(s.fieldOfViewM)||s.fieldOfViewM<.02||s.fieldOfViewM>.18)throw new Error('Invalid field of view');
  for(const m of Object.values(s.medium.materials))if(!Number.isFinite(m.soundSpeedMps)||m.soundSpeedMps<=0||!Number.isFinite(m.densityKgM3)||m.densityKgM3<=0||!Number.isFinite(m.attenuationDbCmAtMHz)||m.attenuationDbCmAtMHz<0)throw new Error('Invalid material properties');
}
function metrics(s:Scenario,field:FieldPlane,recon:ReconstructionResult,phantom:Phantom,baseline:Scenario):ComparisonMetrics {
  let peakIndex=0;for(let i=1;i<field.magnitude.length;i++)if(field.magnitude[i]>field.magnitude[peakIndex])peakIndex=i;
  const size=field.size,px=peakIndex%size,pz=Math.floor(peakIndex/size),peakPoint=pixelPosition(s,px,pz,size),step=s.fieldOfViewM/(size-1),half=field.peak/2;
  let left=px,right=px;while(left>0&&field.magnitude[pz*size+left-1]>=half)left--;while(right<size-1&&field.magnitude[pz*size+right+1]>=half)right++;
  const width=(right-left+1)*step;let offPeak=0,cystSum=0,cystN=0,bgSum=0,bgN=0,localPeak=-1,localIndex=0;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const i=z*size+x,p=pixelPosition(s,x,z,size);
    if(distance(p,peakPoint)>Math.max(.008,2*width))offPeak=Math.max(offPeak,field.magnitude[i]);
    const r=distance(p,phantom.cystCenterM);
    if(r<phantom.cystRadiusM*.8){cystSum+=recon.envelope[i];cystN++;}
    if(r>phantom.cystRadiusM*1.2&&r<phantom.cystRadiusM*1.8){bgSum+=recon.envelope[i];bgN++;}
    if(distance(p,s.targetM)<.012&&recon.envelope[i]>localPeak){localPeak=recon.envelope[i];localIndex=i;}
  }
  const q=focusSequence(s),pressure=targetPressure(s,q),base=targetPressure(baseline);
  const attenuation=s.array.elements.filter(e=>e.enabled).map(e=>pathBetween(e.position,s.targetM,s.medium,s.frequencyHz,s.mode==='homogeneous').attenuationDb);
  return {targetPressure:pressure,targetGainDb:20*Math.log10(Math.max(1e-12,pressure)/Math.max(1e-12,base)),focalErrorM:distance(peakPoint,s.targetM),
    focalWidthM:width,sidelobeDb:20*Math.log10(Math.max(1e-12,offPeak)/Math.max(1e-12,field.peak)),meanAttenuationDb:attenuation.reduce((a,v)=>a+v,0)/attenuation.length,
    driveEnergy:q.driveEnergy,activeElements:q.activeIds.length,cystContrastDb:20*Math.log10(Math.max(1e-12,cystSum/Math.max(1,cystN))/Math.max(1e-12,bgSum/Math.max(1,bgN))),
    localizationErrorM:distance(pixelPosition(s,localIndex%size,Math.floor(localIndex/size),size),s.targetM)};
}
export function simulate(s:Scenario=defaultScenario()):SimulationResult {
  validate(s);const start=performance.now(),timingsMs:Record<string,number>={};let tick=start;
  const table=createPropagationTable(s),sequence=focusSequence(s),field=fieldPlane(s,sequence,s.gridSize,table),baseline={...s,mode:s.mode==='homogeneous'?'homogeneous' as const:'uncorrected' as const};
  const baselineField=fieldPlane(baseline,undefined,s.gridSize,table);timingsMs.field=performance.now()-tick;tick=performance.now();
  const phantom=createPhantom(s),channels=acquireChannels(s,phantom);timingsMs.rf=performance.now()-tick;tick=performance.now();
  const analytic=analyticChannels(channels),reconstruction=reconstruct(s,channels,s.mode==='corrected',analytic,table),baselineReconstruction=reconstruct(s,channels,false,analytic);
  timingsMs.reconstruction=performance.now()-tick;
  const measured=metrics(s,field,reconstruction,phantom,baseline);timingsMs.total=performance.now()-start;
  const arrays=[sequence.weights,sequence.delaysS,field.real,field.imag,field.magnitude,baselineField.real,baselineField.imag,baselineField.magnitude,channels.samples,
    reconstruction.real,reconstruction.imag,reconstruction.envelope,reconstruction.db,baselineReconstruction.real,baselineReconstruction.imag,baselineReconstruction.envelope,baselineReconstruction.db];
  return {scenario:s,sequence,field,baselineField,phantom,channels,reconstruction,baselineReconstruction,metrics:measured,timingsMs,modelVersion:MODEL_VERSION,numericBytes:arrays.reduce((a,v)=>a+v.byteLength,0)};
}
export async function optimizePlacement(s:Scenario,onProgress?:(completed:number,total:number)=>void):Promise<OptimizationResult>{
  validate(s);const start=performance.now(),initial=20*Math.log10(Math.max(1e-12,targetPressure(s))),candidates:OptimizationResult['candidates']=[];
  let best=s,bestScore=initial;const total=27;
  for(const dr of [-.006,0,.006])for(const rx of [-.14,0,.14])for(const ry of [-.14,0,.14]){
    const radiusM=Math.max(.108,Math.min(.15,s.array.radiusM+dr)),delta:Vec3=[rx,ry,0],rotationRad=s.array.rotationRad.map((v,i)=>v+delta[i]) as Vec3;
    const candidate:Scenario={...s,array:{...s.array,radiusM,rotationRad,elements:s.array.elements.map(e=>{
      const u=rotate([Math.sin(e.polarRad)*Math.cos(e.azimuthRad),Math.sin(e.polarRad)*Math.sin(e.azimuthRad),Math.cos(e.polarRad)],rotationRad);
      return {...e,position:u.map(v=>v*radiusM) as Vec3,normal:u.map(v=>-v) as Vec3};
    })}};
    const valid=candidate.array.elements.every(e=>e.position.reduce((sum,v,i)=>sum+(v/(s.medium.outerRadiiM[i]+.005))**2,0)>1&&candidate.array.elements.every(o=>o.id===e.id||distance(e.position,o.position)>=.008));
    const pressure=valid?targetPressure(candidate):0,objectiveDb=20*Math.log10(Math.max(1e-12,pressure));candidates.push({rotationRad,radiusM,objectiveDb,targetPressure:pressure});
    if(valid&&objectiveDb>bestScore){bestScore=objectiveDb;best=candidate;}onProgress?.(candidates.length,total);
    await new Promise<void>(resolve=>setTimeout(resolve,0));
  }
  return {scenario:best,candidates,initialObjectiveDb:initial,finalObjectiveDb:bestScore,elapsedMs:performance.now()-start};
}
