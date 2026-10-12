// @vitest-environment jsdom
import { act, createElement, useState } from 'react';
import type { ReactElement } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { defaultScenario } from '../src/core/scenario';
import type { FocusDemoFixture } from '../src/demo/types';

interface SceneProps {
  active: boolean;
  command: { id: number; snapshot: boolean };
  snapshot: number;
  onFinish: () => void;
  onLost: () => void;
}
const renderer = vi.hoisted(() => ({ canvas: vi.fn(), fail: false }));
vi.mock('@react-three/fiber', () => ({
  Canvas: (props: { children: ReactElement<SceneProps>; frameloop: string }) => {
    renderer.canvas(props);
    if (renderer.fail) throw new Error('Error creating WebGL context.');
    // Inspect the real component's scene contract without mounting a GPU tree.
    return createElement('canvas', { 'data-testid': 'mock-renderer' });
  },
  useFrame: vi.fn(),
  useThree: vi.fn(),
}));
vi.mock('@react-three/drei', () => ({ OrbitControls: () => null }));
vi.mock('../src/components/HeadScene', () => ({ Brain: () => null }));
import FocusedUltrasound from '../src/demo/FocusedUltrasound';

const fixture: FocusDemoFixture = {
  version: 1, kind: 'fixed-focused-pulse', scenario: { ...defaultScenario(), targetM: [0, 0, 0] },
  plane: { size: 3, extentM: .2, centerM: [0, 0, 0], axes: 'xz' },
  frames: { url: '/demo/focus-pressure.i16.gz', encoding: 'signed-int16-le', quantity: 'coherent-pulse-envelope', count: 5, startS: 0, stepS: .5e-6, pressureScale: 1 },
  targetArrivalS: 1e-6, delaysS: [], weights: [], driveEnergy: 1,
  provenance: { modelVersion: 'test', generatedUtc: '', seed: 1729, sourceHashes: {}, assumptions: [] },
};
const frames = new Int16Array(45);
frames[2 * 9 + 4] = 32767;
let container: HTMLDivElement, root: Root, hidden: boolean, reduced: boolean;
let intersect: IntersectionObserverCallback, observer: IntersectionObserver;
let mediaChange: () => void;
const disconnect = vi.fn(), removeMediaListener = vi.fn();

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  vi.clearAllMocks(); renderer.fail = false; hidden = false; reduced = false;
  vi.spyOn(document, 'hidden', 'get').mockImplementation(() => hidden);
  vi.stubGlobal('matchMedia', () => ({
    get matches() { return reduced; },
    addEventListener: (_: string, callback: () => void) => { mediaChange = callback; },
    removeEventListener: removeMediaListener,
  }));
  vi.stubGlobal('IntersectionObserver', class {
    constructor(callback: IntersectionObserverCallback) { intersect = callback; observer = this as unknown as IntersectionObserver; }
    observe() { intersect([{ isIntersecting: true }] as IntersectionObserverEntry[], observer); }
    disconnect = disconnect;
  });
  container = document.createElement('div'); document.body.append(container); root = createRoot(container);
});
afterEach(async () => {
  await act(async () => root.unmount()); container.remove();
  vi.unstubAllGlobals(); vi.restoreAllMocks();
});
const scene = (): SceneProps => renderer.canvas.mock.calls.at(-1)![0].children.props;
const button = (label: string) => Array.from(container.querySelectorAll('button')).find(b => b.textContent === label)!;
const render = () => act(async () => root.render(createElement(FocusedUltrasound, { fixture, frames })));
const setIntersection = (visible: boolean) => act(async () => intersect([{ isIntersecting: visible }] as IntersectionObserverEntry[], observer));
const setHidden = (value: boolean) => act(async () => { hidden = value; document.dispatchEvent(new Event('visibilitychange')); });

it('starts reduced-motion users on a real static snapshot and allows an explicitly requested replay', async () => {
  reduced = true; await render();
  expect(renderer.canvas.mock.calls.at(-1)![0].frameloop).toBe('demand');
  expect(scene().active).toBe(false); expect(scene().command.snapshot).toBe(true); expect(scene().snapshot).toBe(2);
  expect(container.textContent).toContain('captured focus snapshot');
  const previous = scene().command.id;
  await act(async () => button('Replay').click());
  expect(scene().active).toBe(true); expect(scene().command.snapshot).toBe(false); expect(scene().command.id).toBeGreaterThan(previous);
  expect(button('Pause')).toBeDefined(); expect(container.textContent).toContain('Motion plays only when requested');
});

it('pauses and resumes the current pass, while Replay requests a fresh pass', async () => {
  await render(); const command = scene().command;
  expect(scene().active).toBe(true);
  await act(async () => button('Pause').click());
  expect(scene().active).toBe(false); expect(scene().command).toBe(command);
  await act(async () => button('Play').click());
  expect(scene().active).toBe(true); expect(scene().command).toBe(command);
  await act(async () => button('Replay').click());
  expect(scene().active).toBe(true); expect(scene().command.id).toBeGreaterThan(command.id); expect(scene().command.snapshot).toBe(false);
  await act(async () => scene().onFinish());
  expect(scene().active).toBe(false); expect(container.textContent).toContain('Holding a captured focus frame');
  const finished = scene().command.id;
  await act(async () => button('Play').click());
  expect(scene().active).toBe(true); expect(scene().command.id).toBeGreaterThan(finished);
});

it('stops hidden/offscreen playback and never overrides a user pause on return', async () => {
  await render();
  await setIntersection(false); expect(scene().active).toBe(false);
  expect(container.textContent).toContain('Playback waits while this view is hidden');
  await setHidden(true); await setIntersection(true); expect(scene().active).toBe(false);
  await setHidden(false); expect(scene().active).toBe(true);
  await setHidden(true); expect(scene().active).toBe(false);
  await setHidden(false); expect(scene().active).toBe(true);
  await act(async () => button('Pause').click());
  await setIntersection(false); await setIntersection(true); await setHidden(true); await setHidden(false);
  expect(scene().active).toBe(false); expect(button('Play')).toBeDefined();
  await act(async () => root.render(null));
  expect(disconnect).toHaveBeenCalledTimes(1); expect(removeMediaListener).toHaveBeenCalledTimes(1);
});

it('stops an active pass when reduced motion is enabled during playback', async () => {
  await render(); expect(scene().active).toBe(true);
  await act(async () => { reduced = true; mediaChange(); });
  expect(scene().active).toBe(false); expect(scene().command.snapshot).toBe(true);
  await act(async () => { reduced = false; mediaChange(); });
  expect(scene().active).toBe(false);
});

it.each(['constructor', 'context loss'] as const)('contains renderer %s failure and keeps the surrounding UI usable', async failure => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
  function Workspace() {
    const [imaging, setImaging] = useState(false);
    return createElement('main', null, createElement(FocusedUltrasound, { fixture, frames }),
      createElement('button', { onClick: () => setImaging(true) }, 'Open imaging'), imaging && createElement('p', null, 'Imaging remains usable'));
  }
  renderer.fail = failure === 'constructor';
  await act(async () => root.render(createElement(Workspace)));
  if (failure === 'context loss') await act(async () => scene().onLost());
  expect(container.querySelector('[role="alert"]')?.textContent).toContain('3D view is unavailable');
  expect(container.querySelector('[data-testid="mock-renderer"]')).toBeNull();
  expect(button('Play').disabled).toBe(true); expect(button('Replay').disabled).toBe(true);
  await act(async () => button('Open imaging').click());
  expect(container.textContent).toContain('Imaging remains usable');
});
