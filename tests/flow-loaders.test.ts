import { afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
it('loads only the browser flow artifact, rejects inconsistent axes/frames, and permits retry', async () => {
  const fixture = JSON.parse(readFileSync('public/demo/flow.json', 'utf8'));
  let data = { ...fixture, acquisition: { ...fixture.acquisition, channelShape: [2, 1, 32, 1024] } };
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(data)));
  vi.stubGlobal('fetch', fetchMock);
  const { loadFlowDemo } = await import('../src/demo/loaders');
  await expect(loadFlowDemo()).rejects.toThrow('invalid');
  data = fixture;
  const first = await loadFlowDemo();
  expect(await loadFlowDemo()).toBe(first);
  expect(first.kind).toBe('temporal-flow-imaging');
  expect(first.cine.bmode[0].length).toBe(first.plane.size ** 2);
  expect(first.flow.valid.every(v => v === 0 || v === 1)).toBe(true);
  expect(fetchMock).toHaveBeenCalledTimes(2);
  expect(fetchMock.mock.calls.flat()).toEqual(['/demo/flow.json', '/demo/flow.json']);
});
