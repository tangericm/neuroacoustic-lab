import { afterEach, describe, expect, it, vi } from 'vitest';
import { gzipSync } from 'node:zlib';
import { readFileSync } from 'node:fs';
import { decodePressureFrames } from '../src/demo/loaders';
import { envelopePixels, planePointPercent } from '../src/demo/display';

afterEach(() => { vi.unstubAllGlobals(); vi.resetModules(); });
describe('fixed data loading and display', () => {
  it('decodes little-endian signed frames from gzip and transparently decompressed responses', async () => {
    const bytes = new Uint8Array([0, 0, 0xff, 0x7f, 1, 0x80, 0xff, 0xff]);
    expect(Array.from(await decodePressureFrames(gzipSync(bytes), 4))).toEqual([0, 32767, -32767, -1]);
    expect(Array.from(await decodePressureFrames(bytes, 4))).toEqual([0, 32767, -32767, -1]);
    await expect(decodePressureFrames(gzipSync(bytes), 3)).rejects.toThrow('exceeds');
    await expect(decodePressureFrames(gzipSync(bytes), 5)).rejects.toThrow('incomplete');
  });
  it('uses a shared image scale and maps superior coordinates to the top', () => {
    expect(Array.from(envelopePixels([1, .1, .01], { referencePeak: 1, floorDb: -40 })).filter((_, i) => i % 4 === 0)).toEqual([255, 128, 0]);
    expect(Array.from(envelopePixels([.1], { referencePeak: 1, floorDb: -40 }))).toEqual([128, 128, 128, 255]);
    expect(planePointPercent([.02, 0, .02], { size: 97, extentM: .1, centerM: [0, 0, 0], axes: 'xz' })).toEqual({ left: 70, top: 30 });
  });
  it('loads shipped data once, and permits retry after malformed fixture data', async () => {
    const focus = JSON.parse(readFileSync('public/demo/focus.json', 'utf8'));
    const image = readFileSync('public/demo/imaging.json', 'utf8');
    let malformed = true;
    const fetchMock = vi.fn(async (url: string) => {
      if (url.endsWith('focus.json')) return new Response(JSON.stringify(malformed ? { ...focus, version: 2 } : focus));
      if (url.endsWith('focus-pressure.i16.gz')) return new Response(Uint8Array.from(readFileSync('public/demo/focus-pressure.i16.gz')).buffer);
      return new Response(image);
    }); vi.stubGlobal('fetch', fetchMock);
    const loaders = await import('../src/demo/loaders');
    await expect(loaders.loadFocusDemo()).rejects.toThrow('invalid'); malformed = false;
    const a = await loaders.loadFocusDemo(), b = await loaders.loadFocusDemo();
    expect(a).toBe(b); expect(a.frames.length).toBe(focus.frames.count * focus.plane.size ** 2);
    expect((await loaders.loadImagingDemo()).channelShape).toEqual([4, 32, 1024]);
    expect(fetchMock).toHaveBeenCalledTimes(4);
  });
});
