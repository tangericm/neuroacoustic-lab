import { describe,expect,it } from 'vitest';
import { decomposeTemporal, filterTemporalSubspace, lagOneDoppler, powerMap } from '../src/core/flow/processing';
import { defaultFlowConfig, createFlowEnsemble, buildDasPlan, applyDasPlan } from '../src/core/flow/acquisition';
import { trackAxialNcc } from '../src/core/flow/motion';
describe('shared temporal ultrasound processing',()=>{
  it('removes coherent modes with a complex Hermitian Gram decomposition',()=>{
    const frames=16,pixels=3,real=new Float64Array(frames*pixels),imag=new Float64Array(real.length);
    for(let t=0;t<frames;t++)for(let p=0;p<pixels;p++){const phase=2*Math.PI*(p+1)*t/frames,a=[5,2,.3][p];real[t*pixels+p]=a*Math.cos(phase);imag[t*pixels+p]=a*Math.sin(phase);}
    const x={frames,pixels,real,imag},svd=decomposeTemporal(x),y=filterTemporalSubspace(x,svd,2);
    expect(svd.singularValues.slice(0,3)).toEqual(expect.arrayContaining([expect.closeTo(20,8),expect.closeTo(8,8),expect.closeTo(1.2,8)]));
    for(let t=0;t<frames;t++){expect(Math.hypot(y.real[t*3],y.imag[t*3])).toBeLessThan(1e-8);expect(y.real[t*3+2]).toBeCloseTo(real[t*3+2],9);}
    const p=powerMap(y);expect(p[2]).toBeCloseTo(.09,10);
  });
  it('estimates signed phase progression and rejects zero signal',()=>{
    const real=new Float64Array(32*3),imag=new Float64Array(real.length),phase=.3;
    for(let t=0;t<32;t++)for(let p=0;p<2;p++){real[t*3+p]=Math.cos((p? -1:1)*phase*t);imag[t*3+p]=Math.sin((p? -1:1)*phase*t);}
    const f=lagOneDoppler({frames:32,pixels:3,real,imag},1560,1e6,.002,.01,.8);
    expect(f.velocityMps[0]).toBeCloseTo(phase*1560/(4*Math.PI*1e6*.002),12);
    expect(f.velocityMps[1]).toBeCloseTo(-f.velocityMps[0],12);expect(f.valid).toEqual([1,1,0]);
  });
  it('uses fixed RF shape, independent frame noise and cached channel-derived complex DAS',()=>{
    const cfg={...defaultFlowConfig(),size:33,frames:4};const e=createFlowEnsemble(cfg),plan=buildDasPlan(cfg,e.elements);
    expect(e.mixed.length).toBe(4*cfg.elementCount*cfg.samples);expect(e.noiseRms).toBeGreaterThan(0);
    expect(Array.from(e.noise.slice(0,128))).not.toEqual(Array.from(e.noise.slice(cfg.elementCount*cfg.samples,cfg.elementCount*cfg.samples+128)));
    const mixed=applyDasPlan(cfg,e.elements,e.mixed,plan),a=applyDasPlan(cfg,e.elements,e.tissue,plan),b=applyDasPlan(cfg,e.elements,e.blood,plan),n=applyDasPlan(cfg,e.elements,e.noise,plan);
    let max=0,err=0;for(let i=0;i<mixed.real.length;i++){max=Math.max(max,Math.abs(mixed.real[i]));err=Math.max(err,Math.abs(mixed.real[i]-a.real[i]-b.real[i]-n.real[i]));}
    expect(err).toBeLessThan(max*1e-5);
    expect(plan.indices.length).toBe(33*33*cfg.elementCount);
  });
  it('tracks a noninteger tissue shift and masks ambiguous constant patches',()=>{
    const size=41,first=new Float64Array(size*size),last=new Float64Array(size*size);
    const f=(x:number,z:number)=>2+Math.sin(x*.4+z*.7)+.4*Math.cos(z*1.21-x*.17);
    for(let z=0;z<size;z++)for(let x=0;x<size;x++){first[z*size+x]=f(x,z);last[z*size+x]=f(x,z+.73);}
    const r=trackAxialNcc(first,last,size,.04,.04,.8);
    const valid=r.filter(p=>p.valid);expect(valid.length).toBeGreaterThan(10);
    const median=valid.map(p=>p.dzM).sort((a,b)=>a-b)[Math.floor(valid.length/2)];expect(median).toBeCloseTo(.00073,4);
    expect(trackAxialNcc(new Float64Array(size*size).fill(1),new Float64Array(size*size).fill(1),size,.04,.04,.8).every(p=>!p.valid)).toBe(true);
  });
});
