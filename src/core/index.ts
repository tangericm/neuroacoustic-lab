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
  const vector=(v:unknown):v is Vec3=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
  if(!s.medium||!vector(s.medium.outerRadiiM)||s.medium.outerRadiiM.some(r=>r<=0))throw new Error('Head radii must be three finite positive lengths');
  const thicknesses=[s.medium.scalpThicknessM,s.medium.skullThicknessM,s.medium.fluidThicknessM];
  if(thicknesses.some(v=>!Number.isFinite(v)||v<0))throw new Error('Layer thickness must be finite and nonnegative');
  if(thicknesses.reduce((a,v)=>a+v,0)>=Math.min(...s.medium.outerRadiiM))throw new Error('Layer nesting must leave positive brain radii');
  for(const name of ['water','scalp','skull','fluid','brain'] as const){
    const m=s.medium.materials?.[name];
    if(!m||!Number.isFinite(m.soundSpeedMps)||m.soundSpeedMps<=0||!Number.isFinite(m.densityKgM3)||m.densityKgM3<=0||!Number.isFinite(m.attenuationDbCmAtMHz)||m.attenuationDbCmAtMHz<0)throw new Error(`Invalid ${name} material properties`);
    if(!Number.isFinite(m.attenuationPower)||m.attenuationPower<0)throw new Error(`Invalid ${name} attenuation exponent`);
  }
  if(!s.array||!Array.isArray(s.array.elements)||s.array.elements.length<1||s.array.elements.length>128)throw new Error('Array must contain 1–128 elements');
  if(!Number.isFinite(s.array.radiusM)||s.array.radiusM<.108||s.array.radiusM>.15||!vector(s.array.rotationRad))throw new Error('Invalid array radius or rotation');
  const ids=new Set<number>();
  for(const e of s.array.elements){
    if(!Number.isInteger(e.id)||ids.has(e.id))throw new Error('Element IDs must be unique integers');ids.add(e.id);
    if(!vector(e.position))throw new Error(`Element ${e.id} position must contain three finite coordinates`);
    if(!vector(e.normal)||Math.abs(Math.hypot(...e.normal)-1)>1e-6)throw new Error(`Element ${e.id} requires a finite unit normal`);
    if(!Number.isFinite(e.radiusM)||e.radiusM<=0||e.radiusM>.004)throw new Error(`Element radius must be finite and between 0 and 4 mm`);
    if(!Number.isFinite(e.azimuthRad)||!Number.isFinite(e.polarRad)||e.polarRad<0||e.polarRad>Math.PI||typeof e.enabled!=='boolean')throw new Error(`Invalid element ${e.id} angles or enabled state`);
    if(e.position.reduce((sum,v,i)=>sum+(v/(s.medium.outerRadiiM[i]+.005))**2,0)<=1)throw new Error(`Element ${e.id} violates 5 mm head clearance`);
  }
  for(let i=0;i<s.array.elements.length;i++)for(let j=0;j<i;j++)if(distance(s.array.elements[i].position,s.array.elements[j].position)<.008-1e-12)throw new Error('Element separation must be at least 8 mm');
  if(!s.array.elements.some(e=>e.enabled))throw new Error('Enable at least one element');
  if(!Number.isFinite(s.noiseDb)||!Number.isFinite(s.seed))throw new Error('Noise and seed must be finite');
  if(!vector(s.targetM)||!isTargetValid(s))throw new Error('Target must lie inside the brain ellipsoid');
  if(!Number.isInteger(s.gridSize)||s.gridSize<16||s.gridSize>192)throw new Error('Grid must be 16–192 pixels');
  if(!Number.isFinite(s.frequencyHz)||s.frequencyHz<1e5||s.frequencyHz>1.5e6)throw new Error('Frequency must be 0.1–1.5 MHz');
  if(!Number.isInteger(s.acquisitions)||s.acquisitions<1||s.acquisitions>32)throw new Error('Acquisitions must be 1–32');
  if(!Number.isFinite(s.assumedSoundSpeedMps)||s.assumedSoundSpeedMps<1000||s.assumedSoundSpeedMps>3500)throw new Error('Invalid assumed sound speed');
  if(!Number.isFinite(s.fieldOfViewM)||s.fieldOfViewM<.02||s.fieldOfViewM>.18)throw new Error('Invalid field of view');
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
  const table=createPropagationTable(s),sequence=focusSequence(s),elementFields={size:s.gridSize,real:new Float32Array(s.gridSize*s.gridSize*s.array.elements.length),imag:new Float32Array(s.gridSize*s.gridSize*s.array.elements.length)};
  const field=fieldPlane(s,sequence,s.gridSize,table,elementFields),baseline={...s,mode:s.mode==='homogeneous'?'homogeneous' as const:'uncorrected' as const};
  const baselineField=fieldPlane(baseline,undefined,s.gridSize,table);timingsMs.field=performance.now()-tick;tick=performance.now();
  const phantom=createPhantom(s),channels=acquireChannels(s,phantom);timingsMs.rf=performance.now()-tick;tick=performance.now();
  const analytic=analyticChannels(channels),reconstruction=reconstruct(s,channels,s.mode==='corrected',analytic,table),baselineReconstruction=reconstruct(s,channels,false,analytic);
  timingsMs.reconstruction=performance.now()-tick;
  const measured=metrics(s,field,reconstruction,phantom,baseline);timingsMs.total=performance.now()-start;
  const arrays=[elementFields.real,elementFields.imag,sequence.weights,sequence.delaysS,field.real,field.imag,field.magnitude,baselineField.real,baselineField.imag,baselineField.magnitude,channels.samples,
    reconstruction.real,reconstruction.imag,reconstruction.envelope,reconstruction.db,baselineReconstruction.real,baselineReconstruction.imag,baselineReconstruction.envelope,baselineReconstruction.db];
  return {scenario:s,sequence,field,elementFields,baselineField,phantom,channels,reconstruction,baselineReconstruction,metrics:measured,timingsMs,modelVersion:MODEL_VERSION,numericBytes:arrays.reduce((a,v)=>a+v.byteLength,0)};
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
