import { Suspense, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { RefObject } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei';
import * as THREE from 'three';
import { Brain } from '../components/HeadScene';
import { AnatomyBoundary, AnatomyStatus } from '../components/AnatomyStatus';
import type { AnatomyLoadState } from '../components/AnatomyStatus';
import { SceneErrorBoundary } from '../components/SceneErrorBoundary';
import { useOwnedResource } from '../hooks/useOwnedResource';
import type { Vec3 } from '../core/types';
import type { FocusDemoFixture } from './types';
import { FocusTimeline, createBoundaryGeometry, createFocusTexture, focusSnapshotFrame, paintFocusFrame, tickFocusPlayback } from './focusSceneUtils';
import './focus.css';

const REPLAY_MS = 8000;
type Command = { id: number; snapshot: boolean };

function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(() => typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true);
  useEffect(() => {
    const preference = window.matchMedia?.('(prefers-reduced-motion: reduce)');
    if (!preference) return;
    const changed = () => setReduced(preference.matches);
    preference.addEventListener('change', changed);
    return () => preference.removeEventListener('change', changed);
  }, []);
  return reduced;
}

/** A hidden document or offscreen scene cannot sustain the demand-render chain. */
function useSceneVisible(ref: RefObject<HTMLDivElement | null>): boolean {
  const [visible, setVisible] = useState(() => !document.hidden);
  useEffect(() => {
    let intersecting = true;
    const changed = () => setVisible(intersecting && !document.hidden);
    const observer = typeof IntersectionObserver === 'undefined' ? undefined : new IntersectionObserver(entries => {
      intersecting = entries[0]?.isIntersecting ?? false;
      changed();
    }, { threshold: .05 });
    if (ref.current) observer?.observe(ref.current);
    document.addEventListener('visibilitychange', changed);
    changed();
    return () => { observer?.disconnect(); document.removeEventListener('visibilitychange', changed); };
  }, [ref]);
  return visible;
}

function AcousticBoundary({ radii, y, color }: { radii: Vec3; y: number; color: string }) {
  const geometry = useMemo(() => createBoundaryGeometry(radii, y), [radii, y]);
  useOwnedResource(geometry);
  return <lineLoop renderOrder={3}><primitive object={geometry} attach="geometry" /><lineBasicMaterial color={color} transparent opacity={.85} /></lineLoop>;
}

function FixedElement({ element }: { element: FocusDemoFixture['scenario']['array']['elements'][number] }) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...element.normal).normalize()), [element.normal]);
  return <mesh position={element.position} quaternion={quaternion}>
    <cylinderGeometry args={[element.radiusM, element.radiusM, .0018, 20]} />
    <meshStandardMaterial color="#9bd9dd" emissive="#1c3d44" emissiveIntensity={.35} metalness={.35} roughness={.42} />
  </mesh>;
}

function ContextLifetime({ onLost }: { onLost: () => void }) {
  const gl = useThree(state => state.gl);
  useEffect(() => {
    const lost = (event: Event) => { event.preventDefault(); onLost(); };
    const canvas = gl.domElement;
    canvas.addEventListener('webglcontextlost', lost);
    return () => canvas.removeEventListener('webglcontextlost', lost);
  }, [gl, onLost]);
  return null;
}

function PulseScene({ fixture, frames, snapshot, command, active, onFinish, onSample, onReady, onAnatomyError, onLost }: {
  fixture: FocusDemoFixture; frames: Int16Array; snapshot: number; command: Command; active: boolean;
  onFinish: () => void; onSample: (frame: number, captured: boolean) => void;
  onReady: () => void; onAnatomyError: () => void; onLost: () => void;
}) {
  const invalidate = useThree(state => state.invalidate);
  const camera = useThree(state => state.camera);
  const sceneWidth = useThree(state => state.size.width);
  useEffect(() => {
    if (camera instanceof THREE.PerspectiveCamera) {
      camera.fov = sceneWidth < 600 ? 48 : 36;
      camera.updateProjectionMatrix();
      invalidate();
    }
  }, [camera, sceneWidth, invalidate]);
  const clips = useMemo(() => [new THREE.Plane(new THREE.Vector3(0, 1, 0), -fixture.plane.centerM[1])], [fixture]);
  const outer = fixture.scenario.medium.outerRadiiM;
  const skullOuter = useMemo(() => outer.map(r => r - fixture.scenario.medium.scalpThicknessM) as Vec3, [outer, fixture]);
  const skullInner = useMemo(() => skullOuter.map(r => r - fixture.scenario.medium.skullThicknessM) as Vec3, [skullOuter, fixture]);
  const texture = useMemo(() => {
    const resource = createFocusTexture(fixture.plane.size);
    paintFocusFrame(resource, frames, command.snapshot ? snapshot : 0, fixture.plane.size);
    return resource;
  }, [fixture, frames, snapshot]);
  useOwnedResource(texture);
  const timeline = useMemo(() => new FocusTimeline(fixture.frames.count, REPLAY_MS, snapshot), [fixture, snapshot]);
  const skipFirstTick = useRef(true);
  const publishSample = useCallback((frame: number, captured: boolean) => {
    paintFocusFrame(texture, frames, frame, fixture.plane.size);
    onSample(frame, captured);
  }, [texture, frames, fixture, onSample]);
  useEffect(() => {
    timeline.reset();
    if (command.snapshot) { timeline.frame = snapshot; timeline.done = true; }
    paintFocusFrame(texture, frames, timeline.frame, fixture.plane.size);
    onSample(timeline.frame, command.snapshot);
    skipFirstTick.current = true;
    invalidate();
  }, [command, timeline, texture, frames, fixture, snapshot, onSample, invalidate]);
  useEffect(() => { skipFirstTick.current = true; if (active) invalidate(); }, [active, invalidate]);
  useFrame((_, delta) => {
    if (!active || timeline.done) return;
    const deltaMs = skipFirstTick.current ? 0 : delta * 1000;
    skipFirstTick.current = false;
    tickFocusPlayback(timeline, deltaMs, active, publishSample, onFinish, invalidate);
  });
  const target = fixture.scenario.targetM;
  return <>
    <color attach="background" args={['#11191d']} />
    <ambientLight intensity={.9} />
    <directionalLight position={[.12, -.35, .4]} intensity={2.4} color="#fff5df" />
    <directionalLight position={[-.2, .15, .1]} intensity={1.4} color="#a7dce0" />
    <AnatomyBoundary onError={onAnatomyError}><Suspense fallback={null}><Brain scenario={fixture.scenario} clips={clips} color="#bfb298" onReady={onReady} /></Suspense></AnatomyBoundary>
    <AcousticBoundary radii={outer} y={fixture.plane.centerM[1] - .0007} color="#78939b" />
    <AcousticBoundary radii={skullOuter} y={fixture.plane.centerM[1] - .0008} color="#d6c3a1" />
    <AcousticBoundary radii={skullInner} y={fixture.plane.centerM[1] - .0009} color="#b8a787" />
    {fixture.scenario.array.elements.map(element => <FixedElement key={element.id} element={element} />)}
    <mesh position={[fixture.plane.centerM[0], fixture.plane.centerM[1] - .0011, fixture.plane.centerM[2]]} rotation={[Math.PI / 2, 0, 0]} renderOrder={4}>
      <planeGeometry args={[fixture.plane.extentM, fixture.plane.extentM]} />
      <meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent depthTest={false} depthWrite={false} toneMapped={false} />
    </mesh>
    <group position={[target[0], target[1] - .0015, target[2]]}>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={8}><ringGeometry args={[.0029, .0054, 48]} /><meshBasicMaterial color="#121a20" side={THREE.DoubleSide} transparent depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]} renderOrder={9}><ringGeometry args={[.0035, .0048, 48]} /><meshBasicMaterial color="#ffb52e" side={THREE.DoubleSide} transparent depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
      <mesh renderOrder={10}><sphereGeometry args={[.001, 16, 12]} /><meshBasicMaterial color="#ffb52e" transparent depthTest={false} depthWrite={false} toneMapped={false} /></mesh>
      {[[-.007, 0, 0], [.007, 0, 0], [0, 0, -.007], [0, 0, .007]].map((offset, index) => <mesh key={index} position={offset as Vec3} rotation={[Math.PI / 2, 0, index < 2 ? Math.PI / 2 : 0]} renderOrder={9}><planeGeometry args={[.0008, .0028]} /><meshBasicMaterial color="#ffb52e" side={THREE.DoubleSide} transparent depthTest={false} depthWrite={false} toneMapped={false} /></mesh>)}
    </group>
    <OrbitControls makeDefault enableDamping={false} enablePan={false} minDistance={.24} maxDistance={.65} target={[0, 0, .014]} />
    <ContextLifetime onLost={onLost} />
  </>;
}

export default function FocusedUltrasound({ fixture, frames }: { fixture: FocusDemoFixture; frames: Int16Array }) {
  const reduced = useReducedMotion();
  const sceneRef = useRef<HTMLDivElement>(null);
  const timeRef = useRef<HTMLSpanElement>(null);
  const visible = useSceneVisible(sceneRef);
  const snapshot = useMemo(() => focusSnapshotFrame(fixture, frames), [fixture, frames]);
  const [playing, setPlaying] = useState(!reduced);
  const [completed, setCompleted] = useState(reduced);
  const [command, setCommand] = useState<Command>({ id: 0, snapshot: reduced });
  const [unavailable, setUnavailable] = useState(false);
  const [anatomy, setAnatomy] = useState<AnatomyLoadState>('loading');
  const onReady = useCallback(() => setAnatomy('ready'), []);
  const onAnatomyError = useCallback(() => setAnatomy('error'), []);
  const onLost = useCallback(() => { setUnavailable(true); setPlaying(false); }, []);
  const onFinish = useCallback(() => { setPlaying(false); setCompleted(true); }, []);
  const onSample = useCallback((frame: number, captured: boolean) => {
    if (timeRef.current) timeRef.current.textContent = `${((fixture.frames.startS + frame * fixture.frames.stepS) * 1e6).toFixed(1)} μs physical · ${captured ? 'captured focus snapshot' : 'pulse envelope'}`;
  }, [fixture]);
  useEffect(() => {
    if (reduced) {
      setPlaying(false); setCompleted(true);
      setCommand(previous => ({ id: previous.id + 1, snapshot: true }));
    }
  }, [reduced]);
  const replay = () => { setCompleted(false); setCommand(previous => ({ id: previous.id + 1, snapshot: false })); setPlaying(true); };
  const toggle = () => { if (completed) replay(); else setPlaying(previous => !previous); };
  const physicalDurationUs = (fixture.frames.count - 1) * fixture.frames.stepS * 1e6;
  const initialTimeUs = (fixture.frames.startS + (reduced ? snapshot : 0) * fixture.frames.stepS) * 1e6;
  return <div className="focus-demo">
    <div className="focus-scene" ref={sceneRef} aria-label="3D fixed focused-ultrasound demonstration">
      {unavailable ? <div className="focus-unavailable" role="alert">The 3D view is unavailable on this device. The ultrasound imaging demonstration remains available.</div> : <SceneErrorBoundary onError={onLost}>
        <Canvas frameloop="demand" camera={{ position: [.10, -.33, .14], up: [0, 0, 1], near: .001, far: 3, fov: 36 }} dpr={[1, 1.5]} gl={{ antialias: true, localClippingEnabled: true }}>
          <PulseScene fixture={fixture} frames={frames} snapshot={snapshot} command={command} active={playing && visible && !unavailable} onFinish={onFinish} onSample={onSample} onReady={onReady} onAnatomyError={onAnatomyError} onLost={onLost} />
        </Canvas>
      </SceneErrorBoundary>}
      {!unavailable && <AnatomyStatus state={anatomy} />}
      <div className="focus-hud"><span>64 elements · fixed x–z plane</span><span className="focus-target-label">● Fixed target ({fixture.scenario.targetM.map(v => Math.round(v * 1000)).join(', ')}) mm</span></div>
      <div className="focus-scene-bottom"><span ref={timeRef}>{initialTimeUs.toFixed(1)} μs physical · {reduced ? 'captured focus snapshot' : 'pulse envelope'}</span><span>Drag to orbit</span></div>
    </div>
    <div className="focus-controls">
      <button type="button" onClick={toggle} disabled={unavailable} aria-label={playing ? 'Pause focused ultrasound' : 'Play focused ultrasound'}>{playing ? 'Pause' : 'Play'}</button>
      <button type="button" onClick={replay} disabled={unavailable}>Replay</button>
      <p className="focus-caption">{physicalDurationUs.toFixed(0)} μs of propagation → {REPLAY_MS / 1000} s replay. {completed ? 'Holding a captured focus frame.' : !visible && playing ? 'Playback waits while this view is hidden.' : reduced ? 'Motion plays only when requested.' : 'One pulse, slowed to see its arrival.'}</p>
    </div>
    <div className="focus-legend"><span><i className="focus-wave-key" /> Pulse envelope · relative amplitude</span><span><i className="focus-anatomy-key" /> Brain atlas</span><span><i className="focus-boundary-key" /> Acoustic boundaries</span></div>
    <details className="focus-methods"><summary>Methods &amp; anatomy source</summary>
      <p>Cached finite pulse envelopes from a fixed 64-element array. Element delays align modelled arrivals at the amber target. The movie displays one x–z slice of the travelling wave packet; the anatomy provides 3D context.</p>
      <p>The envelope amplitude A is the magnitude of the coherent complex sum of all element pulses, calculated before display. All frames share amplitude scale {fixture.frames.pressureScale.toPrecision(4)} (relative units). Brightness and opacity use (A / scale)<sup>0.4</sup>, with values below 0.4% hidden; clipped int16 samples saturate at the fixed scale. No frame is rescaled. At completion, the strongest sampled target neighborhood within ±2 μs of predicted arrival is held and labeled as a captured packet snapshot.</p>
      <p><a href={`${import.meta.env.BASE_URL}demo/display-sampling-report.json`}>Display sampling checks</a> document the frozen spatial grid and physical frame interval.</p>
      <p>The fitted <a href="https://github.com/itayinbarr/brainproject" target="_blank" rel="noreferrer">Brain Project atlas by Itay Inbar</a> uses Z-Anatomy / BodyParts3D under CC BY-SA 4.0. <a href={`${import.meta.env.BASE_URL}models/ATTRIBUTION.md`}>Full attribution</a>. The acoustic layers are ellipsoids; the atlas is educational anatomical context.</p>
      {fixture.provenance.assumptions.length > 0 && <ul>{fixture.provenance.assumptions.map(assumption => <li key={assumption}>{assumption}</li>)}</ul>}
    </details>
  </div>;
}
