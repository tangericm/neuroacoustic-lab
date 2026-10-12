// @vitest-environment jsdom
import { act, createElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultScenario } from '../src/core/scenario';
import type { ImagingDemoFixture } from '../src/demo/types';
const mocks=vi.hoisted(()=>({focus:vi.fn(),imaging:vi.fn(),paint:vi.fn(),traces:vi.fn()}));
vi.mock('../src/demo/loaders',()=>({loadFocusDemo:mocks.focus,loadImagingDemo:mocks.imaging}));
vi.mock('../src/demo/display',async importOriginal=>({...await importOriginal<typeof import('../src/demo/display')>(),paintEnvelope:mocks.paint,drawDemoTraces:mocks.traces}));
vi.mock('../src/demo/FocusedUltrasound',()=>({default:()=>createElement('div',null,'Fixed focused pulse')}));
vi.mock('../src/LabApp',()=>({default:()=>createElement('div',null,'Advanced laboratory')}));
import App from '../src/App';
import ImagingDemo from '../src/demo/ImagingDemo';
const fixture:ImagingDemoFixture={version:1,kind:'synthetic-aperture-imaging',scenario:defaultScenario(),plane:{size:2,extentM:.1,centerM:[0,0,0],axes:'xz'},channelShape:[8,32,16],samplingRateHz:4e6,timeOriginS:0,transmitIds:[0],receiveIds:Array.from({length:32},(_,i)=>i),traceTimeUs:[1,2],alignedTimeUs:[-1,1],traces:[{receiverId:0,arrivalS:2e-6,raw:[1,-1],aligned:[1,-1]}],pointTargetsM:[[0,0,0]],calibratedEnvelope:[1,2,3,4],uncalibratedEnvelope:[4,3,2,1],partials:[1,2,4,8,16,24,32].map(receivers=>({receivers,envelope:[receivers,0,0,0]})),display:{referencePeak:32,floorDb:-50},calibration:{actualSoundSpeedMps:1560,assumedSoundSpeedMps:1450},channelsUrl:'/demo/rf.gz',provenance:{modelVersion:'test',generatedUtc:'2026-10-12',seed:1729,sourceHashes:{},assumptions:[]}};
let container:HTMLDivElement,root:Root,reduced=false,visibilityCallback:IntersectionObserverCallback;
beforeEach(()=>{
  (globalThis as {IS_REACT_ACT_ENVIRONMENT?:boolean}).IS_REACT_ACT_ENVIRONMENT=true;
  vi.clearAllMocks();reduced=false;window.history.replaceState({},'','/');
  vi.spyOn(document,'hidden','get').mockReturnValue(false);
  vi.stubGlobal('matchMedia',()=>({matches:reduced,addEventListener:vi.fn(),removeEventListener:vi.fn()}));
  vi.stubGlobal('IntersectionObserver',class {constructor(cb:IntersectionObserverCallback){visibilityCallback=cb;}observe(){visibilityCallback([{isIntersecting:true}] as IntersectionObserverEntry[],this as unknown as IntersectionObserver);}disconnect(){}});
  mocks.focus.mockResolvedValue({fixture:{},frames:new Int16Array()});mocks.imaging.mockResolvedValue(fixture);
  container=document.createElement('div');document.body.append(container);root=createRoot(container);
});
afterEach(async()=>{await act(async()=>root.unmount());container.remove();vi.useRealTimers();vi.unstubAllGlobals();vi.restoreAllMocks();});
const button=(text:string)=>Array.from(container.querySelectorAll('button')).find(b=>b.textContent?.includes(text));
async function renderApp(){await act(async()=>root.render(createElement(App)));await act(async()=>vi.dynamicImportSettled());}
it('starts with focused ultrasound, loads imaging only when selected, and exposes no acoustic controls',async()=>{
  await renderApp();expect(container.textContent).toContain('Fixed focused pulse');expect(mocks.focus).toHaveBeenCalled();expect(mocks.imaging).not.toHaveBeenCalled();
  expect(container.querySelector('input,select')).toBeNull();
  await act(async()=>{button('Ultrasound imaging')!.click();await new Promise(resolve=>setTimeout(resolve,20));});
  expect(container.textContent).toContain('Separate acquisition');expect(button('Echoes')).toBeDefined();expect(mocks.imaging).toHaveBeenCalledTimes(1);
});
it.each(['/?view=lab','/#s=legacy-scenario'])('retains advanced URL compatibility for %s',async url=>{
  window.history.replaceState({},'',url);await renderApp();expect(container.textContent).toContain('Advanced laboratory');expect(mocks.focus).not.toHaveBeenCalled();
});
it('retries a failed fixture fetch without losing the other experience',async()=>{
  mocks.focus.mockRejectedValueOnce(new Error('Network unavailable'));await renderApp();expect(container.querySelector('[role="alert"]')).not.toBeNull();
  await act(async()=>{button('Retry')!.click();await new Promise(resolve=>setTimeout(resolve,20));});expect(container.textContent).toContain('Fixed focused pulse');expect(button('Ultrasound imaging')).toBeDefined();
});
it('uses real raw/aligned traces and replays actual partial images once on a shared scale',async()=>{
  vi.useFakeTimers();await act(async()=>root.render(createElement(ImagingDemo,{fixture})));
  expect(mocks.traces.mock.calls.at(-1)?.[1]).toBe(fixture);expect(mocks.traces.mock.calls.at(-1)?.[2]).toBe(false);
  await act(async()=>button('Align signals')!.click());expect(mocks.traces.mock.calls.at(-1)?.[2]).toBe(true);
  await act(async()=>button('Form image')!.click());expect(container.textContent).toContain('1 / 32 receivers');
  for(let i=0;i<7;i++)await act(async()=>vi.advanceTimersByTime(650));
  expect(container.textContent).toContain('32 / 32 receivers');expect(vi.getTimerCount()).toBe(0);
  expect(mocks.paint).toHaveBeenCalledWith(expect.any(HTMLCanvasElement),fixture.uncalibratedEnvelope,fixture.plane,fixture.display);
  expect(mocks.paint).toHaveBeenCalledWith(expect.any(HTMLCanvasElement),fixture.calibratedEnvelope,fixture.plane,fixture.display);
  expect(container.textContent).toContain('1450');expect(container.textContent).toContain('1560');expect(container.textContent).toContain('same RF');
  await act(async()=>button('Replay')!.click());expect(container.textContent).toContain('1 / 32 receivers');
  await act(async()=>visibilityCallback([{isIntersecting:false}] as IntersectionObserverEntry[],{} as IntersectionObserver));expect(vi.getTimerCount()).toBe(0);
});
it('renders the final partial without animation when reduced motion is requested',async()=>{
  reduced=true;vi.useFakeTimers();await act(async()=>root.render(createElement(ImagingDemo,{fixture})));
  await act(async()=>button('Form image')!.click());expect(container.textContent).toContain('32 / 32 receivers');expect(vi.getTimerCount()).toBe(0);
});
it('redraws traces after resizing and disconnects obsolete stage observers',async()=>{
  const callbacks:ResizeObserverCallback[]=[],disconnects:Array<ReturnType<typeof vi.fn>>=[];
  vi.stubGlobal('ResizeObserver',class {constructor(cb:ResizeObserverCallback){callbacks.push(cb);this.disconnect=vi.fn();disconnects.push(this.disconnect);}observe(){}disconnect:ReturnType<typeof vi.fn>;});
  await act(async()=>root.render(createElement(ImagingDemo,{fixture})));
  const initial=mocks.traces.mock.calls.length;
  expect(callbacks).toHaveLength(1);
  await act(async()=>callbacks[0]([],{} as ResizeObserver));expect(mocks.traces.mock.calls.length).toBe(initial+1);
  await act(async()=>button('Align signals')!.click());expect(disconnects[0]).toHaveBeenCalledTimes(1);
  const alignedCount=mocks.traces.mock.calls.length;
  await act(async()=>callbacks[0]([],{} as ResizeObserver));expect(mocks.traces.mock.calls.length).toBe(alignedCount);
  await act(async()=>callbacks[1]([],{} as ResizeObserver));expect(mocks.traces.mock.calls.at(-1)?.[2]).toBe(true);
  await act(async()=>button('Form image')!.click());expect(disconnects[1]).toHaveBeenCalledTimes(1);
});
