import { memo, useEffect, useMemo, useRef, useState } from 'react';
import type { FieldPlane, ReconstructionResult, SimulationResult } from '../core/types';
import { fieldPixels } from './HeadScene';
import { formatNumber } from '../hooks/uiUtils';
import { elementAmplitude, pathBetween, pixelPosition } from '../core/physics';

function paintImage(canvas: HTMLCanvasElement, pixels: Uint8ClampedArray, size: number) {
  canvas.width = size; canvas.height = size;
  const ctx = canvas.getContext('2d'); if (!ctx) return;
  const image = ctx.createImageData(size, size); image.data.set(pixels); ctx.putImageData(image, 0, 0);
}
export function reconstructionPixels(image: ReconstructionResult, normalization: number): Uint8ClampedArray {
  const pixels = new Uint8ClampedArray(image.size * image.size * 4);
  for (let i = 0; i < image.envelope.length; i++) {
    const db = 20 * Math.log10(Math.max(image.envelope[i], 1e-15) / Math.max(normalization, 1e-15));
    const gray = Math.round(255 * Math.max(0, Math.min(1, (db + 55) / 55)));
    pixels.set([gray, gray, gray, 255], i * 4);
  }
  return pixels;
}
function MapCanvas({ field, normalization, label }: { field: FieldPlane; normalization: number; label: string }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => { if (ref.current) paintImage(ref.current, new Uint8ClampedArray(fieldPixels(field, normalization)), field.size); }, [field, normalization]);
  return <div className="map-frame"><canvas ref={ref} aria-label={label} role="img" /><span className="map-corner">{label}</span><span className="map-scale">{formatNumber(field.extentM * 1000, 0)} mm</span><span className="map-axis">x → · z ↑</span></div>;
}
function BModeCanvas({ image, normalization, label, result, truth }: { image: ReconstructionResult; normalization: number; label: string; result: SimulationResult; truth: boolean }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    paintImage(c, reconstructionPixels(image, normalization), image.size);
    if (truth) {
      const context = c.getContext('2d')!;
      const coord = (v: number, center: number) => (v - center + image.extentM / 2) / image.extentM * image.size;
      context.strokeStyle = '#6ef3d4'; context.lineWidth = 1.3;
      const cyst = result.phantom;
      context.beginPath(); context.arc(coord(cyst.cystCenterM[0], image.centerM[0]), image.size - coord(cyst.cystCenterM[2], image.centerM[2]), cyst.cystRadiusM / image.extentM * image.size, 0, Math.PI * 2); context.stroke();
      result.phantom.scatterers.filter(s => s.kind === 'point').forEach(s => { const x = coord(s.positionM[0], image.centerM[0]), z = image.size - coord(s.positionM[2], image.centerM[2]); context.beginPath(); context.moveTo(x - 3, z); context.lineTo(x + 3, z); context.moveTo(x, z - 3); context.lineTo(x, z + 3); context.stroke(); });
    }
  }, [image, normalization, result, truth]);
  return <div className="map-frame bmode"><canvas ref={ref} role="img" aria-label={`${label} delay-and-sum B-mode`} /><span className="map-corner">{label}</span><span className="map-scale">{formatNumber(image.extentM * 1000, 0)} mm</span><span className="map-axis">x → · z ↑</span></div>;
}
function Sparkline({ values, color = '#69d2d5', unit, label }: { values: number[]; color?: string; unit: string; label: string }) {
  const finite = values.map(v => Number.isFinite(v) ? v : 0), min = Math.min(...finite), max = Math.max(...finite), span = max - min || 1;
  const points = finite.map((v, i) => `${8 + i / Math.max(1, finite.length - 1) * 284},${73 - (v - min) / span * 57}`).join(' ');
  return <div className="sparkline"><div className="plot-caption"><span>{label}</span><span>{formatNumber(min, 2)} … {formatNumber(max, 2)} {unit}</span></div><svg viewBox="0 0 300 84" role="img" aria-label={label}><path d="M8 16H292M8 44H292M8 73H292" stroke="#27333c" strokeWidth=".6" /><polyline fill="none" stroke={color} strokeWidth="1.6" points={points} /></svg></div>;
}
function RFPlot({ result, selected }: { result: SimulationResult; selected: number | null }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const channels = result.channels;
  const [transmit, setTransmit] = useState(0);
  const receive = Math.max(0, channels.receiveIds.indexOf(selected ?? channels.receiveIds[0]));
  const tx = Math.min(transmit, channels.shape[0] - 1);
  useEffect(() => {
    const c = ref.current; if (!c) return;
    c.width = 1000; c.height = 190; const ctx = c.getContext('2d')!;
    ctx.clearRect(0, 0, c.width, c.height); const [,, length] = channels.shape;
    ctx.strokeStyle = '#25323b'; ctx.lineWidth = 1;
    for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.moveTo(35, 20 + i * 35); ctx.lineTo(980, 20 + i * 35); ctx.stroke(); }
    const offset = (tx * channels.shape[1] + receive) * length;
    const peak = Math.max(channels.peak, 1e-15);
    ctx.strokeStyle = '#64cdd3'; ctx.lineWidth = 1.4; ctx.beginPath();
    for (let i = 0; i < length; i++) { const x = 35 + i / Math.max(1, length - 1) * 945, y = 90 - channels.samples[offset + i] / peak * 66; if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.font = '12px monospace'; ctx.fillStyle = '#81929f';
    for (let i = 0; i <= 4; i++) { const time = (channels.timeOriginS + length / channels.samplingRateHz * i / 4) * 1e6; ctx.fillText(`${time.toFixed(0)} µs`, 35 + i * 229, 180); }
  }, [channels, tx, receive]);
  return <div className="rf-panel"><div className="plot-caption"><span>Channel RF · receive {channels.receiveIds[receive]}</span><label>Transmit <select aria-label="RF transmit" value={tx} onChange={e => setTransmit(Number(e.target.value))}>{channels.transmitIds.map((id, index) => <option key={index} value={index}>{id}</option>)}</select></label></div><canvas ref={ref} role="img" aria-label="Simulated channel RF amplitude versus fast time" /><div className="chart-foot">{channels.shape[0]} transmits × {channels.shape[1]} receivers × {channels.shape[2]} samples · {(channels.samplingRateHz / 1e6).toFixed(1)} MHz · normalized to all-channel peak</div></div>;
}
export function exportComparison(result: SimulationResult) {
  const c = document.createElement('canvas'); c.width = 1200; c.height = 800; const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#101820'; ctx.fillRect(0, 0, c.width, c.height); ctx.font = '26px sans-serif'; ctx.fillStyle = '#e7efef'; ctx.fillText('Neuroacoustic Lab · matched model comparison', 40, 55);
  ctx.font = '15px monospace'; ctx.fillStyle = '#9caeb8'; ctx.fillText(`${result.modelVersion} · ${result.scenario.frequencyHz / 1e6} MHz · ${result.scenario.mode} · seed ${result.scenario.seed}`, 40, 86);
  [result.baselineField, result.field].forEach((field, i) => { const temp = document.createElement('canvas'); paintImage(temp, new Uint8ClampedArray(fieldPixels(field, result.baselineField.peak)), field.size); ctx.drawImage(temp, 40 + i * 600, 135, 260, 260); });
  [result.baselineReconstruction, result.reconstruction].forEach((image, i) => { const temp = document.createElement('canvas'); paintImage(temp, reconstructionPixels(image, result.baselineReconstruction.peak), image.size); ctx.drawImage(temp, 330 + i * 600, 135, 260, 260); });
  ctx.fillStyle = '#dce7e9'; ctx.font = '18px sans-serif'; ctx.fillText('Homogeneous-delay baseline', 40, 120); ctx.fillText('Current transmit + receive settings', 640, 120);
  ctx.font = '17px monospace'; const m = result.metrics;
  [`Target pressure gain ${formatNumber(m.targetGainDb, 2)} dB`, `Focal error ${formatNumber(m.focalErrorM * 1000, 2)} mm · width ${formatNumber(m.focalWidthM * 1000, 2)} mm`, `Cyst contrast ${formatNumber(m.cystContrastDb, 2)} dB · localization ${formatNumber(m.localizationErrorM * 1000, 2)} mm`, `Active elements ${m.activeElements} · drive energy ${formatNumber(m.driveEnergy, 3)}`, 'Fields: −40 to 0 dB relative to baseline peak. B-mode: −55 to 0 dB relative to baseline image peak.', 'Straight-ray ellipsoid model; anatomical mesh is visual context. No clinical interpretation.'].forEach((line, i) => ctx.fillText(line, 40, 450 + i * 42));
  c.toBlob(blob => { if (!blob) return; const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = 'neuroacoustic-comparison.png'; a.click(); setTimeout(() => URL.revokeObjectURL(url), 1000); });
}
function Contribution({ result, selected }: { result: SimulationResult; selected: number | null }) {
  const data = useMemo(() => {
    const s = result.scenario, index = s.array.elements.findIndex(e => e.id === selected); if (index < 0) return;
    const e = s.array.elements[index], path = pathBetween(e.position, s.targetM, s.medium, s.frequencyHz, s.mode === 'homogeneous');
    const amplitude = result.sequence.weights[index] * elementAmplitude(s, e, s.targetM, path);
    const phase = -2 * Math.PI * s.frequencyHz * (path.travelTimeS + result.sequence.delaysS[index]);
    const values = Array.from({ length: s.gridSize }, (_, x) => {
      const point = pixelPosition(s, x, Math.floor(s.gridSize / 2), s.gridSize);
      return Math.abs(result.sequence.weights[index] * elementAmplitude(s, e, point));
    });
    return { path, amplitude, phase, values, enabled: e.enabled };
  }, [result, selected]);
  if (!data) return null;
  return <div className="contribution"><div className="plot-caption"><span>Selected element {selected} · {data.enabled ? 'weighted target contribution' : 'disabled'}</span><span>{formatNumber(data.path.travelTimeS * 1e6, 2)} µs travel</span></div><div className="contribution-values"><span>|p| {formatNumber(Math.abs(data.amplitude), 4)} a.u.</span><span>Phase {formatNumber(Math.atan2(Math.sin(data.phase), Math.cos(data.phase)) * 180 / Math.PI, 1)}°</span><span>Loss {formatNumber(data.path.attenuationDb, 2)} dB</span></div><div className="layer-lengths">{Object.entries(data.path.layerLengthsM).filter(([, v]) => v > 0).map(([layer, length]) => <span key={layer}>{layer} {formatNumber(length * 1000, 1)} mm</span>)}</div><Sparkline values={data.values} unit="a.u." label="Selected element · lateral amplitude contribution" color="#edbd75" /></div>;
}
function Diagnostics({ result, selected }: { result: SimulationResult; selected: number | null }) {
  const [truth, setTruth] = useState(false);
  const center = Math.floor(result.field.size / 2), row = (f: FieldPlane) => Array.from({ length: f.size }, (_, x) => 20 * Math.log10(Math.max(f.magnitude[center * f.size + x], 1e-15) / Math.max(result.baselineField.peak, 1e-15)));
  return <div className="diagnostics">
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">02 / wave interference</span><h2>Pressure field</h2></div><span className="tag">fixed baseline scale</span></div><div className="comparison-maps"><MapCanvas field={result.baselineField} normalization={result.baselineField.peak} label="Homogeneous delays" /><MapCanvas field={result.field} normalization={result.baselineField.peak} label="Current delays" /></div><div className="color-legend"><span>−40 dB</span><i /><span>0 dB</span></div><p className="chart-foot">One physical x–z slice at y = {formatNumber(result.field.centerM[1] * 1000, 1)} mm. Both maps reference the baseline peak; saturated values may exceed it.</p><Sparkline values={row(result.field)} unit="dB" label="Lateral pressure · nearest target z row" /></section>
    <section className="panel"><div className="panel-heading"><div><span className="eyebrow">04 / receive & reconstruct</span><h2>Delay-and-sum B-mode</h2></div><label className="checkbox"><input type="checkbox" checked={truth} onChange={e => setTruth(e.target.checked)} />Phantom truth</label></div><div className="comparison-maps"><BModeCanvas image={result.baselineReconstruction} normalization={result.baselineReconstruction.peak} label="Baseline" result={result} truth={truth} /><BModeCanvas image={result.reconstruction} normalization={result.baselineReconstruction.peak} label="Current" result={result} truth={truth} /></div><div className="gray-legend"><span>−55 dB</span><i /><span>0 dB</span></div><p className="chart-foot">Identical phantom, acquisitions, noise seed, and image grid. Envelope compression uses a shared baseline image peak.</p><Sparkline values={Array.from(result.sequence.delaysS).filter((_, i) => result.sequence.weights[i] > 0).map(d => d * 1e6)} unit="µs" label="Transmit delay · active element order" color="#edbd75" /></section>
    <section className="panel rf-section"><div className="panel-heading"><div><span className="eyebrow">03 / channel acquisition</span><h2>The echoes before imaging</h2></div><span className="tag">computed RF</span></div><RFPlot result={result} selected={selected} /><Contribution result={result} selected={selected} /></section>
  </div>;
}
export default memo(Diagnostics);

