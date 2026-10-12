// @vitest-environment jsdom
import { act, createElement, Suspense, useCallback, useState } from 'react';
import { createRoot } from 'react-dom/client';
import type { Root } from 'react-dom/client';
import { BufferGeometry } from 'three';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SceneErrorBoundary } from '../src/components/SceneErrorBoundary';
import { useOwnedResource } from '../src/hooks/useOwnedResource';
import { AnatomyBoundary, AnatomyReady, AnatomyStatus } from '../src/components/AnatomyStatus';
import type { AnatomyLoadState } from '../src/components/AnatomyStatus';

let container: HTMLDivElement, root: Root;
beforeEach(() => { (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true; container = document.createElement('div'); document.body.append(container); root = createRoot(container); });
afterEach(async () => { await act(async () => root.unmount()); container.remove(); vi.restoreAllMocks(); });

describe('optional renderer failure containment', () => {
  it('catches a real throwing React child and leaves numerical controls and maps usable', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const onError = vi.fn();
    function Renderer(): never { throw new Error('Error creating WebGL context.'); }
    function NumericalControl() { const [target, setTarget] = useState(15); return createElement('button', { onClick: () => setTarget(v => v + 1) }, `Target ${target} mm`); }
    await act(async () => root.render(createElement('main', null,
      createElement(NumericalControl),
      createElement(SceneErrorBoundary, { onError, children: createElement(Renderer) }),
      createElement('canvas', { 'aria-label': 'Pressure map' }),
    )));
    expect(container.textContent).toContain('3D rendering is unavailable'); expect(onError).toHaveBeenCalledTimes(1);
    expect(container.querySelector('canvas[aria-label="Pressure map"]')).not.toBeNull();
    await act(async () => container.querySelector('button')!.click());
    expect(container.textContent).toContain('Target 16 mm');
  });
});
describe('owned geometry lifecycle', () => {
  it('retains geometry across clipping changes and releases it when the atlas layer is removed', async () => {
    const first = new BufferGeometry(), second = new BufferGeometry();
    const disposedFirst = vi.fn(), disposedSecond = vi.fn(); first.addEventListener('dispose', disposedFirst); second.addEventListener('dispose', disposedSecond);
    function Atlas({ geometry, clip }: { geometry: BufferGeometry; clip: number }) { useOwnedResource(geometry); return createElement('span', null, `clip ${clip}`); }
    await act(async () => root.render(createElement(Atlas, { geometry: first, clip: 0 })));
    await act(async () => root.render(createElement(Atlas, { geometry: first, clip: 1 })));
    expect(disposedFirst).not.toHaveBeenCalled();
    await act(async () => root.render(null)); expect(disposedFirst).toHaveBeenCalledTimes(1);
    await act(async () => root.render(createElement(Atlas, { geometry: second, clip: 1 })));
    expect(disposedSecond).not.toHaveBeenCalled();
    await act(async () => root.render(null)); expect(disposedSecond).toHaveBeenCalledTimes(1); expect(disposedFirst).toHaveBeenCalledTimes(1);
  });
});
describe('atlas status in one DOM ownership tree', () => {
  it('removes the loading label after actual Suspense completion and survives layer remounts', async () => {
    const errors = vi.spyOn(console, 'error').mockImplementation(() => {});
    let loaded = false, release!: () => void;
    const pending = new Promise<void>(resolve => { release = resolve; });
    function Atlas({ onReady }: { onReady: () => void }) { if (!loaded) throw pending; return createElement(AnatomyReady, { onReady }); }
    function Workspace({ visible }: { visible: boolean }) {
      const [state, setState] = useState<AnatomyLoadState>('loading');
      const ready = useCallback(() => setState('ready'), []);
      return createElement('main', null,
        createElement(Suspense, { fallback: null }, visible && createElement(Atlas, { onReady: ready })),
        visible && createElement(AnatomyStatus, { state }),
        createElement('button', null, 'Numerical workspace'),
      );
    }
    await act(async () => root.render(createElement(Workspace, { visible: true })));
    expect(container.textContent).toContain('Loading anatomical atlas');
    await act(async () => { loaded = true; release(); await pending; });
    expect(container.querySelector('[role="status"]')).toBeNull();
    await act(async () => root.render(createElement(Workspace, { visible: false })));
    await act(async () => root.render(createElement(Workspace, { visible: true })));
    expect(container.textContent).toBe('Numerical workspace');
    expect(errors).not.toHaveBeenCalled();
  });
  it('reports atlas load failure without removing the numerical workspace', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    function FailedAtlas(): never { throw new Error('Atlas asset failed to load'); }
    function Workspace() {
      const [state, setState] = useState<AnatomyLoadState>('loading');
      const failed = useCallback(() => setState('error'), []);
      return createElement('main', null,
        createElement(AnatomyBoundary, { onError: failed, children: createElement(FailedAtlas) }),
        createElement(AnatomyStatus, { state }),
        createElement('canvas', { 'aria-label': 'Numerical pressure map' }),
      );
    }
    await act(async () => root.render(createElement(Workspace)));
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Anatomical atlas unavailable');
    expect(container.querySelector('canvas')).not.toBeNull();
  });
});
