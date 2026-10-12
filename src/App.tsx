import { lazy, Suspense, useEffect, useState } from 'react';
const RecruiterDemo=lazy(()=>import('./demo/RecruiterDemo'));
const LabApp=lazy(()=>import('./LabApp'));
function wantsLab(){return new URLSearchParams(window.location.search).get('view')==='lab'||window.location.hash.startsWith('#s=');}
export default function App(){
  const [lab,setLab]=useState(wantsLab);
  useEffect(()=>{const update=()=>setLab(wantsLab());window.addEventListener('popstate',update);window.addEventListener('hashchange',update);return()=>{window.removeEventListener('popstate',update);window.removeEventListener('hashchange',update);};},[]);
  return <Suspense fallback={<main style={{padding:'48px',fontSize:16}} role="status">Loading the experiment…</main>}>{lab?<LabApp/>:<RecruiterDemo/>}</Suspense>;
}
