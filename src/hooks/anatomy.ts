export const BRAIN_CATEGORIES = new Set(['cortex', 'white_matter', 'cerebellum', 'brainstem', 'deep_grey', 'diencephalon', 'ventricles', 'tracts']);
export function includeAtlasCategory(category: unknown): boolean { return typeof category === 'string' && BRAIN_CATEGORIES.has(category); }
export function fitScale(positions: ArrayLike<number>, radii: readonly number[]): number {
  let maxNorm = 0;
  for (let i = 0; i < positions.length; i += 3) {
    maxNorm = Math.max(maxNorm, Math.hypot(positions[i] / radii[0], positions[i + 1] / radii[1], positions[i + 2] / radii[2]));
  }
  if (!(maxNorm > 0)) throw new Error('Anatomical geometry has no finite extent.');
  return .95 / maxNorm;
}
