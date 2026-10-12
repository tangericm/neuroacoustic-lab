import { useEffect, useRef, useState } from 'react';
import { ArrowUpRight, CheckCircle2, FlaskConical } from 'lucide-react';
import { pressureFraction, sharedPressureScale } from './reference-utils';
import './reference.css';

interface ReferenceRun {
  dxM:number; shape:number[]; dtS:number; steps:number; runtimeS:number; mode:string;
  metrics:{focalPositionM:number[];focalErrorMm:number;lateralFwhmMm:number;targetAmplitude:number;peakAmplitude:number;normalizedL2Ray:number};
  plane:{xMm:number[];zMm:number[];pressure:number[];rayPressure:number[]};
}
interface ReferenceData {
  schemaVersion:number;
  provenance:{solver:string;version:string;backend:string;hardware:string;generatedUtc:string;sources:string[]};
  config:{frequencyHz:number;elements:unknown[]|number;targetM:number[]};
  cases:{id:string;label:string;runs:ReferenceRun[];convergence:{mode:string;coarseDxMm:number;fineDxMm:number;normalizedL2:number;targetAmplitudeRelativeChange:number;focalPositionChangeMm:number;lateralFwhmChangeMm:number}[]}[];
  limitations:string[];
}
function PressureMap({run,model,scale,targetM}:{run:ReferenceRun;model:'pressure'|'rayPressure';scale:number;targetM:number[]}) {
  const ref=useRef<HTMLCanvasElement>(null);
  useEffect(()=>{
    const canvas=ref.current;if(!canvas)return;
    const width=run.plane.xMm.length,height=run.plane.zMm.length;
    if(!width||!height)return;
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');if(!ctx)return;
    const img=ctx.createImageData(width,height),values=run.plane[model];
    for(let i=0;i<width*height;i++){
      const v=Math.pow(pressureFraction(values[i]??0,scale),.55),k=i*4;
      img.data[k]=Math.round(15+v*215);img.data[k+1]=Math.round(22+v*190);img.data[k+2]=Math.round(27+v*95);img.data[k+3]=255;
    }
    ctx.putImageData(img,0,0);
    const tx=(targetM[0]*1000-run.plane.xMm[0])/(run.plane.xMm.at(-1)!-run.plane.xMm[0])*(width-1);
    const tz=(targetM[2]*1000-run.plane.zMm[0])/(run.plane.zMm.at(-1)!-run.plane.zMm[0])*(height-1);
    ctx.strokeStyle='#ffffff';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(tx-3,tz);ctx.lineTo(tx+3,tz);ctx.moveTo(tx,tz-3);ctx.lineTo(tx,tz+3);ctx.stroke();
  },[run,model,scale,targetM]);
  return <div className="reference-map"><canvas ref={ref} aria-label={`${model==='pressure'?'Full-wave':'Reduced-model'} pressure map, fixed reference geometry`}/><div className="reference-map-axis"><span>{run.plane.xMm[0]?.toFixed(0)} mm</span><span>Lateral position</span><span>{run.plane.xMm.at(-1)?.toFixed(0)} mm</span></div></div>;
}
const number=(v:unknown,digits=2)=>typeof v==='number'&&Number.isFinite(v)?v.toFixed(digits):'—';
export default function ReferencePanel(){
  const [data,setData]=useState<ReferenceData|null>(null),[error,setError]=useState(''),[selected,setSelected]=useState(0),[mode,setMode]=useState('corrected');
  useEffect(()=>{const c=new AbortController();fetch('/reference/fullwave.json',{signal:c.signal}).then(r=>{if(!r.ok)throw new Error('Reference fixture is unavailable');return r.json();}).then(setData).catch(e=>{if(e.name!=='AbortError')setError(e.message);});return()=>c.abort();},[]);
  if(error)return <section className="reference-page"><h2>Reference data could not load</h2><p>{error}. Reload to retry.</p></section>;
  if(!data)return <section className="reference-page"><p>Loading independent solver evidence…</p></section>;
  const scene=data.cases[selected]??data.cases[0];
  const runs=[...scene.runs].sort((a,b)=>a.dxM-b.dxM);
  const run=runs.find(r=>r.mode===mode)??runs[0];
  const scale=sharedPressureScale(data.cases.flatMap(c=>c.runs.flatMap(r=>[r.plane.pressure,r.plane.rayPressure])));
  return <section className="reference-page">
    <div className="reference-heading"><div><div className="reference-kicker"><FlaskConical size={15}/> Independent evidence</div><h2>A model is only as useful<br/>as its measured limits.</h2><p>Compact 3D full-wave experiments. Fixed geometry, matched drive, and visible disagreement with the live approximation.</p></div><div className="reference-provenance"><CheckCircle2 size={16}/><strong>{data.provenance.solver} {data.provenance.version}</strong><span>{data.provenance.backend} · {data.provenance.hardware}</span><span>Generated {data.provenance.generatedUtc?.slice(0,10)}</span></div></div>
    <div className="reference-case-tabs">{data.cases.map((c,i)=><button key={c.id} aria-pressed={selected===i} onClick={()=>setSelected(i)}>{c.label}</button>)}<span>500 kHz · 16 elements · frozen configuration</span></div>
    {scene.runs.some(r=>r.mode==='corrected')&&<div className="reference-case-tabs">{['uncorrected','corrected'].map(m=><button key={m} aria-pressed={mode===m} onClick={()=>setMode(m)}>{m==='corrected'?'Layer-aware delays':'Homogeneous delays'}</button>)}</div>}
    <div className="reference-map-grid"><article><div className="reference-map-title"><strong>Full-wave simulation</strong><span>Diffraction, reflection, absorption</span></div><PressureMap run={run} model="pressure" scale={scale} targetM={data.config.targetM}/></article><article><div className="reference-map-title"><strong>Reduced scalar model</strong><span>Straight paths and coherent summation</span></div><PressureMap run={run} model="rayPressure" scale={scale} targetM={data.config.targetM}/></article></div>
    <p className="reference-scale-note">White cross: geometric target. One amplitude scale across all maps. Ray source units use one free-field calibration per grid, with no bone-case fit. Values are not calibrated pressure.</p>
    <div className="reference-metrics"><div><span>Grid spacing</span><strong>{number(run.dxM*1000)} <small>mm</small></strong></div><div><span>Focus offset from target</span><strong>{number(run.metrics.focalErrorMm)} <small>mm</small></strong></div><div><span>Lateral focal width</span><strong>{number(run.metrics.lateralFwhmMm)} <small>mm</small></strong></div><div><span>Normalized field error</span><strong>{number(run.metrics.normalizedL2Ray*100,1)} <small>%</small></strong></div><div><span>Solver runtime</span><strong>{number(run.runtimeS,1)} <small>s</small></strong></div></div>
    <div className="reference-bottom"><article><h3>Resolution study</h3><p>Two grids quantify numerical sensitivity. They do not establish asymptotic convergence.</p><table><thead><tr><th>Grid</th><th>Sequence</th><th>Peak amplitude</th><th>Focus error</th><th>Runtime</th></tr></thead><tbody>{scene.runs.map((r,i)=><tr key={i}><td>{number(r.dxM*1000)} mm</td><td>{r.mode}</td><td>{number(r.metrics.peakAmplitude,3)}</td><td>{number(r.metrics.focalErrorMm)} mm</td><td>{number(r.runtimeS,1)} s</td></tr>)}</tbody></table><div className="reference-convergence">{(scene.convergence??[]).map((c,i)=><span key={i}>{c.mode}: field Δ <strong>{number(c.normalizedL2*100,2)}%</strong> · target amplitude Δ <strong>{number(c.targetAmplitudeRelativeChange*100,2)}%</strong> · focal shift <strong>{number(c.focalPositionChangeMm,3)} mm</strong></span>)}</div></article><article><h3>What this evidence covers</h3><ul>{data.limitations.map((l,i)=><li key={i}>{l}</li>)}</ul><a href="https://discovery.ucl.ac.uk/id/eprint/10154839/" target="_blank" rel="noreferrer">Transcranial benchmark methodology <ArrowUpRight size={14}/></a><a href="/reference/fullwave.json" download>Download results and provenance <ArrowUpRight size={14}/></a></article></div>
  </section>;
}
