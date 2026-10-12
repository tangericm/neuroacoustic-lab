/** Windowed normalized cross-correlation on unfiltered linear envelopes. */
export function trackAxialNcc(
  first: Float64Array, last: Float64Array, size: number,
  extentM: number, centerZM: number, threshold = .8,
) {
  const pitch = extentM / (size - 1), half = 4, search = 3;
  const points: { xM: number; zM: number; dzM: number; confidence: number; valid: boolean }[] = [];
  const score = (x: number, z: number, shift: number) => {
    let sumA = 0, sumB = 0, squaredA = 0, squaredB = 0, product = 0, count = 0;
    for (let dz = -half; dz <= half; dz++) for (let dx = -2; dx <= 2; dx++) {
      const a = first[(z + dz) * size + x + dx];
      const row = z + dz + shift, lower = Math.floor(row), fraction = row - lower;
      const b = last[lower * size + x + dx] * (1 - fraction)
        + last[(lower + 1) * size + x + dx] * fraction;
      sumA += a; sumB += b; squaredA += a * a; squaredB += b * b; product += a * b;
      count++;
    }
    const varianceA = squaredA - sumA * sumA / count;
    const varianceB = squaredB - sumB * sumB / count;
    return varianceA > 1e-20 && varianceB > 1e-20
      ? (product - sumA * sumB / count) / Math.sqrt(varianceA * varianceB) : -1;
  };
  for (let z = half + search + 1; z < size - half - search - 1; z += 4) {
    for (let x = 3; x < size - 3; x += 4) {
      const scores: number[] = [];
      let best = -Infinity, index = 0;
      for (let lag = -30; lag <= 30; lag++) {
        const correlation = score(x, z, lag * .1);
        scores.push(correlation);
        if (correlation > best) { best = correlation; index = lag + 30; }
      }
      const boundary = index === 0 || index === 60;
      let shift = (index - 30) * .1;
      if (!boundary) {
        const left = scores[index - 1], right = scores[index + 1];
        const curvature = left - 2 * best + right;
        if (curvature < -1e-12) {
          shift += Math.max(-.1, Math.min(.1, .05 * (left - right) / curvature));
        }
      }
      const competingPeak = Math.max(...scores.filter((_, i) => Math.abs(i - index) > 5));
      points.push({
        xM: (x / (size - 1) - .5) * extentM,
        zM: centerZM + (.5 - z / (size - 1)) * extentM,
        dzM: -shift * pitch, // Array rows increase toward decreasing physical z.
        confidence: Number.isFinite(best) ? Math.max(-1, Math.min(1, best)) : -1,
        valid: !boundary && best >= threshold && best - competingPeak > .002,
      });
    }
  }
  return points;
}
