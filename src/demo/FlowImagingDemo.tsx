import { useEffect, useId, useRef, useState } from 'react';
import { ArrowRight, Pause, Play, RotateCcw } from 'lucide-react';
import type { FlowFixture } from '../core/flow/types';
import CoreCode from './CoreCode';
import { paintFlowImage, planePercent, tracePolyline, velocityDisplayLimit, type FlowImageKind } from './flowDisplay';
import './flow.css';

const steps=['Form image','Filter clutter','Measure flow','Track tissue'] as const;
const operations=['beamform','filter','flow','displacement'] as const;
const purposes=[
  'Align receiver echoes by travel time, then add them to form a moving image.',
  'Separate strong, slowly changing tissue from the weaker signals of moving blood.',
  'Measure the phase change between frames to estimate motion along the ultrasound beam.',
  'Match tissue patterns between two images to estimate their axial displacement.',
];
const mm=(m:number)=>m*1000;
const format=(value:number)=>Number.isFinite(value)?Number(value.toPrecision(4)).toLocaleString():'Unavailable';

function Image({fixture,values,label,kind='bmode',children}:{fixture:FlowFixture;values:number[];label:string;kind?:FlowImageKind;children?:React.ReactNode}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{if(ref.current)paintFlowImage(ref.current,values,fixture,kind);},[fixture,values,kind]);
  const half=fixture.plane.extentM/2;
  return <div className="flow-image"><canvas ref={ref} role="img" aria-label={label}/>{children}<span className="flow-axis-top">z {format(mm(fixture.plane.centerM[2]+half))} mm</span><span className="flow-axis-bottom">z {format(mm(fixture.plane.centerM[2]-half))} mm</span><span className="flow-axis-x">x {format(mm(fixture.plane.centerM[0]-half))} to {format(mm(fixture.plane.centerM[0]+half))} mm</span></div>;
}

function Phantom({fixture}:{fixture:FlowFixture}) {
  const id=useId();
  return <figure className="flow-truth"><h4>Prescribed phantom</h4><svg viewBox="0 0 100 100" role="img" aria-label="Ground-truth vessel paths and prescribed flow directions"><defs><marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" fill="#f0bc74"/></marker></defs>{fixture.truth.vessels.map(v=>{
    const points=v.pointsM.map(([x,z])=>planePercent(x,z,fixture.plane)),middle=Math.max(1,Math.floor(points.length/2));
    const a=points[v.speedMps<0?middle:middle-1],b=points[v.speedMps<0?middle-1:middle];
    return <g key={v.id}><polyline points={points.map(p=>p.join(',')).join(' ')} fill="none" stroke={v.role==='calibration'?'#507e89':'#345662'} strokeWidth={200*v.radiusM/fixture.plane.extentM} strokeLinecap="round" strokeLinejoin="round"/>{a&&b&&<line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="#f0bc74" strokeWidth=".6" markerEnd={`url(#${id})`}/>}</g>;
  })}</svg><figcaption>Ground truth: two axial tubes check speed and direction; branching streams test oblique flow. A known {format(mm(fixture.truth.tissueDisplacementM))} mm tissue shift tests tracking.</figcaption><p>{fixture.truth.vessels.filter(v=>v.role==='calibration').map(v=>`${v.id}: ${format(mm(v.speedMps))} mm/s`).join(' · ')}</p></figure>;
}

function RFPreview({fixture}:{fixture:FlowFixture}) {
  return <details className="flow-rf"><summary>Inspect the synthetic RF echoes</summary><p>{fixture.acquisition.channelShape[1]} transmit × {fixture.acquisition.channelShape[2]} receive channels per frame. Preview rows use the same amplitude reference.</p><div className="flow-rf-traces">{fixture.rf.traces.slice(0,6).map((trace,i)=><div className="flow-rf-row" key={i}><span>Frame {trace.frame+1} · Rx {trace.receiver+1}</span><svg viewBox="0 0 100 100" preserveAspectRatio="none" role="img" aria-label={`Recorded RF frame ${trace.frame+1}, receiver ${trace.receiver+1}`}><line x1="0" y1="50" x2="100" y2="50" stroke="#34434a"/><polyline points={tracePolyline(trace.values,fixture.rf.timeUs,fixture.rf.referenceAmplitude)} fill="none" stroke="#91e3e5" strokeWidth="1" vectorEffect="non-scaling-stroke"/></svg></div>)}</div><div className="flow-scale-labels"><span>{format(fixture.rf.timeUs[0])} μs</span><span>Fast time</span><span>{format(fixture.rf.timeUs.at(-1)??0)} μs</span></div><p>RF is the signed received waveform. The reconstruction retains complex I/Q values for temporal filtering and phase estimation.</p></details>;
}

function Spectrum({fixture}:{fixture:FlowFixture}) {
  const values=fixture.spectrum.singularValues,max=values[0]||1;
  return <figure className="flow-spectrum"><h4>Temporal singular values</h4><div className="flow-spectrum-bars" role="img" aria-label={`Singular-value spectrum. First ${fixture.spectrum.removedModes} modes removed.`}>{values.map((s,i)=><div key={i} title={`Mode ${i+1}: ${format(s)}`}><span className={i<fixture.spectrum.removedModes?'removed':''} style={{height:`${Math.max(1,100*Math.sqrt(s/max))}%`}}/>{(i===0||(i+1)%4===0||i===values.length-1)&&<small>{i+1}</small>}</div>)}</div><figcaption>Mode index · height ∝ √singular value for visibility. Amber: first {fixture.spectrum.removedModes} modes removed from complex I/Q.</figcaption></figure>;
}

function PowerLegend({fixture}:{fixture:FlowFixture}) {
  return <div className="flow-legend"><div className="flow-power-ramp"/><div className="flow-scale-labels"><span>{fixture.power.floorDb} dB</span><span>Shared power scale</span><span>0 dB</span></div></div>;
}

function Displacement({fixture}:{fixture:FlowFixture}) {
  const id=useId(),points=fixture.displacement.points.filter(p=>p.valid),d=fixture.displacement;
  const first=fixture.cine.frameIndices.indexOf(d.fromFrame),last=fixture.cine.frameIndices.indexOf(d.toFrame);
  // The display multiplier is declared; coordinates and estimates are left in physical units.
  const magnification=20;
  const max=Math.max(Math.abs(d.truthM),...points.map(p=>Math.abs(p.dzM)),1e-9)*1.2;
  return <><p className="flow-branch-note">This branch starts <strong>before clutter filtering</strong>: removing tissue would remove the signal we want to track.</p><div className="flow-pair"><figure><Image fixture={fixture} values={fixture.cine.bmode[Math.max(0,first)]} label="Unfiltered tissue image before motion"/><figcaption>Unfiltered · frame {d.fromFrame+1}</figcaption></figure><figure><Image fixture={fixture} values={fixture.cine.bmode[last<0?fixture.cine.bmode.length-1:last]} label="Unfiltered tissue image after motion"><svg className="flow-arrow-overlay" viewBox="0 0 100 100" role="img" aria-label="Estimated tissue displacement"><defs><marker id={id} viewBox="0 0 10 10" refX="8" refY="5" markerWidth="4" markerHeight="4" orient="auto"><path d="M0 0 L10 5 L0 10z" fill="#91e3e5"/></marker></defs>{points.map((p,i)=>{
    const [x,y]=planePercent(p.xM,p.zM,fixture.plane),[,end]=planePercent(p.xM,p.zM+p.dzM*magnification,fixture.plane);
    return <line key={i} x1={x} y1={y} x2={x} y2={end} stroke="#91e3e5" strokeWidth=".45" markerEnd={`url(#${id})`}/>;
  })}</svg></Image><figcaption>Unfiltered · frame {d.toFrame+1}. Estimated arrows ×{magnification} for visibility.</figcaption></figure></div><figure className="flow-displacement-chart"><h4>Known and estimated axial shift</h4><div className="flow-trace-plot"><div className="flow-trace-axis" aria-hidden="true"><span>{format(mm(max))}</span><span>0</span><span>−{format(mm(max))}</span></div><svg viewBox="0 0 600 160" preserveAspectRatio="none" role="img" aria-label="Estimated shifts at valid tissue patches compared with prescribed displacement"><line x1="35" y1="80" x2="580" y2="80" stroke="#546068"/><line x1="35" y1={80-60*d.truthM/max} x2="580" y2={80-60*d.truthM/max} stroke="#f0bc74" strokeWidth="2" strokeDasharray="7 5"/>{points.map((p,i)=><circle key={i} cx={35+545*(points.length===1?.5:i/(points.length-1))} cy={80-60*p.dzM/max} r="4" fill="#91e3e5"><title>{format(mm(p.dzM))} mm · confidence {format(p.confidence)}</title></circle>)}</svg></div><figcaption>Shift (mm) by valid patch · amber dashed: prescribed {format(mm(d.truthM))} mm; cyan: estimated. {points.length}/{d.points.length} patches pass confidence ≥{format(d.confidenceThreshold)}. NCC search radius: {d.searchRadiusPixels} pixels.</figcaption></figure></>;
}

export default function FlowImagingDemo({fixture}:{fixture:FlowFixture}) {
  const [stage,setStage]=useState(0),[frame,setFrame]=useState(0),[playing,setPlaying]=useState(false),[replayKey,setReplayKey]=useState(0);
  const [reduced,setReduced]=useState(()=>window.matchMedia?.('(prefers-reduced-motion: reduce)').matches??false);
  const [visible,setVisible]=useState(()=>!document.hidden),[inView,setInView]=useState(()=>typeof IntersectionObserver==='undefined');
  const movie=useRef<HTMLDivElement>(null),last=fixture.cine.bmode.length-1;
  const navigation=useRef<HTMLElement>(null),heading=useRef<HTMLHeadingElement>(null),moveFocus=useRef(false);
  const revealStage=()=>{heading.current?.focus({preventScroll:true});navigation.current?.scrollIntoView?.({behavior:'auto',block:'start'});};
  useEffect(()=>{if(moveFocus.current){moveFocus.current=false;revealStage();}},[stage]);
  useEffect(()=>{const mq=window.matchMedia?.('(prefers-reduced-motion: reduce)');if(!mq)return;const change=()=>{setReduced(mq.matches);if(mq.matches)setPlaying(false);};mq.addEventListener('change',change);return()=>mq.removeEventListener('change',change);},[]);
  useEffect(()=>{const change=()=>{setVisible(!document.hidden);if(document.hidden)setPlaying(false);};document.addEventListener('visibilitychange',change);return()=>document.removeEventListener('visibilitychange',change);},[]);
  useEffect(()=>{if(!movie.current||typeof IntersectionObserver==='undefined')return;const observer=new IntersectionObserver(entries=>{const shown=entries.some(e=>e.isIntersecting);setInView(shown);if(!shown)setPlaying(false);},{threshold:.05});observer.observe(movie.current);return()=>observer.disconnect();},[stage]);
  useEffect(()=>{
    if(!playing||stage!==0||reduced||!visible||!inView)return;
    const timer=window.setTimeout(()=>setFrame(i=>(i+1)%(last+1)),160);return()=>window.clearTimeout(timer);
  },[frame,last,playing,replayKey,stage,reduced,visible,inView]);
  const choose=(next:number)=>{setPlaying(false);if(next===stage){revealStage();return;}moveFocus.current=true;setStage(next);};
  const play=(restart=false)=>{if(reduced)return;if(restart){setFrame(0);setReplayKey(i=>i+1);}setPlaying(true);};
  const method=fixture.methods[stage],coverage=100*fixture.flow.valid.filter(Boolean).length/fixture.flow.valid.length;
  const relevantMetrics=fixture.metrics.filter(metric=>(stage===1?/rejection|blood/i:stage===2?/flow|noise/i:stage===3?/shift|motion/i:/$^/).test(metric.label));
  const velocityRange=velocityDisplayLimit(fixture),peakFilteredPower=fixture.power.after.reduce((peak,value)=>Math.max(peak,value),0);
  return <section className="flow-demo" aria-label="Ultrasound flow imaging"><header className="flow-heading"><h2>From echoes to flow.</h2><p>One vascular phantom. Four views of the same acquisition.</p><p className="flow-synthetic">Synthetic RF · not patient data · separate from the focused-ultrasound movie</p></header>
    <nav ref={navigation} className="flow-steps" aria-label="Imaging steps">{steps.map((name,i)=><button key={name} aria-label={name} aria-current={stage===i?'step':undefined} onClick={()=>choose(i)}><span aria-hidden="true">{i+1}</span>{name}</button>)}</nav>
    <div className="flow-stage-heading"><h3 ref={heading} tabIndex={-1}>{steps[stage]}</h3><p>{purposes[stage]}</p></div>
    {stage===0&&<><div className="flow-form-layout"><div ref={movie} className="flow-cine"><Image fixture={fixture} values={fixture.cine.bmode[frame]} label={`Beamformed B-mode frame ${fixture.cine.frameIndices[frame]+1}`}/><div className="flow-cine-controls"><span aria-live="off">{fixture.cine.timeMs[frame].toFixed(1)} ms · frame {fixture.cine.frameIndices[frame]+1}/{fixture.config.frames}</span><button disabled={reduced} onClick={()=>playing?setPlaying(false):play()}>{playing?<Pause size={16}/>:<Play size={16}/>} {playing?'Pause cine':'Play cine'}</button><button disabled={reduced} onClick={()=>play(true)}><RotateCcw size={16}/> Replay cine</button></div><p className="flow-caption">One common B-mode scale, {fixture.cine.floorDb} to 0 dB. Playback is slowed for inspection; physical frame spacing is {format(fixture.config.frameIntervalS*1000)} ms. Repeats the recorded acquisition until paused.{reduced?' Reduced motion: static frame.':''}</p></div><aside className="flow-context"><Phantom fixture={fixture}/><dl><div><dt>Center frequency</dt><dd>{format(fixture.config.frequencyHz/1e6)} MHz</dd></div><div><dt>Sound speed</dt><dd>{format(fixture.config.soundSpeedMps)} m/s</dd></div><div><dt>Acquisition</dt><dd>{fixture.acquisition.channelShape[0]} frames · {fixture.acquisition.channelShape[1]} Tx · {fixture.acquisition.channelShape[2]} Rx</dd></div></dl></aside></div><RFPreview fixture={fixture}/></>}
    {stage===1&&<><div className="flow-pair"><figure><Image fixture={fixture} values={fixture.power.before} kind="power" label="Temporal mean power before clutter filtering"/><figcaption>Before · tissue and blood</figcaption></figure><figure><Image fixture={fixture} values={fixture.power.after} kind="power" label="Temporal mean power after clutter filtering"/><figcaption>After · first {fixture.spectrum.removedModes} modes removed</figcaption></figure></div><PowerLegend fixture={fixture}/><Spectrum fixture={fixture}/><p>Filtering operates on complex I/Q coefficients across time, before envelope detection. Power is the temporal mean of squared complex magnitude. Both images use the same power reference.</p></>}
    {stage===2&&<div className="flow-form-layout"><div><Image fixture={fixture} values={fixture.flow.velocityMps} kind="velocity" label="Signed axial blood velocity estimate, invalid pixels gray"/><div className="flow-legend"><div className="flow-velocity-ramp"/><div className="flow-scale-labels"><span>−{format(mm(velocityRange))}</span><span>0 · mm/s</span><span>+{format(mm(velocityRange))}</span></div></div></div><aside className="flow-context"><h4>Direction along the beam</h4><p>Positive velocity: {fixture.flow.positiveDirection}. Blue is negative; red is positive. This estimates the axial component, not total vessel speed. Color saturates beyond ±{format(mm(velocityRange))} mm/s; estimates remain unchanged.</p><dl><div><dt>Nyquist limit</dt><dd>±{format(mm(fixture.flow.nyquistMps))} mm/s</dd></div><div><dt>Coherence threshold</dt><dd>{format(fixture.flow.coherenceThreshold)}</dd></div><div><dt>Power threshold</dt><dd>{format(100*fixture.flow.powerThreshold/(peakFilteredPower||1))}% of peak filtered power</dd></div><div><dt>Valid pixel coverage</dt><dd>{coverage.toFixed(1)}% of the image plane</dd></div></dl><p>Gray pixels fail the measured power or coherence criteria. The estimator does not use a ground-truth vessel mask.</p></aside></div>}
    {stage===3&&<Displacement fixture={fixture}/>}
    <div className="flow-highlights">{relevantMetrics.slice(0,2).map(metric=><p key={metric.label}><strong>{metric.label}: {metric.value===null?'Unavailable':format(metric.value)} {metric.unit}</strong><span>{metric.scope}</span></p>)}</div><section className="flow-method" aria-label="Method and assumptions"><h4>{method.title}</h4><p>{method.explanation}</p><div className="flow-formula">{method.formula}</div><p><strong>Variables.</strong> {method.variables}</p><p><strong>Assumption / limit.</strong> {method.limitation}</p></section>
    {relevantMetrics.length>0&&<details className="flow-metrics"><summary>Measured checks and their scope</summary><dl>{relevantMetrics.map((metric,i)=><div key={i}><dt>{metric.label}</dt><dd>{metric.value===null?'Unavailable':format(metric.value)} {metric.unit}<span>{metric.scope}</span></dd></div>)}</dl></details>}
    <CoreCode operation={operations[stage]}/>
    <div className="flow-next"><span>Step {stage+1} of {steps.length}</span>{stage<3?<button onClick={()=>choose(stage+1)}>Next: {steps[stage+1]}<ArrowRight size={16}/></button>:<button onClick={()=>choose(0)}>Return to image<ArrowRight size={16}/></button>}</div>
    <details className="flow-details"><summary>Acquisition and model details</summary><p>{fixture.truth.description}</p><p>{fixture.config.elementCount} elements at {format(mm(fixture.config.elementPitchM))} mm pitch; RF sampled at {format(fixture.config.samplingRateHz/1e6)} MHz. Frames are separated by {format(fixture.config.frameIntervalS*1000)} ms. Seed {fixture.config.seed}. The absolute filtered-power threshold is {fixture.flow.powerThreshold.toExponential(3)} in model units. {fixture.compute.note}</p><ul>{fixture.provenance.assumptions.map((a,i)=><li key={i}>{a}</li>)}</ul><p>{fixture.provenance.sources.map((source,i)=><span key={source.url}>{i>0?' · ':''}<a href={source.url}>{source.title}</a></span>)}</p><a href={fixture.provenance.referenceUrl}>Reference and validation data</a></details>
  </section>;
}
