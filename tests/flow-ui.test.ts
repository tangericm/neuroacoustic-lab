// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import type { FlowFixture } from '../src/core/flow/types';
vi.mock('../src/demo/CoreCode',()=>({default:({operation}:{operation:string})=>createElement('div',null,`Source: ${operation}`)}));
import FlowImagingDemo from '../src/demo/FlowImagingDemo';
import { flowImagePixels, tracePolyline, planePercent } from '../src/demo/flowDisplay';

const fixture:FlowFixture={version:1,kind:'temporal-flow-imaging',config:{seed:1,size:2,frames:3,frameIntervalS:.002,frequencyHz:1e6,soundSpeedMps:1540,attenuationDbCmAtMHz:.5,attenuationPower:1,samplingRateHz:4e6,samples:4,elementCount:32,elementPitchM:.0003,elementRadiusM:.0001,probeZM:.04,centerZM:0,extentM:.02,tissueDisplacementM:.0001,bloodSpeedMps:.02,noiseRmsRelative:.001,clutterRank:2},plane:{size:2,extentM:.02,centerM:[0,0,0],axes:'xz',rowDirection:'decreasing-z'},acquisition:{channelShape:[3,1,32,4],axisOrder:['slowTime','transmit','receive','fastTime'],timeOriginS:0,transmitIndex:0,frameTimesS:[0,.002,.004],noiseRms:.001},truth:{vessels:[{id:'up',pointsM:[[-.004,-.008],[-.004,.008]],radiusM:.001,speedMps:.02,role:'calibration'},{id:'down',pointsM:[[.004,.008],[.004,-.008]],radiusM:.001,speedMps:.02,role:'calibration'}],tissueDisplacementM:.0001,description:'Two opposite-flow tubes.'},cine:{frameIndices:[0,1,2],timeMs:[0,2,4],bmode:[[1,.1,.01,0],[.5,1,0,.1],[.2,.5,1,0]],referenceAmplitude:1,floorDb:-40},power:{before:[1,.1,.01,0],after:[.01,.1,.001,0],referencePower:1,floorDb:-40},flow:{velocityMps:[.02,-.02,100,0],coherence:[.9,.9,0,0],valid:[1,1,0,0],nyquistMps:.1,positiveDirection:'toward increasing z',powerThreshold:.0001,coherenceThreshold:.6},displacement:{points:[{xM:0,zM:0,dzM:.00009,confidence:.9,valid:true},{xM:.005,zM:0,dzM:.001,confidence:.1,valid:false}],fromFrame:0,toFrame:2,truthM:.0001,confidenceThreshold:.7,searchRadiusPixels:3},spectrum:{singularValues:[10,5,1,.1],removedModes:2},rf:{timeUs:[0,1,2,3],traces:[{frame:0,receiver:0,values:[0,1,-1,0]},{frame:1,receiver:31,values:[1,0,-1,0]}],referenceAmplitude:1},metrics:[{label:'Blood retention',value:90,unit:'%',scope:'Known tube interiors only'}],methods:['Beamform','Filter','Flow','Displacement'].map(title=>({title,formula:`${title} formula`,variables:'Variables from fixture',explanation:`${title} explanation`,limitation:`${title} limitation`})),compute:{timingsMs:{},cachedDelayEntries:1,directTravelEvaluations:2,cachedTravelEvaluations:1,note:'Frozen fixture'},provenance:{modelVersion:'test',generatedUtc:'2026',sourceHashes:{},assumptions:['Synthetic RF'],sources:[],referenceUrl:'/reference'}};
let container:HTMLDivElement,root:Root,reduced=false,visibility:IntersectionObserverCallback;
let putImage:ReturnType<typeof vi.fn>;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  reduced=false;vi.spyOn(document,'hidden','get').mockReturnValue(false);
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  vi.stubGlobal('IntersectionObserver',class{constructor(cb:IntersectionObserverCallback){visibility=cb;}observe(){visibility([{isIntersecting:true}] as IntersectionObserverEntry[],this as unknown as IntersectionObserver);}disconnect(){}});
  putImage=vi.fn();
  vi.spyOn(HTMLCanvasElement.prototype,'getContext').mockReturnValue({createImageData:(w:number,h:number)=>({data:new Uint8ClampedArray(w*h*4)}),putImageData:putImage} as never);
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
const button=(label:string)=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.trim()===label||b.getAttribute('aria-label')===label)!;
const render=()=>act(async()=>root.render(createElement(FlowImagingDemo,{fixture})));
it('navigates four accessible steps with fixture methods and a single current step',async()=>{
  await render();expect(container.querySelectorAll('nav button')).toHaveLength(4);
  expect(container.textContent).toContain('Beamform formula');expect(container.textContent).toContain('Synthetic RF');
  await act(async()=>button('Next: Filter clutter').click());expect(container.textContent).toContain('Filter formula');expect(container.textContent).toContain('Known tube interiors only');
  const flow=button('Measure flow');flow.focus();await act(async()=>flow.click());expect(document.activeElement).toBe(container.querySelector('.flow-stage-heading h3'));
  expect(container.textContent).toContain('Flow limitation');expect(container.textContent).toContain('50.0%');expect(container.textContent).toContain('toward increasing z');
  await act(async()=>button('Next: Track tissue').click());expect(container.textContent).toContain('Displacement formula');expect(container.textContent).toContain('before clutter filtering');
  expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);expect(container.querySelector('input,select')).toBeNull();
});
it('preserves premapped B-mode, uses shared power reference, and suppresses invalid velocity without truth masks',()=>{
  const amplitude=flowImagePixels([255,128,0,0],2,'bmode',1,-40);
  expect(Array.from(amplitude.slice(0,4))).toEqual([255,255,255,255]);expect(amplitude[4]).toBe(128);expect(amplitude[8]).toBe(0);
  const before=flowImagePixels([.1,0,0,0],2,'power',1,-40),after=flowImagePixels([.1,0,0,0],2,'power',1,-40);expect(before).toEqual(after);
  const power=flowImagePixels([.01,.0001,1,0],2,'power',1,-40);expect(Array.from(power.slice(0,4))).toEqual([255,128,0,255]);expect(Array.from(power.slice(4,8))).toEqual([0,0,0,255]);
  const velocity=flowImagePixels(fixture.flow.velocityMps,2,'velocity',.1,-40,fixture.flow.valid);
  expect(velocity[0]).toBeGreaterThan(velocity[2]);expect(velocity[6]).toBeGreaterThan(velocity[4]);expect(Array.from(velocity.slice(8,12))).toEqual([45,52,57,255]);
  expect(planePercent(0,.01,fixture.plane)).toEqual([50,0]);expect(tracePolyline([0,1,-1],[0,1,2],1)).toBe('0,50 50,5 100,95');
});
it('starts static, loops the recorded frames, and cancels when paused, offscreen, hidden, or changing stage',async()=>{
  vi.useFakeTimers();await render();expect(vi.getTimerCount()).toBe(0);expect(container.textContent).toContain('0.0 ms');
  await act(async()=>button('Play cine').click());expect(vi.getTimerCount()).toBe(1);
  await act(async()=>vi.advanceTimersByTime(160));
  await act(async()=>vi.advanceTimersByTime(160));expect(container.textContent).toContain('4.0 ms');
  await act(async()=>vi.advanceTimersByTime(160));expect(container.textContent).toContain('0.0 ms');
  await act(async()=>vi.advanceTimersByTime(160));
  await act(async()=>vi.advanceTimersByTime(160));expect(container.textContent).toContain('4.0 ms');expect(button('Pause cine')).toBeTruthy();expect(vi.getTimerCount()).toBe(1);
  await act(async()=>button('Replay cine').click());expect(container.textContent).toContain('0.0 ms');
  await act(async()=>vi.advanceTimersByTime(160));expect(container.textContent).toContain('2.0 ms');
  await act(async()=>button('Pause cine').click());expect(vi.getTimerCount()).toBe(0);
  await act(async()=>vi.advanceTimersByTime(1000));expect(container.textContent).toContain('2.0 ms');
  await act(async()=>button('Play cine').click());expect(vi.getTimerCount()).toBe(1);
  await act(async()=>visibility([{isIntersecting:false}] as IntersectionObserverEntry[],{} as IntersectionObserver));expect(vi.getTimerCount()).toBe(0);
  await act(async()=>visibility([{isIntersecting:true}] as IntersectionObserverEntry[],{} as IntersectionObserver));expect(vi.getTimerCount()).toBe(0);
  await act(async()=>button('Play cine').click());vi.spyOn(document,'hidden','get').mockReturnValue(true);await act(async()=>document.dispatchEvent(new Event('visibilitychange')));expect(vi.getTimerCount()).toBe(0);
  vi.spyOn(document,'hidden','get').mockReturnValue(false);await act(async()=>document.dispatchEvent(new Event('visibilitychange')));
  await act(async()=>button('Play cine').click());expect(vi.getTimerCount()).toBe(1);
  await act(async()=>button('Filter clutter').click());await act(async()=>vi.advanceTimersByTime(0));expect(vi.getTimerCount()).toBe(0);
});
it('replay restarts the display interval even when the first frame is already visible',async()=>{
  vi.useFakeTimers();await render();
  await act(async()=>button('Play cine').click());
  await act(async()=>vi.advanceTimersByTime(80));
  await act(async()=>button('Replay cine').click());
  await act(async()=>vi.advanceTimersByTime(80));
  expect(container.textContent).toContain('0.0 ms · frame 1/3');
  await act(async()=>vi.advanceTimersByTime(80));
  expect(container.textContent).toContain('2.0 ms · frame 2/3');
});
it('keeps all four steps and static data available with reduced motion',async()=>{
  reduced=true;vi.useFakeTimers();await render();expect(vi.getTimerCount()).toBe(0);expect(button('Play cine').disabled).toBe(true);
  expect(container.querySelectorAll('nav button')).toHaveLength(4);await act(async()=>button('Track tissue').click());expect(container.querySelector('[aria-label="Estimated tissue displacement"]')).not.toBeNull();
});
it('draws recorded traces and the actual common-scale images, excluding invalid displacement estimates',async()=>{
  await render();
  expect(container.querySelector('.flow-rf-row polyline')?.getAttribute('points')).toBe('0,50 33.333333333333336,5 66.66666666666667,95 100,50');
  await act(async()=>button('Filter clutter').click());
  const before=putImage.mock.calls.at(-2)![0].data as Uint8ClampedArray,after=putImage.mock.calls.at(-1)![0].data as Uint8ClampedArray;
  expect(Array.from(before.slice(0,4))).toEqual([255,255,220,255]);expect(Array.from(after.slice(0,4))).toEqual([255,128,0,255]);
  await act(async()=>button('Measure flow').click());const velocity=putImage.mock.calls.at(-1)![0].data as Uint8ClampedArray;
  expect(Array.from(velocity.slice(8,12))).toEqual([45,52,57,255]);
  await act(async()=>button('Track tissue').click());expect(container.querySelectorAll('.flow-arrow-overlay line')).toHaveLength(1);
  expect(container.querySelectorAll('.flow-displacement-chart circle')).toHaveLength(1);expect(container.textContent).toContain('1/2 patches pass');
});
it('cleans up an active playback on unmount',async()=>{
  vi.useFakeTimers();await render();await act(async()=>button('Play cine').click());expect(vi.getTimerCount()).toBe(1);
  await act(async()=>root.unmount());expect(vi.getTimerCount()).toBe(0);
});
it('reverses prescribed phantom arrows for negative vessel speeds',async()=>{
  const opposite={...fixture,truth:{...fixture.truth,vessels:fixture.truth.vessels.map((v,i)=>({...v,pointsM:[[-.004+i*.008,-.008],[-.004+i*.008,.008]] as [number,number][],speedMps:i===0?.02:-.02}))}};
  await act(async()=>root.render(createElement(FlowImagingDemo,{fixture:opposite})));
  const arrows=container.querySelectorAll('.flow-truth line');
  expect(Number(arrows[0].getAttribute('y2'))).toBeLessThan(Number(arrows[0].getAttribute('y1')));
  expect(Number(arrows[1].getAttribute('y2'))).toBeGreaterThan(Number(arrows[1].getAttribute('y1')));
});
it('preserves initial position, then focuses the new heading and instantly reveals navigation after Next',async()=>{
  const scroll=vi.fn();HTMLElement.prototype.scrollIntoView=scroll;
  await render();expect(scroll).not.toHaveBeenCalled();expect(document.activeElement).not.toBe(container.querySelector('.flow-stage-heading h3'));
  const next=button('Next: Filter clutter');next.focus();await act(async()=>next.click());
  expect(document.activeElement?.textContent).toBe('Filter clutter');expect(document.activeElement?.getAttribute('tabindex')).toBe('-1');
  expect(scroll).toHaveBeenCalledWith({behavior:'auto',block:'start'});expect(scroll.mock.instances[0]).toBe(container.querySelector('.flow-steps'));
  scroll.mockClear();await act(async()=>button('Track tissue').click());expect(document.activeElement?.textContent).toBe('Track tissue');expect(scroll).toHaveBeenCalledTimes(1);
  delete (HTMLElement.prototype as Partial<HTMLElement>).scrollIntoView;
});
