import { acquireChannels, analyticChannels, buildArray, createPhantom, createPropagationTable, defaultScenario, distance, elementAmplitude, focusSequence, pathBetween, reconstruct, targetPressure } from '../core';
import type { Scenario, TransmitSequence, Vec3 } from '../core';
import type { DemoProvenance, FocusDemoFixture, ImagingDemoFixture } from './types';

/** Narrowband scalar-ray wave packet; no time-domain full-wave solver is implied. */
export function pulseEnvelopeAt(s:Scenario,q:TransmitSequence,point:Vec3,timeS:number):number {
  const sigma=.7/s.frequencyHz;let real=0,imag=0;
  s.array.elements.forEach((e,i)=>{
    const p=pathBetween(e.position,point,s.medium,s.frequencyHz,s.mode==='homogeneous');
    const arrival=p.travelTimeS+q.delaysS[i],dt=timeS-arrival;
    const a=q.weights[i]*elementAmplitude(s,e,point,p)*Math.exp(-.5*(dt/sigma)**2),phase=-2*Math.PI*s.frequencyHz*arrival;
    real+=a*Math.cos(phase);imag+=a*Math.sin(phase);
  });
  return Math.hypot(real,imag);
}

export function createFocusFixture(provenance:DemoProvenance,size=176):{fixture:FocusDemoFixture;frames:Int16Array;saturatedSamples:number} {
  const scenario=defaultScenario(),sequence=focusSequence(scenario);
  const count=241,stepS=.5e-6,sigma=.7/scenario.frequencyHz;
  const plane={size,extentM:.26,centerM:[0,0,0] as Vec3,axes:'xz' as const};
  const table=createPropagationTable({...scenario,targetM:plane.centerM,fieldOfViewM:plane.extentM},size);
  const np=size*size,n=scenario.array.elements.length,real=new Float64Array(count*np),imag=new Float64Array(count*np);
  // Keep the meaningful six-sigma support, avoiding a full frame×pixel×element traversal.
  for(let pixel=0;pixel<np;pixel++)for(let e=0;e<n;e++){
    const base=pixel*n+e,arrival=table.times[base]+sequence.delaysS[e],a=table.amplitudes[base]*sequence.weights[e];
    const phase=-2*Math.PI*scenario.frequencyHz*arrival,ar=a*Math.cos(phase),ai=a*Math.sin(phase);
    const first=Math.max(0,Math.ceil((arrival-6*sigma)/stepS)),last=Math.min(count-1,Math.floor((arrival+6*sigma)/stepS));
    for(let f=first;f<=last;f++){
      const dt=f*stepS-arrival,envelope=Math.exp(-.5*(dt/sigma)**2);
      real[f*np+pixel]+=ar*envelope;imag[f*np+pixel]+=ai*envelope;
    }
  }
  const pressureScale=targetPressure(scenario,sequence),frames=new Int16Array(real.length);let saturatedSamples=0;
  for(let i=0;i<real.length;i++){
    const value=Math.hypot(real[i],imag[i]);
    if(value>pressureScale)saturatedSamples++;
    frames[i]=Math.round(Math.min(1,value/pressureScale)*32767);
  }
  const targetArrivalS=Math.max(...scenario.array.elements.map((e,i)=>pathBetween(e.position,scenario.targetM,scenario.medium,scenario.frequencyHz).travelTimeS+sequence.delaysS[i]));
  return {fixture:{version:1,kind:'fixed-focused-pulse',scenario,plane,frames:{url:'/demo/focus-pressure.i16.gz',encoding:'signed-int16-le',quantity:'coherent-pulse-envelope',count,startS:0,stepS,pressureScale},targetArrivalS,delaysS:Array.from(sequence.delaysS),weights:Array.from(sequence.weights),driveEnergy:sequence.driveEnergy,
    provenance:{...provenance,assumptions:[...provenance.assumptions,
      'Scalar straight-ray finite Gaussian carrier pulse; sigma=0.7/f. Frequency-dependent losses and piston directivity are evaluated at the center frequency, a narrowband approximation.',
      'No refraction, shear conversion, reverberation or full-wave diffraction. Atlas geometry is visual context only.',
      'Pulse centers launch at the stored delays; Gaussian leading tails can precede t=0. Clip shows 0–120 microseconds, not the entire support at every plane point.',
      'Displayed quantity is the magnitude of the coherent complex pulse sum, not instantaneous signed carrier pressure. Magnitude is taken after summation, preserving constructive and destructive interference.',
      'One envelope-amplitude scale equals exact-target focused pressure for the entire clip; near-source samples can saturate. No per-frame normalization.',
      `Frame accumulation truncates each pulse beyond six sigma; ${saturatedSamples} envelope samples exceed the fixed display scale. Frames are sampled at 0.5 microseconds and encoded as nonnegative values in signed int16.`,
      `Spatial pitch is ${plane.extentM/(size-1)*1000} mm. Envelope playback reduces carrier aliasing but does not resolve every subwavelength interference fringe; this is display sampling, not full-wave convergence.`,
      'Display plane is fixed at y=0 with 260 mm extent. The target falls between pixels; raster maxima are not used as a targeting-error claim.',
      'This focused-transmit experiment does not generate the separate synthetic-aperture imaging channels.'
    ]}},frames,saturatedSamples};
}

export function createImagingFixture(provenance:DemoProvenance){
  const scenario=defaultScenario();
  scenario.array=buildArray(32);scenario.acquisitions=4;scenario.gridSize=97;scenario.fieldOfViewM=.1;
  scenario.mode='homogeneous';scenario.assumedSoundSpeedMps=1560;scenario.noiseDb=-50;
  for(const material of Object.values(scenario.medium.materials))material.soundSpeedMps=1560;
  const phantom=createPhantom(scenario);
  phantom.scatterers=phantom.scatterers.map(p=>({...p,amplitude:p.kind==='point'?8:p.amplitude*.025}));
  const channels=acquireChannels(scenario,phantom),analytic=analyticChannels(channels);
  const corrected=reconstruct(scenario,channels,false,analytic);
  const wrong=reconstruct({...scenario,assumedSoundSpeedMps:1450},channels,false,analytic);
  const [nt,nr,ns]=channels.shape;
  const partials=[1,2,4,8,16,24,32].map(receivers=>{
    if(receivers===nr)return {receivers,envelope:Array.from(corrected.envelope)};
    const samples=channels.samples.slice(),maskedAnalytic=analytic.slice();
    for(let tx=0;tx<nt;tx++)for(let rx=receivers;rx<nr;rx++){
      const first=(tx*nr+rx)*ns;samples.fill(0,first,first+ns);maskedAnalytic.fill(0,first,first+ns);
    }
    return {receivers,envelope:Array.from(reconstruct(scenario,{...channels,samples},false,maskedAnalytic).envelope)};
  });
  const traceTimeUs=Array.from({length:ns},(_,i)=>(channels.timeOriginS+i/channels.samplingRateHz)*1e6);
  const alignedTimeUs=Array.from({length:97},(_,i)=>(i-48)*.25);
  const tx=scenario.array.elements.find(e=>e.id===channels.transmitIds[0])!;
  const traces=Array.from({length:8},(_,i)=>Math.round(i*(nr-1)/7)).map(rxIndex=>{
    const receiverId=channels.receiveIds[rxIndex],rx=scenario.array.elements.find(e=>e.id===receiverId)!;
    const arrivalS=(distance(tx.position,scenario.targetM)+distance(rx.position,scenario.targetM))/1560;
    const raw=Array.from(channels.samples.subarray(rxIndex*ns,(rxIndex+1)*ns));
    const aligned=alignedTimeUs.map(t=>{
      const sample=(arrivalS+t*1e-6-channels.timeOriginS)*channels.samplingRateHz,k=Math.floor(sample),f=sample-k;
      return k>=0&&k<ns-1?raw[k]*(1-f)+raw[k+1]*f:0;
    });
    return {receiverId,arrivalS,raw,aligned};
  });
  const fixture:ImagingDemoFixture={version:1,kind:'synthetic-aperture-imaging',scenario,
    plane:{size:scenario.gridSize,extentM:scenario.fieldOfViewM,centerM:scenario.targetM,axes:'xz'},
    channelShape:channels.shape,samplingRateHz:channels.samplingRateHz,timeOriginS:channels.timeOriginS,transmitIds:channels.transmitIds,receiveIds:channels.receiveIds,
    traceTimeUs,alignedTimeUs,traces,pointTargetsM:phantom.scatterers.filter(p=>p.kind==='point').map(p=>p.positionM),
    calibratedEnvelope:Array.from(corrected.envelope),uncalibratedEnvelope:Array.from(wrong.envelope),partials,
    display:{referencePeak:corrected.peak,floorDb:-55},calibration:{actualSoundSpeedMps:1560,assumedSoundSpeedMps:1450},channelsUrl:'/demo/imaging-rf.f32.gz',
    provenance:{...provenance,assumptions:[...provenance.assumptions,
      'Separate synthetic-aperture experiment: 32 elements, four individual transmit shots, all 32 receivers. No focused-transmit delays are applied.',
      'Homogeneous propagation at 1560 m/s. Three point reflectors have amplitude 8; seeded speckle amplitudes are multiplied by 0.025; seeded receiver noise is -50 dB relative to noiseless channel peak.',
      'The phantom uses the existing deterministic createPhantom geometry and seed, with its 9 mm anechoic void. No clinical anatomy is reconstructed.',
      'Identical RF is reconstructed using deliberately incorrect 1450 m/s versus actual 1560 m/s. Both images and all partials use the calibrated full-image peak and -55 dB floor.',
      'Partials retain the full transmit×receive×sample shape and full DAS normalization, setting unused receiver signals and analytic channels to zero. Coherent interference means partial brightness need not increase monotonically.',
      'Eight displayed traces use the first transmit. Raw time is acquisition fast time; aligned time is relative to the calculated round-trip arrival at the first point target. Alignment uses linear interpolation.'
    ]}};
  return {fixture,channels,phantom};
}

/** Offline display sampling sensitivity, not acoustic-model or full-wave validation. */
export function createDisplaySamplingReport(){
  const s=defaultScenario(),q=focusSequence(s),sigma=.7/s.frequencyHz,scale=targetPressure(s,q),extent=.26;
  const timesUs=[60,70,76.98595814192193,85];
  const snapshots=new Map<number,{real:Float64Array;envelope:Float64Array}[]>();
  const tables=new Map<number,ReturnType<typeof createPropagationTable>>();
  const sample=(table:ReturnType<typeof createPropagationTable>,pixel:number,timeUs:number)=>{
    let re=0,im=0;
    for(let e=0;e<64;e++){
      const base=pixel*64+e,arrival=table.times[base]+q.delaysS[e],dt=timeUs*1e-6-arrival;
      if(Math.abs(dt)>6*sigma)continue;
      const a=table.amplitudes[base]*q.weights[e]*Math.exp(-.5*(dt/sigma)**2),phase=2*Math.PI*s.frequencyHz*dt;
      re+=a*Math.cos(phase);im+=a*Math.sin(phase);
    }
    return {real:re,envelope:Math.hypot(re,im)};
  };
  for(const size of [96,176,192,384]){
    const table=createPropagationTable({...s,targetM:[0,0,0],fieldOfViewM:extent},size);tables.set(size,table);
    snapshots.set(size,timesUs.map(timeUs=>{
      const real=new Float64Array(size*size),envelope=new Float64Array(size*size);
      for(let i=0;i<real.length;i++){const v=sample(table,i,timeUs);real[i]=v.real;envelope[i]=v.envelope;}
      return {real,envelope};
    }));
  }
  const N=384,inset=s.medium.scalpThicknessM+s.medium.skullThicknessM+s.medium.fluidThicknessM;
  const spatial=[];
  for(const size of [96,176,192])for(let k=0;k<timesUs.length;k++){
    const low=snapshots.get(size)![k],high=snapshots.get(N)![k];
    for(const quantity of ['real','envelope'] as const){
      let error=0,energy=0,count=0;
      for(let z=0;z<N;z++)for(let x=0;x<N;x++){
        const px=(x/(N-1)-.5)*extent,pz=(.5-z/(N-1))*extent,i=z*N+x;
        if((px/(s.medium.outerRadiiM[0]-inset))**2+(pz/(s.medium.outerRadiiM[2]-inset))**2>=1||high.envelope[i]<.02*scale)continue;
        const u=x/(N-1)*(size-1),v=z/(N-1)*(size-1),a=Math.min(size-2,Math.floor(u)),b=Math.min(size-2,Math.floor(v)),fx=u-a,fz=v-b;
        const interpolated=(low[quantity][b*size+a]*(1-fx)+low[quantity][b*size+a+1]*fx)*(1-fz)+(low[quantity][(b+1)*size+a]*(1-fx)+low[quantity][(b+1)*size+a+1]*fx)*fz;
        error+=(interpolated-high[quantity][i])**2;energy+=high[quantity][i]**2;count++;
      }
      spatial.push({size,timeUs:timesUs[k],quantity,relativeL2:Math.sqrt(error/energy),pixels:count});
    }
  }
  const temporal=[];
  for(const stepUs of [1,.5])for(const base of [75,76,77,78]){
    const timeUs=base+stepUs/2,size=176,table=tables.get(size)!;let maxRelative=0,error=0,energy=0,count=0;
    for(let z=0;z<size;z++)for(let x=0;x<size;x++){
      const p:Vec3=[(x/(size-1)-.5)*extent,0,(.5-z/(size-1))*extent];if(distance(p,s.targetM)>.012)continue;
      const i=z*size+x,exact=sample(table,i,timeUs).envelope;if(exact<.1*scale)continue;
      const interpolated=(sample(table,i,base).envelope+sample(table,i,base+stepUs).envelope)/2;
      const residual=interpolated-exact;maxRelative=Math.max(maxRelative,Math.abs(residual)/exact);error+=residual**2;energy+=exact**2;count++;
    }
    temporal.push({stepUs,timeUs,maxRelative,relativeL2:Math.sqrt(error/energy),pixels:count});
  }
  return {version:1,scope:'Display sampling sensitivity only; 384-square scalar-ray reference is finite-resolution and is not full-wave validation or a convergence claim.',
    configuration:{frequencyHz:s.frequencyHz,targetM:s.targetM,planeExtentM:extent,pressureScale:scale,selectedSize:176,selectedPitchMm:extent/175*1000,selectedStepUs:.5},
    metrics:{spatial:'Bilinear interpolation of each lower-resolution snapshot onto the 384-square grid. Relative L2 = sqrt(sum(error^2)/sum(reference^2)). Mask: inside acoustic brain and reference coherent envelope >= 0.02 times pressureScale. No clipping or display gamma.',
      temporal:'Linear midpoint interpolation compared with directly evaluated coherent envelope at the same 176-square pixels. Mask: within 12 mm of target and exact envelope >= 0.1 times pressureScale. maxRelative = maximum absolute error divided by exact pixel envelope; relative L2 uses the same mask.',
      choice:'Retain 0.5 microsecond frames because 1 microsecond midpoint interpolation exceeds the 10% maximum local relative-error gate. Envelope is magnitude after complex summation, so interference remains; finer unresolved fringes may persist.'},spatial,temporal};
}
