import type { Scenario, Phantom, Vec3, ChannelData, ReconstructionResult } from './types';
import { distance, elementAmplitude, focusSequence, pathBetween, pixelPosition } from './physics';
import type { PropagationTable } from './physics';
function random(seed:number){let a=seed|0;return ()=>{a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return ((t^t>>>14)>>>0)/4294967296;};}
export function createPhantom(s:Scenario):Phantom {
  const rng=random(s.seed), cystCenterM:Vec3=[s.targetM[0]-.020,s.targetM[1],s.targetM[2]-.018],cystRadiusM=.009;
  const scatterers:Phantom['scatterers']=[];
  const inset=s.medium.scalpThicknessM+s.medium.skullThicknessM+s.medium.fluidThicknessM;
  for(let n=0;n<700;n++){
    const positionM:Vec3=[s.targetM[0]+(rng()-.5)*s.fieldOfViewM,s.targetM[1]+(rng()-.5)*.0008,s.targetM[2]+(rng()-.5)*s.fieldOfViewM];
    const a=(rng()-.5)*2;
    if(Math.hypot(positionM[0]-cystCenterM[0],positionM[2]-cystCenterM[2])<cystRadiusM)continue;
    if(positionM.reduce((sum,v,i)=>sum+(v/(s.medium.outerRadiiM[i]-inset))**2,0)>=.96)continue;
    scatterers.push({positionM,amplitude:a,kind:'speckle'});
  }
  for(const offset of [[0,0,0],[.020,0,-.025],[-.018,0,.025]])scatterers.push({positionM:s.targetM.map((v,i)=>v+offset[i]) as Vec3,amplitude:8,kind:'point'});
  return {scatterers,cystCenterM,cystRadiusM,planeYM:s.targetM[1]};
}
export function acquireChannels(s:Scenario,phantom=createPhantom(s)):ChannelData {
  const sequence=focusSequence(s),receiveIds=sequence.activeIds,transmitIds=sequence.acquisitions;
  const elements=receiveIds.map(id=>s.array.elements.find(e=>e.id===id)!);
  const txIndices=transmitIds.map(id=>receiveIds.indexOf(id)), nr=elements.length,nt=transmitIds.length;
  const count=phantom.scatterers.length, travel=new Float64Array(nr*count),amp=new Float64Array(nr*count),receiveAmp=new Float64Array(nr*count);let maxT=0;
  for(let r=0;r<nr;r++)for(let k=0;k<count;k++){
    const point=phantom.scatterers[k].positionM,p=pathBetween(elements[r].position,point,s.medium,s.frequencyHz,s.mode==='homogeneous');
    travel[r*count+k]=p.travelTimeS; amp[r*count+k]=elementAmplitude(s,elements[r],point,p);
    receiveAmp[r*count+k]=elementAmplitude(s,elements[r],point,pathBetween(point,elements[r].position,s.medium,s.frequencyHz,s.mode==='homogeneous'));maxT=Math.max(maxT,p.travelTimeS);
  }
  const samplingRateHz=s.frequencyHz*8,sigma=.7/s.frequencyHz,halfWidth=Math.ceil(4*sigma*samplingRateHz);
  let ns=1;while(ns<(2*maxT+8*sigma)*samplingRateHz)ns*=2;
  const samples=new Float32Array(nt*nr*ns),drive=1/Math.sqrt(nt);
  for(let t=0;t<nt;t++)for(let r=0;r<nr;r++){
    const base=(t*nr+r)*ns;
    for(let k=0;k<count;k++){
      const time=travel[txIndices[t]*count+k]+travel[r*count+k], center=time*samplingRateHz;
      const a=phantom.scatterers[k].amplitude*amp[txIndices[t]*count+k]*receiveAmp[r*count+k]*drive;
      for(let j=Math.max(0,Math.floor(center)-halfWidth);j<=Math.min(ns-1,Math.ceil(center)+halfWidth);j++){
        const dt=j/samplingRateHz-time;samples[base+j]+=a*Math.exp(-.5*(dt/sigma)**2)*Math.cos(2*Math.PI*s.frequencyHz*dt);
      }
    }
  }
  let peak=0;for(const v of samples)peak=Math.max(peak,Math.abs(v));
  const rng=random(s.seed^0x13579),noise=peak*10**(s.noiseDb/20);
  for(let i=0;i<samples.length;i+=2){const radius=Math.sqrt(-2*Math.log(Math.max(1e-12,rng())))*noise,angle=2*Math.PI*rng();samples[i]+=radius*Math.cos(angle);if(i+1<samples.length)samples[i+1]+=radius*Math.sin(angle);}
  peak=0;for(const v of samples)peak=Math.max(peak,Math.abs(v));
  return {samples,shape:[nt,nr,ns],axisOrder:['transmit','receive','fastTime'],samplingRateHz,timeOriginS:0,transmitIds,receiveIds,peak};
}
function fft(re:Float64Array,im:Float64Array,inverse=false){
  const n=re.length;for(let i=1,j=0;i<n;i++){let bit=n>>1;for(;j&bit;bit>>=1)j^=bit;j^=bit;if(i<j){[re[i],re[j]]=[re[j],re[i]];[im[i],im[j]]=[im[j],im[i]];}}
  for(let len=2;len<=n;len<<=1){const angle=(inverse?2:-2)*Math.PI/len,wr=Math.cos(angle),wi=Math.sin(angle);
    for(let i=0;i<n;i+=len){let ur=1,ui=0;for(let j=0;j<len/2;j++){
      const a=i+j,b=a+len/2,vr=re[b]*ur-im[b]*ui,vi=re[b]*ui+im[b]*ur;
      re[b]=re[a]-vr;im[b]=im[a]-vi;re[a]+=vr;im[a]+=vi;const next=ur*wr-ui*wi;ui=ur*wi+ui*wr;ur=next;
    }}
  }
  if(inverse)for(let i=0;i<n;i++){re[i]/=n;im[i]/=n;}
}
export function analyticChannels(ch:ChannelData):Float32Array {
  const ns=ch.shape[2],out=new Float32Array(ch.samples.length),re=new Float64Array(ns),im=new Float64Array(ns);
  for(let base=0;base<ch.samples.length;base+=ns){re.set(ch.samples.subarray(base,base+ns));im.fill(0);fft(re,im);
    for(let k=1;k<ns/2;k++){re[k]*=2;im[k]*=2;}for(let k=ns/2+1;k<ns;k++){re[k]=0;im[k]=0;}
    fft(re,im,true);for(let k=0;k<ns;k++)out[base+k]=im[k];
  }
  return out;
}
export function reconstruct(s:Scenario,ch:ChannelData,layered=s.mode==='corrected',analytic=analyticChannels(ch),table?:PropagationTable):ReconstructionResult {
  const size=s.gridSize,np=size*size,[nt,nr,ns]=ch.shape, real=new Float32Array(np),imag=new Float32Array(np),envelope=new Float32Array(np),db=new Float32Array(np);
  const elements=ch.receiveIds.map(id=>s.array.elements.find(e=>e.id===id)!),txIndices=ch.transmitIds.map(id=>ch.receiveIds.indexOf(id));
  const elementIndices=ch.receiveIds.map(id=>s.array.elements.findIndex(e=>e.id===id));
  const travel=new Float64Array(nr);let peak=0;
  for(let z=0;z<size;z++)for(let x=0;x<size;x++){
    const i=z*size+x,point=pixelPosition(s,x,z,size);let r=0,j=0;
    for(let e=0;e<nr;e++)travel[e]=layered?(table?table.times[i*s.array.elements.length+elementIndices[e]]:pathBetween(elements[e].position,point,s.medium,s.frequencyHz).travelTimeS):distance(elements[e].position,point)/s.assumedSoundSpeedMps;
    for(let t=0;t<nt;t++)for(let e=0;e<nr;e++){
      const sample=(travel[txIndices[t]]+travel[e]-ch.timeOriginS)*ch.samplingRateHz,k=Math.floor(sample),f=sample-k;
      if(k<0||k>=ns-1)continue;const base=(t*nr+e)*ns+k;
      r+=ch.samples[base]*(1-f)+ch.samples[base+1]*f;j+=analytic[base]*(1-f)+analytic[base+1]*f;
    }
    const norm=nr*Math.sqrt(nt);real[i]=r/norm;imag[i]=j/norm;envelope[i]=Math.hypot(real[i],imag[i]);peak=Math.max(peak,envelope[i]);
  }
  for(let i=0;i<np;i++)db[i]=Math.max(-80,20*Math.log10(Math.max(1e-12,envelope[i])/Math.max(1e-12,peak)));
  return {size,extentM:s.fieldOfViewM,centerM:[...s.targetM],real,imag,envelope,db,peak};
}
