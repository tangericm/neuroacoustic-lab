import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { includeAtlasCategory, fitScale } from '../src/hooks/anatomy';

interface GLBNode { name: string; mesh?: number; extras?: { bx_cat?: string }; matrix?: number[]; translation?: number[]; rotation?: number[]; scale?: number[] }
interface GLB { nodes: GLBNode[]; meshes: { primitives: { attributes: { POSITION: number } }[] }[]; accessors: { min: number[]; max: number[] }[] }
const binary = readFileSync(new URL('../public/models/brain.glb', import.meta.url));
const glb: GLB = JSON.parse(binary.subarray(20, 20 + binary.readUInt32LE(12)).toString('utf8'));
const manifest = JSON.parse(readFileSync(new URL('../public/models/manifest.json', import.meta.url), 'utf8')) as { nodes: { name: string; category: string }[] };
describe('actual downloaded atlas bounds', () => {
  it('excludes extracranial anatomy before computing the fit', () => {
    const selected = glb.nodes.filter(node => node.mesh !== undefined && includeAtlasCategory(node.extras?.bx_cat));
    const min = [Infinity, Infinity, Infinity], max = [-Infinity, -Infinity, -Infinity];
    selected.forEach(node => {
      expect(manifest.nodes.find(n => n.name === node.name)?.category).toBe(node.extras?.bx_cat);
      expect(node.matrix ?? node.translation ?? node.rotation ?? node.scale).toBeUndefined();
      for (const primitive of glb.meshes[node.mesh!].primitives) { const accessor = glb.accessors[primitive.attributes.POSITION]; for (let k = 0; k < 3; k++) { min[k] = Math.min(min[k], accessor.min[k]); max[k] = Math.max(max[k], accessor.max[k]); } }
    });
    expect(selected.length).toBe(325);
    expect(min[1]).toBeGreaterThan(1.5); expect(max[1] - min[1]).toBeLessThan(.18);
    expect(min[0]).toBeCloseTo(-.0688868, 5); expect(max[0]).toBeCloseTo(.0688868, 5);
    expect(selected.every(n => !['cranial_nerves', 'arteries', 'veins_sinuses'].includes(n.extras?.bx_cat ?? ''))).toBe(true);
  });
  it('fits every vertex into an ellipsoid rather than checking only bounding-box widths', () => {
    const points = [-.06, -.07, -.05, .06, .07, .05, 0, 0, .08], radii = [.0725, .0875, .0775];
    const scale = fitScale(points, radii);
    expect(Math.max(...Array.from({ length: points.length / 3 }, (_, i) => Math.hypot(points[i * 3] * scale / radii[0], points[i * 3 + 1] * scale / radii[1], points[i * 3 + 2] * scale / radii[2])))).toBeCloseTo(.95, 12);
  });
});
