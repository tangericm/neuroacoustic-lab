import type { Medium, PathResult, Scenario, Vec3, ArrayElement, TransmitSequence, FieldPlane } from './types';
const TAU=2*Math.PI;
export const distance=(a:Vec3,b:Vec3)=>Math.hypot(a[0]-b[0],a[1]-b[1],a[2]-b[2]);
type Layer='water'|'scalp'|'skull'|'fluid'|'brain';
const names:Layer[]=['water','scalp','skull','fluid','brain'];
export function pathBetween(start:Vec3,end:Vec3,medium:Medium,frequencyHz:number,homogeneous=false):PathResult {
  return preparePathSolver(medium,frequencyHz,homogeneous)(start,end);
}
/** Batch-local immutable coefficients; callers rebuild after any material/frequency edit. */
export function preparePathSolver(medium:Medium,frequencyHz:number,homogeneous=false):(start:Vec3,end:Vec3)=>PathResult {
  const depths=[0,medium.scalpThicknessM,medium.scalpThicknessM+medium.skullThicknessM,medium.scalpThicknessM+medium.skullThicknessM+medium.fluidThicknessM];
  const boundaries=depths.map(depth=>medium.outerRadiiM.map(r=>1/((r-depth)*(r-depth))));
  const speeds=names.map(name=>medium.materials[name].soundSpeedMps);
  const impedances=names.map((name,i)=>medium.materials[name].densityKgM3*speeds[i]);
  const attenuation=names.map(name=>{const m=medium.materials[name];return 100*m.attenuationDbCmAtMHz*(frequencyHz/1e6)**m.attenuationPower;});
  return (start:Vec3,end:Vec3):PathResult=>{
  const d:Vec3=[end[0]-start[0],end[1]-start[1],end[2]-start[2]],lengthM=Math.hypot(...d);
  const layerLengthsM:Record<string,number>={water:0,scalp:0,skull:0,fluid:0,brain:0};
  let travelTimeS=0,attenuationDb=0,transmission=1;
  const cuts=[0,1];
  if(!homogeneous)for(const inverseRadiiSquared of boundaries){
    let a=0,b=0,c=-1;for(let k=0;k<3;k++){const inv=inverseRadiiSquared[k];a+=d[k]*d[k]*inv;b+=2*start[k]*d[k]*inv;c+=start[k]*start[k]*inv;}
    const disc=b*b-4*a*c;if(a>0&&disc>0){const root=Math.sqrt(disc);for(const t of [(-b-root)/(2*a),(-b+root)/(2*a)])if(t>1e-10&&t<1-1e-10)cuts.push(t);}
  }
  cuts.sort((a,b)=>a-b);let previous=-1;
  for(let i=1;i<cuts.length;i++){
    const t=(cuts[i]+cuts[i-1])/2;let layer=4;
    if(!homogeneous)for(let j=0;j<boundaries.length;j++){
      const inv=boundaries[j];let norm=0;for(let k=0;k<3;k++){const v=start[k]+t*d[k];norm+=v*v*inv[k];}
      if(norm>=1){layer=j;break;}
    }
    const length=(cuts[i]-cuts[i-1])*lengthM;layerLengthsM[names[layer]]+=length;
    travelTimeS+=length/speeds[layer];attenuationDb+=length*attenuation[layer];
    if(previous>=0&&previous!==layer)transmission*=2*impedances[layer]/(impedances[previous]+impedances[layer]);
    previous=layer;
  }
  return {travelTimeS,amplitude:transmission*10**(-attenuationDb/20)*.1/Math.max(.001,lengthM),attenuationDb,lengthM,layerLengthsM};
  };
}
// Small-x power series plus a stable large-x Hankel expansion for signed J1.
// Original implementation of NIST DLMF 10.17.1 and 10.17.3 (nu=1):
// https://dlmf.nist.gov/10.17.E1 and https://dlmf.nist.gov/10.17.E3.
// No third-party implementation or coefficient table is copied.
export function pistonDirectivity(x:number):number {
  const a=Math.abs(x);
  if(a<1e-8)return 1;
  if(a>=16){
    let term=1,even=1,odd=0;
    for(let k=1;k<=128;k++){
      const next=term*(4-(2*k-1)**2)/(8*k*a);
      // Asymptotic terms eventually grow: truncate before the first increase.
      if(Math.abs(next)>Math.abs(term))break;
      term=next;const signed=(Math.floor(k/2)%2===0?1:-1)*term;
      if(k%2===0)even+=signed;else odd+=signed;
      if(Math.abs(term)<Number.EPSILON*.1)break;
    }
    const phase=a-3*Math.PI/4;
    return 2*Math.sqrt(2/(Math.PI*a))*(Math.cos(phase)*even-Math.sin(phase)*odd)/a;
  }
  let term=x/2,sum=term;for(let k=1;k<60;k++){term*=-(x*x/4)/(k*(k+1));sum+=term;if(Math.abs(term)<1e-14)break;}
  return 2*sum/x;
}
export function elementAmplitude(s:Scenario,e:ArrayElement,point:Vec3,path?:PathResult):number {
  const p=path??pathBetween(e.position,point,s.medium,s.frequencyHz,s.mode==='homogeneous');
  const dot=((point[0]-e.position[0])*e.normal[0]+(point[1]-e.position[1])*e.normal[1]+(point[2]-e.position[2])*e.normal[2])/Math.max(1e-10,p.lengthM);
  if(dot<=0)return 0;
  const c=s.mode==='homogeneous'?s.medium.materials.brain.soundSpeedMps:s.medium.materials.water.soundSpeedMps;
  return p.amplitude*pistonDirectivity(TAU*s.frequencyHz/c*e.radiusM*Math.sqrt(Math.max(0,1-dot*dot)));
}
export function focusSequence(s:Scenario):TransmitSequence {
  const weights=new Float64Array(s.array.elements.length),delaysS=new Float64Array(weights.length),activeIds:number[]=[],times=new Float64Array(weights.length);
  let maxTime=0,energy=0;
  s.array.elements.forEach((e,i)=>{if(!e.enabled)return;activeIds.push(e.id);weights[i]=s.apodization==='uniform'?1:Math.max(.05,Math.cos(e.polarRad*Math.PI/(2*1.1)));energy+=weights[i]**2;
    times[i]=s.mode==='corrected'?pathBetween(e.position,s.targetM,s.medium,s.frequencyHz).travelTimeS:distance(e.position,s.targetM)/s.assumedSoundSpeedMps;maxTime=Math.max(maxTime,times[i]);});
  if(!activeIds.length)throw new Error('Enable at least one element');
  for(let i=0;i<weights.length;i++)if(weights[i]){weights[i]/=Math.sqrt(energy);delaysS[i]=maxTime-times[i];}
  const acquisitions=Array.from({length:Math.min(s.acquisitions,activeIds.length)},(_,i)=>activeIds[Math.floor(i*activeIds.length/Math.min(s.acquisitions,activeIds.length))]);
  return {weights,delaysS,activeIds,acquisitions,driveEnergy:weights.reduce((a,v)=>a+v*v,0)};
}
function complexAt(s:Scenario,q:TransmitSequence,point:Vec3):[number,number]{
  let re=0,im=0;for(let i=0;i<s.array.elements.length;i++){if(!q.weights[i])continue;const e=s.array.elements[i],p=pathBetween(e.position,point,s.medium,s.frequencyHz,s.mode==='homogeneous');
    const a=q.weights[i]*elementAmplitude(s,e,point,p),phase=-TAU*s.frequencyHz*(p.travelTimeS+q.delaysS[i]);re+=a*Math.cos(phase);im+=a*Math.sin(phase);}
  return [re,im];
}
export function targetPressure(s:Scenario,q=focusSequence(s)):number{return Math.hypot(...complexAt(s,q,s.targetM));}
export function pixelPosition(s:Scenario,x:number,z:number,size:number):Vec3 {return [s.targetM[0]+(x/(size-1)-.5)*s.fieldOfViewM,s.targetM[1],s.targetM[2]+(.5-z/(size-1))*s.fieldOfViewM];}
export interface PropagationTable { size:number; times:Float64Array; amplitudes:Float32Array }
let lastTable:{key:string;table:PropagationTable}|undefined;
export function createPropagationTable(s:Scenario,size=s.gridSize):PropagationTable {
  const key=JSON.stringify([size,s.targetM,s.fieldOfViewM,s.frequencyHz,s.medium,s.mode==='homogeneous',s.array.elements.map(e=>[e.position,e.normal,e.radiusM])]);
  if(lastTable?.key===key)return lastTable.table;
  const n=s.array.elements.length,times=new Float64Array(size*size*n),amplitudes=new Float32Array(times.length);
  const solve=preparePathSolver(s.medium,s.frequencyHz,s.mode==='homogeneous');
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const point=pixelPosition(s,x,z,size),base=(z*size+x)*n;
    for(let e=0;e<n;e++){const element=s.array.elements[e],p=solve(element.position,point);times[base+e]=p.travelTimeS;amplitudes[base+e]=elementAmplitude(s,element,point,p);}
  }
  const table={size,times,amplitudes};lastTable={key,table};return table;
}
export function fieldPlane(s:Scenario,q=focusSequence(s),size=s.gridSize,table?:PropagationTable,individual?:{size:number;real:Float32Array;imag:Float32Array}):FieldPlane {
  const real=new Float32Array(size*size),imag=new Float32Array(size*size),magnitude=new Float32Array(size*size);let peak=0;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const i=z*size+x;let r=0,j=0;
    if(table){const base=i*s.array.elements.length;for(let e=0;e<s.array.elements.length;e++){
      const phase=-TAU*s.frequencyHz*(table.times[base+e]+q.delaysS[e]),a=q.weights[e]*table.amplitudes[base+e],er=a*Math.cos(phase),ei=a*Math.sin(phase);r+=er;j+=ei;
      if(individual){individual.real[e*size*size+i]=er;individual.imag[e*size*size+i]=ei;}
    }}else [r,j]=complexAt(s,q,pixelPosition(s,x,z,size));
    real[i]=r;imag[i]=j;magnitude[i]=Math.hypot(r,j);peak=Math.max(peak,magnitude[i]);
  }
  return {size,extentM:s.fieldOfViewM,centerM:[...s.targetM],axes:'xz',real,imag,magnitude,peak};
}
