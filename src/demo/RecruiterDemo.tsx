import { lazy, Suspense, useEffect, useState } from 'react';
import { ArrowUpRight, Waves } from 'lucide-react';
import { loadFocusDemo, loadFlowDemo } from './loaders';
import type { FlowFixture } from '../core/flow/types';
import './demo.css';
const FocusedUltrasound=lazy(()=>import('./FocusedUltrasound'));
const ImagingDemo=lazy(()=>import('./FlowImagingDemo'));
type FocusData=Awaited<ReturnType<typeof loadFocusDemo>>;
function Loading(){return <div className="recruiter-loading" role="status"><span className="recruiter-loading-mark"/>Loading the recorded experiment…</div>;}
function LoadError({retry}:{retry:()=>void}){return <div className="recruiter-load-error" role="alert"><h3>This experiment could not load.</h3><p>Check your connection and try again. You can still open the other experience.</p><button className="recruiter-button" onClick={retry}>Retry</button></div>;}
function FocusExperience(){
  const [data,setData]=useState<FocusData>(),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setError(false);loadFocusDemo().then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[attempt]);
  if(error)return <LoadError retry={()=>setAttempt(n=>n+1)}/>;
  return data?<Suspense fallback={<Loading/>}><FocusedUltrasound fixture={data.fixture} frames={data.frames}/></Suspense>:<Loading/>;
}
function ImagingExperience(){
  const [data,setData]=useState<FlowFixture>(),[error,setError]=useState(false),[attempt,setAttempt]=useState(0);
  useEffect(()=>{let active=true;setError(false);loadFlowDemo().then(value=>{if(active)setData(value);}).catch(()=>{if(active)setError(true);});return()=>{active=false;};},[attempt]);
  if(error)return <LoadError retry={()=>setAttempt(n=>n+1)}/>;
  return data?<Suspense fallback={<Loading/>}><ImagingDemo fixture={data}/></Suspense>:<Loading/>;
}
export default function RecruiterDemo(){
  const [experience,setExperience]=useState<'focus'|'imaging'>('focus');
  return <div className="recruiter-demo">
    <header className="recruiter-header"><a href="/" className="recruiter-brand"><Waves size={25} strokeWidth={1.5}/><span>NEUROACOUSTIC <b>LAB</b></span></a><a href="?view=lab" className="recruiter-advanced">Advanced lab <ArrowUpRight size={16}/></a></header>
    <main className="recruiter-main">
      <div className="recruiter-intro"><span className="recruiter-eyebrow">AN INTERACTIVE EXPLAINER</span><h1>Two ways to use ultrasound.</h1><p>Focus sound on a point. Build an image from echoes.<br className="recruiter-desktop-break"/> Two separate experiments, with the science visible.</p></div>
      <nav className="recruiter-experiences" aria-label="Choose an experience"><button aria-pressed={experience==='focus'} onClick={()=>setExperience('focus')}><span>01</span> Focused ultrasound</button><button aria-pressed={experience==='imaging'} onClick={()=>setExperience('imaging')}><span>02</span> Ultrasound imaging</button></nav>
      <section className="recruiter-experience" aria-label={experience==='focus'?'Focused ultrasound experiment':'Ultrasound imaging experiment'}>
        {experience==='focus'?<><div className="recruiter-section-heading"><span className="recruiter-eyebrow">SEND SOUND</span><h2>64 sources. One arrival.</h2><p>A fixed array sends a short pulse toward one target inside the brain. Timing brings the waves together.</p></div><FocusExperience/></>:<ImagingExperience/>}
      </section>
      <details className="recruiter-underhood"><summary>Under the hood <span>Model, data & limitations</span></summary><div className="recruiter-method-grid"><section><h3>What you are seeing</h3><p>These are frozen, reproducible numerical experiments. The focus movie follows a short acoustic pulse. The imaging experiment uses its own linear probe, moving vessel phantom, and reusable core for beamforming, clutter filtering, flow, and displacement.</p><p>The brain atlas provides anatomical context; ellipsoid layers define the acoustic model.</p></section><section><h3>Where the model stops</h3><p>Straight-path scalar propagation includes travel time, attenuation and element directionality. It does not model refraction, elastic waves, multiple reflections, heating or biological effects.</p><p>Relative pressure and synthetic images demonstrate algorithms. They are not clinical predictions.</p></section></div><div className="recruiter-method-links"><a href="?view=lab">Explore the advanced lab & methods <ArrowUpRight size={14}/></a><a href="https://github.com/tangericm/ultrasound-lab" target="_blank" rel="noreferrer">Source & reproducibility <ArrowUpRight size={14}/></a><a href="/demo/focus.json">Focus fixture</a><a href="/demo/flow.json">Imaging fixture</a></div></details>
    </main>
    <footer className="recruiter-footer"><span>Independent project by Eric Tang</span><span>Synthetic data · transparent assumptions</span><a href="https://github.com/tangericm/ultrasound-lab" target="_blank" rel="noreferrer">View source <ArrowUpRight size={14}/></a></footer>
  </div>;
}
