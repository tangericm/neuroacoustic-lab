/** All views share one positive amplitude scale; never normalize each map separately. */
export function sharedPressureScale(maps: number[][]): number {
  let peak = 0;
  for (const map of maps) for (const value of map) if (Number.isFinite(value) && value > peak) peak = value;
  return peak || 1;
}
export function pressureFraction(value: number, scale: number): number {
  return Number.isFinite(value) && scale > 0 ? Math.max(0, Math.min(1, value / scale)) : 0;
}
