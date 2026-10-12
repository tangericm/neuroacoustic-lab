import { analyticChannels } from '../imaging';
import { defaultScenario } from '../scenario';
import { distance, elementAmplitude, preparePathSolver } from '../physics';
import type { ArrayElement, ChannelData, Vec3 } from '../types';
import type { ComplexFrames, FlowConfig, FlowVessel } from './types';

export const defaultFlowConfig=():FlowConfig=>({seed:1729,size:97,frames:32,frameIntervalS:.002,frequencyHz:1e6,soundSpeedMps:1560,samplingRateHz:8e6,samples:1024,elementCount:32,elementPitchM:.00075,elementRadiusM:.0003,probeZM:.1,centerZM:.04,extentM:.04,tissueDisplacementM:.00043,bloodSpeedMps:.04,noiseRmsRelative:.002,clutterRank:2});
export function rng(seed:number){let state=seed>>>0;return ()=>{state=(Math.imul(state,1664525)+1013904223)>>>0;return state/4294967296;};}
export function validateFlowConfig(c:FlowConfig){
  if(!Object.values(c).every(Number.isFinite)||!Number.isInteger(c.seed)||!Number.isInteger(c.size)||c.size<17||c.size>129||!Number.isInteger(c.frames)||c.frames<3||c.frames>64||!Number.isInteger(c.elementCount)||c.elementCount<2||c.elementCount>64)throw new Error('Invalid imaging ensemble dimensions');
  if(!Number.isInteger(c.samples)||c.samples<64||(c.samples&(c.samples-1))!==0||c.samples>4096||c.frequencyHz<=0||c.soundSpeedMps<=0||c.samplingRateHz<4*c.frequencyHz||c.elementPitchM<2*c.elementRadiusM||c.elementRadiusM<=0||c.extentM<=0||c.probeZM<=c.centerZM+c.extentM/2||c.frameIntervalS<=c.samples/c.samplingRateHz||c.noiseRmsRelative<0||!Number.isInteger(c.clutterRank)||c.clutterRank<0||c.clutterRank>=c.frames)throw new Error('Invalid homogeneous imaging acquisition');
}
export function probeElements(c:FlowConfig):ArrayElement[]{
  validateFlowConfig(c);const xs=Array.from({length:c.elementCount},(_,i)=>(i-(c.elementCount-1)/2)*c.elementPitchM).sort((a,b)=>Math.abs(a)-Math.abs(b));
  return xs.map((x,id)=>({id,position:[x,0,c.probeZM],normal:[0,0,-1],radiusM:c.elementRadiusM,enabled:true,azimuthRad:0,polarRad:0}));
}
export function flowVessels(c:FlowConfig):FlowVessel[]{return [
  {id:'up-tube',pointsM:[[-.012,.02],[-.012,.06]],radiusM:.002,speedMps:c.bloodSpeedMps,role:'calibration'},
  {id:'down-tube',pointsM:[[.012,.02],[.012,.06]],radiusM:.002,speedMps:-c.bloodSpeedMps,role:'calibration'},
  {id:'trunk',pointsM:[[0,.021],[0,.037]],radiusM:.0013,speedMps:c.bloodSpeedMps*.7,role:'network'},
  {id:'left-branch',pointsM:[[0,.037],[-.005,.047],[-.005,.059]],radiusM:.0013,speedMps:c.bloodSpeedMps*.65,role:'network'},
  {id:'right-branch',pointsM:[[0,.037],[.005,.047],[.005,.059]],radiusM:.0013,speedMps:c.bloodSpeedMps*.65,role:'network'}
];}
export function vesselDistance(x:number,z:number,v:FlowVessel){let closest=Infinity;for(let j=1;j<v.pointsM.length;j++){const [ax,az]=v.pointsM[j-1],[bx,bz]=v.pointsM[j],dx=bx-ax,dz=bz-az,t=Math.max(0,Math.min(1,((x-ax)*dx+(z-az)*dz)/(dx*dx+dz*dz)));closest=Math.min(closest,Math.hypot(x-ax-t*dx,z-az-t*dz));}return closest;}
function centerline(v:FlowVessel,d:number):{position:Vec3;normal:Vec3}{
  const lengths=v.pointsM.slice(1).map((b,i)=>Math.hypot(b[0]-v.pointsM[i][0],b[1]-v.pointsM[i][1]));const total=lengths.reduce((a,b)=>a+b,0);d=((d%total)+total)%total;
  let j=0;while(j<lengths.length-1&&d>lengths[j])d-=lengths[j++];
  const a=v.pointsM[j],b=v.pointsM[j+1],length=lengths[j],ux=(b[0]-a[0])/length,uz=(b[1]-a[1])/length;
  return {position:[a[0]+ux*d,0,a[1]+uz*d],normal:[-uz,0,ux]};
}
export function createFlowEnsemble(c:FlowConfig){
  const elements=probeElements(c),vessels=flowVessels(c),random=rng(c.seed);
  const tissuePoints:{position:Vec3;amplitude:number}[]=[];
  for(let i=0;i<1800;i++){const x=(random()-.5)*.044,z=.04+(random()-.5)*.044;if(vessels.some(v=>vesselDistance(x,z,v)<v.radiusM))continue;tissuePoints.push({position:[x,0,z],amplitude:2*random()-1});}
  const bloodPoints=vessels.flatMap(v=>{const length=v.pointsM.slice(1).reduce((sum,b,i)=>sum+Math.hypot(b[0]-v.pointsM[i][0],b[1]-v.pointsM[i][1]),0);return Array.from({length:v.role==='calibration'?300:180},()=>({v,distance:random()*length,offset:(2*random()-1)*v.radiusM,amplitude:(2*random()-1)*.1}));});
  const frameLength=c.elementCount*c.samples,tissue=new Float32Array(c.frames*frameLength),blood=new Float32Array(tissue.length),noise=new Float32Array(tissue.length),mixed=new Float32Array(tissue.length);
  const s=defaultScenario();s.frequencyHz=c.frequencyHz;s.mode='homogeneous';s.medium.materials.brain.soundSpeedMps=c.soundSpeedMps;
  const solve=preparePathSolver(s.medium,c.frequencyHz,true),sigma=.7/c.frequencyHz,halfWidth=Math.ceil(4*sigma*c.samplingRateHz);
  const add=(out:Float32Array,frame:number,point:Vec3,amplitude:number)=>{
    const txPath=solve(elements[0].position,point),txAmp=elementAmplitude(s,elements[0],point,txPath);
    for(let r=0;r<c.elementCount;r++){
      const path=solve(elements[r].position,point),time=txPath.travelTimeS+path.travelTimeS,center=time*c.samplingRateHz;
      if(center+halfWidth>=c.samples)throw new Error('Fixed RF window truncates a scatterer echo');
      const a=amplitude*txAmp*elementAmplitude(s,elements[r],point,path),base=frame*frameLength+r*c.samples;
      for(let k=Math.max(0,Math.floor(center)-halfWidth);k<=Math.min(c.samples-1,Math.ceil(center)+halfWidth);k++){
        const dt=k/c.samplingRateHz-time;out[base+k]+=a*Math.exp(-.5*(dt/sigma)**2)*Math.cos(2*Math.PI*c.frequencyHz*dt);
      }
    }
  };
  for(let f=0;f<c.frames;f++){
    const translation=c.tissueDisplacementM*f/(c.frames-1);
    for(const p of tissuePoints)add(tissue,f,[p.position[0],0,p.position[2]+translation],p.amplitude);
    for(const p of bloodPoints){const line=centerline(p.v,p.distance+p.v.speedMps*f*c.frameIntervalS);add(blood,f,line.position.map((x,i)=>x+p.offset*line.normal[i]) as Vec3,p.amplitude);}
  }
  let noiselessPeak=0;for(let i=0;i<mixed.length;i++)noiselessPeak=Math.max(noiselessPeak,Math.abs(tissue[i]+blood[i]));
  const noiseRms=noiselessPeak*c.noiseRmsRelative;
  for(let f=0;f<c.frames;f++){
    const randomNoise=rng(c.seed^Math.imul(f+1,0x9e3779b9));
    for(let i=0;i<frameLength;i+=2){const radius=Math.sqrt(-2*Math.log(Math.max(1e-12,randomNoise())))*noiseRms,phase=2*Math.PI*randomNoise(),base=f*frameLength+i;noise[base]=radius*Math.cos(phase);noise[base+1]=radius*Math.sin(phase);}
  }
  for(let i=0;i<mixed.length;i++)mixed[i]=tissue[i]+blood[i]+noise[i];
  return {elements,vessels,tissue,blood,noise,mixed,noiseRms,noiselessPeak,tissueScatterers:tissuePoints.length,bloodScatterers:bloodPoints.length};
}
export interface DasPlan {indices:Int32Array;fractions:Float64Array;pixels:number;receivers:number}
export function buildDasPlan(c: FlowConfig, elements: ArrayElement[]): DasPlan {
  const pixels = c.size * c.size;
  const indices = new Int32Array(pixels * c.elementCount);
  const fractions = new Float64Array(indices.length);
  for (let z = 0; z < c.size; z++) for (let x = 0; x < c.size; x++) {
    const point: Vec3 = [
      (x / (c.size - 1) - .5) * c.extentM,
      0,
      c.centerZM + (.5 - z / (c.size - 1)) * c.extentM,
    ];
    const transmitTime = distance(elements[0].position, point) / c.soundSpeedMps;
    for (let receiver = 0; receiver < c.elementCount; receiver++) {
      const receiveTime = distance(elements[receiver].position, point) / c.soundSpeedMps;
      const sample = (transmitTime + receiveTime) * c.samplingRateHz;
      const lower = Math.floor(sample);
      const entry = (z * c.size + x) * c.elementCount + receiver;
      indices[entry] = lower >= 0 && lower < c.samples - 1
        ? receiver * c.samples + lower : -1;
      fractions[entry] = sample - lower;
    }
  }
  return { indices, fractions, pixels, receivers: c.elementCount };
}
export function applyDasPlan(
  c: FlowConfig, elements: ArrayElement[], rf: Float32Array,
  plan = buildDasPlan(c, elements),
): ComplexFrames {
  const frameLength = c.elementCount * c.samples;
  if (rf.length !== c.frames * frameLength) throw new Error('RF ensemble shape mismatch');
  const real = new Float64Array(c.frames * plan.pixels);
  const imag = new Float64Array(real.length);
  for (let frame = 0; frame < c.frames; frame++) {
    const samples = rf.subarray(frame * frameLength, (frame + 1) * frameLength);
    const channel: ChannelData = {
      samples, shape: [1, c.elementCount, c.samples],
      axisOrder: ['transmit', 'receive', 'fastTime'],
      samplingRateHz: c.samplingRateHz, timeOriginS: 0,
      transmitIds: [0], receiveIds: elements.map(e => e.id), peak: 0,
    };
    const quadrature = analyticChannels(channel);
    for (let pixel = 0; pixel < plan.pixels; pixel++) {
      let sumReal = 0, sumImag = 0;
      for (let receiver = 0; receiver < plan.receivers; receiver++) {
        const entry = pixel * plan.receivers + receiver;
        const lower = plan.indices[entry], fraction = plan.fractions[entry];
        if (lower < 0) continue;
        sumReal += samples[lower] * (1 - fraction) + samples[lower + 1] * fraction;
        sumImag += quadrature[lower] * (1 - fraction) + quadrature[lower + 1] * fraction;
      }
      real[frame * plan.pixels + pixel] = sumReal / c.elementCount;
      imag[frame * plan.pixels + pixel] = sumImag / c.elementCount;
    }
  }
  return { frames: c.frames, pixels: plan.pixels, real, imag };
}
