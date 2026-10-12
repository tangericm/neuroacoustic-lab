import { defaultFlowConfig, createFlowEnsemble, buildDasPlan, applyDasPlan, vesselDistance } from '../core/flow/acquisition';
import { decomposeTemporal, filterTemporalSubspace, powerMap, lagOneDoppler } from '../core/flow/processing';
import { trackAxialNcc } from '../core/flow/motion';
import type { ComplexFrames, FlowConfig, FlowFixture, FlowMetric } from '../core/flow/types';

const maximum=(values:ArrayLike<number>)=>{let m=0;for(let i=0;i<values.length;i++)m=Math.max(m,values[i]);return m;};
const median=(values:number[])=>{if(!values.length)return null;const sorted=values.slice().sort((a,b)=>a-b);return sorted[Math.floor(sorted.length/2)];};
const energy=(x:ComplexFrames)=>{let sum=0;for(let i=0;i<x.real.length;i++)sum+=x.real[i]**2+x.imag[i]**2;return sum;};
const compact=(v:number)=>Number(v.toPrecision(8));

export function generateFlowCase(config:FlowConfig=defaultFlowConfig()){
  const timingsMs:Record<string,number>={};let start=performance.now();
  const acquisition=createFlowEnsemble(config);timingsMs.rf=performance.now()-start;start=performance.now();
  const plan=buildDasPlan(config,acquisition.elements);timingsMs.delayPlan=performance.now()-start;start=performance.now();
  const iq=applyDasPlan(config,acquisition.elements,acquisition.mixed,plan);timingsMs.beamform=performance.now()-start;start=performance.now();
  const svd=decomposeTemporal(iq),filtered=filterTemporalSubspace(iq,svd,config.clutterRank);timingsMs.svd=performance.now()-start;start=performance.now();
  const before=powerMap(iq),after=powerMap(filtered),referencePower=maximum(before),powerThreshold=maximum(after)*.03,coherenceThreshold=.8;
  const flow=lagOneDoppler(filtered,config.soundSpeedMps,config.frequencyHz,config.frameIntervalS,powerThreshold,coherenceThreshold);timingsMs.doppler=performance.now()-start;start=performance.now();
  const first=new Float64Array(iq.pixels),last=new Float64Array(iq.pixels);
  for(let p=0;p<iq.pixels;p++){first[p]=Math.hypot(iq.real[p],iq.imag[p]);const i=(config.frames-1)*iq.pixels+p;last[p]=Math.hypot(iq.real[i],iq.imag[i]);}
  const displacement=trackAxialNcc(first,last,config.size,config.extentM,config.centerZM,.8);timingsMs.motion=performance.now()-start;start=performance.now();
  const tissue=applyDasPlan(config,acquisition.elements,acquisition.tissue,plan),blood=applyDasPlan(config,acquisition.elements,acquisition.blood,plan),noise=applyDasPlan(config,acquisition.elements,acquisition.noise,plan);
  const filteredTissue=filterTemporalSubspace(tissue,svd,config.clutterRank),filteredBlood=filterTemporalSubspace(blood,svd,config.clutterRank),filteredNoise=filterTemporalSubspace(noise,svd,config.clutterRank);
  const noiseFlow=lagOneDoppler(filteredNoise,config.soundSpeedMps,config.frequencyHz,config.frameIntervalS,powerThreshold,coherenceThreshold);
  const tubeVelocities=[[] as number[],[] as number[]],tubeCounts=[0,0];let rightSigns=0,validTube=0,geometryBiasMax=0;const errors:number[]=[],vesselBefore:number[]=[],vesselAfter:number[]=[],backgroundBefore:number[]=[],backgroundAfter:number[]=[];
  for(let z=0;z<config.size;z++)for(let x=0;x<config.size;x++){
    const px=(x/(config.size-1)-.5)*config.extentM,pz=config.centerZM+(.5-z/(config.size-1))*config.extentM,p=z*config.size+x;
    if(pz<.025||pz>.055)continue;
    const distances=acquisition.vessels.map(v=>vesselDistance(px,pz,v));
    const tube=distances[0]<.0012?0:distances[1]<.0012?1:-1;
    if(tube>=0){
      tubeCounts[tube]++;vesselBefore.push(before[p]);vesselAfter.push(after[p]);
      const d=config.probeZM-pz,txCos=d/Math.hypot(px-acquisition.elements[0].position[0],d),rxCos=acquisition.elements.reduce((sum,e)=>sum+d/Math.hypot(px-e.position[0],d),0)/config.elementCount;
      geometryBiasMax=Math.max(geometryBiasMax,Math.abs((txCos+rxCos)/2-1));
      if(flow.valid[p]){const truth=config.bloodSpeedMps*(tube===0?1:-1);tubeVelocities[tube].push(flow.velocityMps[p]);errors.push(Math.abs(flow.velocityMps[p]-truth));validTube++;if(flow.velocityMps[p]*truth>0)rightSigns++;}
    }
    if(distances.every((d,i)=>d>acquisition.vessels[i].radiusM+.003)){backgroundBefore.push(before[p]);backgroundAfter.push(after[p]);}
  }
  // Geometry selects evaluation regions only. Estimated power and validity are untouched.
  const networkBackground:number[]=[];
  const branchSamples=acquisition.vessels.filter(v=>v.role==='network').map(v=>({v,power:[] as number[],accepted:0}));
  for(let z=0;z<config.size;z++)for(let x=0;x<config.size;x++){
    const px=(x/(config.size-1)-.5)*config.extentM,pz=config.centerZM+(.5-z/(config.size-1))*config.extentM,p=z*config.size+x;
    if(px<0||pz<.025||pz>.055)continue;
    if(acquisition.vessels.every(v=>vesselDistance(px,pz,v)>v.radiusM+.002))networkBackground.push(after[p]);
    for(const b of branchSamples)if(vesselDistance(px,pz,b.v)<b.v.radiusM*.6){b.power.push(after[p]);b.accepted+=flow.valid[p];}
  }
  const average=(a:number[])=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
  const branchPowerContrastDb=branchSamples.map(b=>({id:b.v.id,contrastDb:10*Math.log10(average(b.power)/average(networkBackground)),coverage:b.accepted/Math.max(1,b.power.length),evaluatedPixels:b.power.length}));
  const profile=Array.from({length:config.size},(_,x)=>{
    const values:number[]=[];for(let z=0;z<config.size;z++){const pz=config.centerZM+(.5-z/(config.size-1))*config.extentM;if(pz>=.03&&pz<=.05)values.push(after[z*config.size+x]);}return average(values);
  });
  const tubePowerFwhmM=acquisition.vessels.slice(0,2).map(v=>{
    const indices=profile.map((_,x)=>x).filter(x=>Math.abs((x/(config.size-1)-.5)*config.extentM-v.pointsM[0][0])<=.0035);
    const peak=indices.reduce((a,b)=>profile[a]>profile[b]?a:b),half=profile[peak]/2;let left=peak,right=peak;
    while(left>indices[0]&&profile[left-1]>=half)left--;
    while(right<indices[indices.length-1]&&profile[right+1]>=half)right++;
    return (right-left+1)*config.extentM/(config.size-1);
  });
  const tissuePoints=displacement.filter(p=>acquisition.vessels.every(v=>vesselDistance(p.xM,p.zM,v)>v.radiusM+.003));
  const accepted=tissuePoints.filter(p=>p.valid),motionErrors=accepted.map(p=>Math.abs(p.dzM-config.tissueDisplacementM));
  const mean=(a:number[])=>a.reduce((x,y)=>x+y,0)/Math.max(1,a.length);
  const validation={branchPowerContrastDb,tubePowerFwhmM,networkPowerContrastDb:10*Math.log10(average(branchSamples.flatMap(b=>b.power))/average(networkBackground)),tissueRejectionDb:10*Math.log10(energy(tissue)/Math.max(1e-30,energy(filteredTissue))),bloodRetentionDb:10*Math.log10(Math.max(1e-30,energy(filteredBlood))/Math.max(1e-30,energy(blood))),
    vesselBackgroundBeforeDb:10*Math.log10(mean(vesselBefore)/mean(backgroundBefore)),vesselBackgroundAfterDb:10*Math.log10(mean(vesselAfter)/mean(backgroundAfter)),
    tubeMedianVelocityMps:tubeVelocities.map(median),tubeTruthVelocityMps:[config.bloodSpeedMps,-config.bloodSpeedMps],tubeCoverage:validTube/Math.max(1,tubeCounts[0]+tubeCounts[1]),tubeSignAccuracy:validTube?rightSigns/validTube:null,tubeVelocityMaeMps:errors.length?mean(errors):null,
    motionMedianM:median(accepted.map(p=>p.dzM)),motionMedianAbsoluteErrorM:median(motionErrors),motionCoverage:accepted.length/Math.max(1,tissuePoints.length),motionEvaluated:tissuePoints.length,
    noiseOnlyValidFraction:noiseFlow.valid.reduce((a,b)=>a+b,0)/iq.pixels,nearAxisMeanSensitivityMaxRelativeBias:geometryBiasMax,gramResidual:svd.residual,
    evaluation:'Tube interiors within 1.2 mm of centers and z=25–55 mm; tissue/background excludes vessel radius plus 3 mm. Branch interiors use 0.6 times radius and z=25–55 mm; network background is x>=0 with 2 mm vessel guard. Junction pixels may count in both connected branches. Tube FWHM counts contiguous half-peak bins in z=30–50 mm mean-power profiles within 3.5 mm of each center; finite-vessel speckle widths, not point-spread-function measurements. Truth masks are evaluation only. Noise-only uses the mixed-data projector and identical mixed-data gates. Near-axis bias uses unweighted receive-direction mean, a geometry diagnostic rather than a correction.'};
  timingsMs.componentValidation=performance.now()-start;
  return {config,acquisition,plan,iq,filtered,svd,before,after,flow,displacement,powerThreshold,coherenceThreshold,referencePower,timingsMs,validation};
}

export function flowFixture(result:ReturnType<typeof generateFlowCase>,provenance:FlowFixture['provenance']):FlowFixture{
  const {config:c,iq,acquisition:a,validation:v}=result;
  const frameIndices=Array.from(new Set(Array.from({length:8},(_,i)=>Math.round(i*(c.frames-1)/7))));
  let referenceAmplitude=0;for(let i=0;i<iq.real.length;i++)referenceAmplitude=Math.max(referenceAmplitude,Math.hypot(iq.real[i],iq.imag[i]));
  const bmode=frameIndices.map(t=>Array.from({length:iq.pixels},(_,p)=>{const i=t*iq.pixels+p,db=20*Math.log10(Math.max(1e-15,Math.hypot(iq.real[i],iq.imag[i]))/referenceAmplitude);return Math.round(255*Math.max(0,Math.min(1,(db+55)/55)));}));
  const traces=[0,Math.floor((c.frames-1)/2),c.frames-1].flatMap(frame=>[0,Math.floor(c.elementCount/2)].map(receiver=>({frame,receiver,values:Array.from(a.mixed.subarray((frame*c.elementCount+receiver)*c.samples,(frame*c.elementCount+receiver+1)*c.samples),compact)})));
  const metric=(label:string,value:number|null,unit:string,scope:string):FlowMetric=>({label,value,unit,scope});
  return {version:1,kind:'temporal-flow-imaging',config:c,plane:{size:c.size,extentM:c.extentM,centerM:[0,0,c.centerZM],axes:'xz',rowDirection:'decreasing-z'},
    acquisition:{channelShape:[c.frames,1,c.elementCount,c.samples],axisOrder:['slowTime','transmit','receive','fastTime'],timeOriginS:0,transmitIndex:0,frameTimesS:Array.from({length:c.frames},(_,i)=>i*c.frameIntervalS),noiseRms:a.noiseRms},
    truth:{vessels:a.vessels,tissueDisplacementM:c.tissueDisplacementM,description:'Original procedural centerline network and opposite-flow tubes. Prescribed scatterer transport with deterministic outflow wrapping; no CFD, conservation-of-flow, anatomical or clinical claim. Tissue translates separately; vessel walls are not simulated.'},
    cine:{frameIndices,timeMs:frameIndices.map(f=>f*c.frameIntervalS*1000),bmode,referenceAmplitude,floorDb:-55},
    power:{before:Array.from(result.before,compact),after:Array.from(result.after,compact),referencePower:result.referencePower,floorDb:-40},
    flow:{velocityMps:result.flow.velocityMps.map(compact),coherence:result.flow.coherence.map(compact),valid:result.flow.valid,nyquistMps:c.soundSpeedMps/(4*c.frequencyHz*c.frameIntervalS),positiveDirection:'+z, toward the probe',powerThreshold:result.powerThreshold,coherenceThreshold:result.coherenceThreshold},
    displacement:{points:result.displacement,fromFrame:0,toFrame:c.frames-1,truthM:c.tissueDisplacementM,confidenceThreshold:.8,searchRadiusPixels:3},
    spectrum:{singularValues:result.svd.singularValues,removedModes:c.clutterRank},rf:{timeUs:Array.from({length:c.samples},(_,i)=>i/c.samplingRateHz*1e6),traces,referenceAmplitude:maximum(a.mixed.map(Math.abs))},
    metrics:[metric('Tissue rejection',v.tissueRejectionDb,'dB','Same mixed-data projector applied to tissue-only oracle; energy over all pixels and times.'),metric('Blood retained',100*10**(v.bloodRetentionDb/10),'%','Same mixed-data projector applied to blood-only oracle; energy, not vessel detection sensitivity.'),metric('Flow error',v.tubeVelocityMaeMps===null?null:v.tubeVelocityMaeMps*1000,'mm/s','MAE on valid pixels in guarded calibration-tube interiors.'),metric('Flow coverage',v.tubeCoverage*100,'%','Valid fraction of guarded tube-interior pixels.'),metric('Flow direction',v.tubeSignAccuracy===null?null:v.tubeSignAccuracy*100,'% correct','Among valid calibration-tube pixels; positive is toward probe.'),metric('Tissue shift',v.motionMedianM===null?null:v.motionMedianM*1000,'mm',`Median valid tissue NCC estimate; known shift ${(c.tissueDisplacementM*1000).toFixed(2)} mm.`),metric('Motion error',v.motionMedianAbsoluteErrorM===null?null:v.motionMedianAbsoluteErrorM*1e6,'µm','Median absolute error on valid tissue-background windows.'),metric('Motion coverage',v.motionCoverage*100,'%','Valid fraction of evaluation tissue windows.'),metric('Noise false detections',v.noiseOnlyValidFraction*100,'%','Noise-only IQ, mixed-data projector and same absolute acceptance gates.')],
    methods:[
      {title:'Beamform once, reuse the delays',formula:'I(x,k) = g(z)/N Σᵣ RFₐ(r, τ_TX(x) + τᵣ(x), k)',variables:`x: image position; k: frame index; r: receiver; τ: path length / sound speed; RFₐ: analytic RF; N=${c.elementCount}; g(z): fixed geometry-only depth gain. Gaussian carrier f₀=${c.frequencyHz/1e6} MHz, σ=0.7/f₀=${.7e6/c.frequencyHz} µs; amplitude-spectrum FWHM ≈${Math.round(Math.sqrt(2*Math.log(2))*c.frequencyHz/(Math.PI*.7)/1000)} kHz.`,explanation:'The same cached sample indices and interpolation fractions align the measured RF channels in every frame. Known depth loss is compensated by the same row gain in every frame. Keep the complex result before envelope display.',limitation:'Homogeneous 1560 m/s, independent point scattering, one central divergent transmit. Chosen phantom attenuation (0.5 dB/cm/MHz) and piston directivity use a center-frequency approximation despite the finite pulse bandwidth; depth gain also amplifies deep noise; not a plane-wave or full-wave solver.'},
      {title:'Separate dominant tissue motion',formula:'G = XᴴX; GV = V diag(σ²); Y = X(Id − V₂V₂ᴴ)',variables:`X: pixels × ${c.frames} complex frames; H: conjugate transpose; σ: singular values; V₂: first two temporal modes; Y: retained signal.`,explanation:`A ${c.frames}×${c.frames} Hermitian Gram decomposition supplies the same temporal subspace as SVD. Remove two modes, fixed before held-out tests; use no vessel mask.`,limitation:'Tissue and blood can share temporal modes. Slow blood may be removed, and some tissue/noise remains. This is a fixed synthetic example, not adaptive clinical classification.'},
      {title:'Measure flow power and axial direction',formula:'P = meanₖ |Yₖ|²; R₁ = Σₖ Yₖ₊₁ conj(Yₖ); v_z = c arg(R₁)/(4πf₀Δt)',variables:`k: frame index; P: mean signal power; R₁: lag-one correlation; c=${c.soundSpeedMps} m/s; f₀=${c.frequencyHz/1e6} MHz; Δt=${c.frameIntervalS*1000} ms between frames.`,explanation:'Power reveals moving scatterers. Correlation phase estimates axial motion; accept pixels only above 3% of peak retained power and coherence 0.8.',limitation:'Axial approximation for a divergent transmit and receive aperture; angle bias, aliasing and decorrelation remain. Transverse velocity is not measured. Weak pixels are invalid, not stationary.'},
      {title:'Track tissue on the unfiltered branch',formula:'NCC(d) = Σ[(A−Ā)(B_d−B̄_d)] / √[Σ(A−Ā)² Σ(B_d−B̄_d)²]',variables:'A: first-frame 9×5 envelope patch; B_d: shifted last-frame patch; bars: patch means; d: axial lag; physical shift = −d × pixel pitch.',explanation:'Search ±3 pixels in 0.1-pixel increments, then fit the local peak. Reject low-variance patches, boundary peaks, NCC below 0.8, or ambiguous peaks.',limitation:'Local rigid axial motion only; no strain, elasticity, out-of-plane displacement or clinical accuracy claim. This branch uses original IQ envelopes, never blood-filtered images.'}
    ],
    compute:{timingsMs:result.timingsMs,cachedDelayEntries:result.plan.indices.length,directTravelEvaluations:c.frames*iq.pixels*(c.elementCount+1),cachedTravelEvaluations:iq.pixels*(c.elementCount+1),note:'Measured offline Node stage times; operation counts are analytical travel-distance evaluations for direct versus cached geometry, not an observed speedup. Browser plays saved outputs.'},provenance};
}
