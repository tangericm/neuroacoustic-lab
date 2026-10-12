import type { DemoPlane, ImagingDemoFixture } from './types';
import type { Vec3 } from '../core/types';

export function envelopePixels(values: ArrayLike<number>, display: { referencePeak: number; floorDb: number }) {
  const pixels = new Uint8ClampedArray(values.length * 4);
  for (let i = 0; i < values.length; i++) {
    const db = 20 * Math.log10(Math.max(1e-12, values[i]) / display.referencePeak);
    const gray = Math.round(255 * Math.max(0, Math.min(1, (db - display.floorDb) / -display.floorDb)));
    pixels.set([gray, gray, gray, 255], i * 4);
  }
  return pixels;
}
export function planePointPercent(point: Vec3, plane: DemoPlane): { left: number; top: number } {
  return { left: 50 + (point[0] - plane.centerM[0]) / plane.extentM * 100, top: 50 - (point[2] - plane.centerM[2]) / plane.extentM * 100 };
}
export function paintEnvelope(canvas: HTMLCanvasElement, values: number[], plane: DemoPlane, display: { referencePeak: number; floorDb: number }) {
  if (values.length !== plane.size ** 2) throw new Error('Image dimensions do not match the fixed plane.');
  canvas.width = canvas.height = plane.size;
  const context = canvas.getContext('2d'); if (!context) return;
  // Numerical row zero is already the superior edge. No image flip is applied.
  context.putImageData(new ImageData(envelopePixels(values, display), plane.size, plane.size), 0, 0);
}
export function drawDemoTraces(canvas: HTMLCanvasElement, fixture: ImagingDemoFixture, aligned: boolean) {
  const width = Math.max(280, Math.round(canvas.clientWidth) || 1000);
  const height = Math.max(320, Math.min(440, Math.round(width * .5)));
  canvas.width = width; canvas.height = height;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const { traces } = fixture, times = aligned ? fixture.alignedTimeUs : fixture.traceTimeUs;
  const start = aligned ? times[0] : Math.min(...traces.map(t => t.arrivalS * 1e6)) - 12;
  const end = aligned ? times.at(-1)! : Math.max(...traces.map(t => t.arrivalS * 1e6)) + 12;
  const left = width < 600 ? 44 : 64, right = width - 24, top = 40, bottom = height - 48, rowHeight = (bottom - top) / traces.length;
  const x = (time: number) => left + (time - start) / (end - start) * (right - left);
  let peak = 0; for (const t of traces) for (const v of t.raw) peak = Math.max(peak, Math.abs(v));
  ctx.fillStyle = '#0a111b'; ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.font = `${width < 600 ? 13 : 15}px system-ui`; ctx.fillStyle = '#bdcbd6'; ctx.fillText(width < 600 ? 'Receive channels · fixed scale' : 'Receive channels · shared amplitude scale', left, 23);
  traces.forEach((trace, r) => {
    const middle = top + (r + .5) * rowHeight, values = aligned ? trace.aligned : trace.raw;
    ctx.strokeStyle = '#1c2b39'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(left, middle); ctx.lineTo(right, middle); ctx.stroke();
    ctx.fillStyle = '#bdcbd6'; ctx.fillText(`E${String(trace.receiverId).padStart(2, '0')}`, 10, middle + 5);
    ctx.strokeStyle = '#9be9ed'; ctx.lineWidth = 2; ctx.beginPath(); let first = true;
    values.forEach((v, i) => {
      if (times[i] < start || times[i] > end) return;
      const px = x(times[i]), py = middle - v / Math.max(1e-12, peak) * rowHeight * .43;
      if (first) { ctx.moveTo(px, py); first = false; } else ctx.lineTo(px, py);
    }); ctx.stroke();
    ctx.strokeStyle = '#f5bc67'; ctx.lineWidth = 1; const arrivalX = x(aligned ? 0 : trace.arrivalS * 1e6);
    ctx.beginPath(); ctx.moveTo(arrivalX, middle - rowHeight * .4); ctx.lineTo(arrivalX, middle + rowHeight * .4); ctx.stroke();
  });
  ctx.fillStyle = '#bdcbd6'; ctx.textAlign = 'center';
  for (let t = 0; t <= 4; t++) { const time = start + (end - start) * t / 4; ctx.fillText(`${time.toFixed(0)} µs`, x(time), height - 21); }
  ctx.textAlign = 'left';
}
