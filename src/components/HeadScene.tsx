import { Component, Suspense, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Canvas, useFrame, useLoader } from '@react-three/fiber';
import { Html, Line, OrbitControls } from '@react-three/drei';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import * as THREE from 'three';
import type { FieldPlane, Scenario, Vec3 } from '../core/types';
import { fitScale, includeAtlasCategory } from '../hooks/anatomy';
import { useOwnedResource } from '../hooks/useOwnedResource';
import { SceneErrorBoundary, sceneUnavailable } from './SceneErrorBoundary';

export function pressureColor(value: number): [number, number, number] {
  const t = Math.max(0, Math.min(1, value));
  const stops = [[7, 20, 32], [15, 63, 81], [37, 160, 172], [185, 210, 147], [249, 187, 82], [255, 243, 200]];
  const p = t * (stops.length - 1), a = Math.min(stops.length - 2, Math.floor(p)), f = p - a;
  return [0, 1, 2].map(i => Math.round(stops[a][i] * (1 - f) + stops[a + 1][i] * f)) as [number, number, number];
}
export function fieldPixels(field: FieldPlane, normalization: number, phase?: number): Uint8Array {
  const pixels = new Uint8Array(field.size * field.size * 4);
  for (let i = 0; i < field.magnitude.length; i++) {
    let color: [number, number, number];
    if (phase === undefined) {
      const db = 20 * Math.log10(Math.max(field.magnitude[i], 1e-15) / Math.max(normalization, 1e-15));
      color = pressureColor((db + 40) / 40);
    } else {
      const signal = (field.real[i] * Math.cos(phase) - field.imag[i] * Math.sin(phase)) / Math.max(normalization, 1e-15);
      const t = Math.min(1, Math.abs(signal));
      color = signal > 0 ? [Math.round(30 + 225 * t), Math.round(44 + 150 * t), Math.round(55 + 25 * t)] : [Math.round(30 + 15 * t), Math.round(44 + 171 * t), Math.round(55 + 191 * t)];
    }
    pixels.set([...color, 225], i * 4);
  }
  return pixels;
}

function Brain({ scenario, clips, onTarget }: { scenario: Scenario; clips: THREE.Plane[]; onTarget: (point: Vec3) => void }) {
  const gltf = useLoader(GLTFLoader, `${import.meta.env.BASE_URL}models/brain.glb`, loader => { const draco = new DRACOLoader(); draco.setDecoderPath(`${import.meta.env.BASE_URL}draco/`); loader.setDRACOLoader(draco); });
  const manifestRaw = useLoader(THREE.FileLoader, `${import.meta.env.BASE_URL}models/manifest.json`);
  const categories = useMemo(() => {
    const manifest = JSON.parse(String(manifestRaw)) as { nodes: { name: string; category: string }[] };
    return new Map(manifest.nodes.flatMap(node => [[node.name, node.category], [THREE.PropertyBinding.sanitizeNodeName(node.name), node.category]]));
  }, [manifestRaw]);
  const mergedGeometry = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const geometries: THREE.BufferGeometry[] = [];
    gltf.scene.traverse(o => { if (o instanceof THREE.Mesh) {
      let category: unknown;
      for (let parent: THREE.Object3D | null = o; parent && category === undefined; parent = parent.parent) {
        category = parent.userData.bx_cat ?? categories.get(parent.userData.name) ?? categories.get(parent.name);
      }
      if (!includeAtlasCategory(category)) return;
      let geometry = o.geometry.clone(); if (geometry.index) geometry = geometry.toNonIndexed();
      for (const key of Object.keys(geometry.attributes)) if (key !== 'position' && key !== 'normal') geometry.deleteAttribute(key);
      if (!geometry.attributes.normal) geometry.computeVertexNormals();
      geometry.applyMatrix4(o.matrixWorld); geometries.push(geometry);
    } });
    if (!geometries.length) throw new Error('The anatomical manifest selected no brain structures.');
    const geometry = mergeGeometries(geometries, false)!;
    geometries.forEach(g => g.dispose());
    geometry.rotateX(Math.PI / 2); // GLB is Y-up. The acoustic workspace is Z-up.
    geometry.computeBoundingBox(); const center = geometry.boundingBox!.getCenter(new THREE.Vector3());
    geometry.translate(-center.x, -center.y, -center.z);
    return geometry;
  }, [gltf, categories]);
  useOwnedResource(mergedGeometry);
  const brain = useMemo(() => {
    const copy = new THREE.Mesh(mergedGeometry, new THREE.MeshStandardMaterial({ color: '#a3a6b1', roughness: .8, metalness: .04, side: THREE.DoubleSide, clippingPlanes: clips }));
    const inner = scenario.medium.outerRadiiM.map(r => r - scenario.medium.scalpThicknessM - scenario.medium.skullThicknessM - scenario.medium.fluidThicknessM);
    const scale = fitScale(mergedGeometry.getAttribute('position').array, inner);
    const container = new THREE.Group(); container.add(copy); container.scale.setScalar(scale);
    return container;
  }, [mergedGeometry, clips, scenario.medium]);
  useEffect(() => () => brain.traverse(o => { if (o instanceof THREE.Mesh && o.material instanceof THREE.Material) o.material.dispose(); }), [brain]);
  return <primitive object={brain} onClick={(e: { point: THREE.Vector3; stopPropagation: () => void }) => { e.stopPropagation(); onTarget(e.point.toArray() as Vec3); }} />;
}
class AnatomyBoundary extends Component<{ children: ReactNode; fallback: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? this.props.fallback : this.props.children; }
}
function ElementDisk({ element, selected, onSelect }: { element: Scenario['array']['elements'][number]; selected: boolean; onSelect: () => void }) {
  const quaternion = useMemo(() => new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...element.normal).normalize()), [element.normal]);
  return <group position={element.position} quaternion={quaternion}>
    <mesh onClick={e => { e.stopPropagation(); onSelect(); }}><cylinderGeometry args={[element.radiusM, element.radiusM, .0018, 28]} /><meshStandardMaterial color={!element.enabled ? '#343b43' : selected ? '#ffc66d' : '#59c8cc'} emissive={selected ? '#674319' : '#143235'} emissiveIntensity={.5} metalness={.55} roughness={.4} /></mesh>
    {selected && <mesh rotation={[Math.PI / 2, 0, 0]}><ringGeometry args={[element.radiusM * 1.2, element.radiusM * 1.32, 32]} /><meshBasicMaterial color="#ffc66d" side={THREE.DoubleSide} /></mesh>}
  </group>;
}
function FieldMesh({ field, normalization, phase }: { field: FieldPlane; normalization: number; phase?: number }) {
  const texture = useMemo(() => {
    const t = new THREE.DataTexture(fieldPixels(field, normalization, phase), field.size, field.size, THREE.RGBAFormat);
    t.needsUpdate = true; t.magFilter = THREE.LinearFilter; t.flipY = true; return t;
  }, [field, normalization, phase]);
  useOwnedResource(texture);
  return <mesh position={[field.centerM[0], field.centerM[1] - .0003, field.centerM[2]]} rotation={[Math.PI / 2, 0, 0]} renderOrder={5}><planeGeometry args={[field.extentM, field.extentM]} /><meshBasicMaterial map={texture} side={THREE.DoubleSide} transparent opacity={.45} depthWrite={false} /></mesh>;
}
function Head({ scenario, field, normalization, phase, selected, onSelect, onTarget, cutaway, layers }: SceneProps) {
  const clips = useMemo(() => cutaway ? [new THREE.Plane(new THREE.Vector3(0, -1, 0), scenario.targetM[1])] : [], [cutaway, scenario.targetM]);
  const outer = scenario.medium.outerRadiiM;
  const skullOuter = outer.map(r => r - scenario.medium.scalpThicknessM) as Vec3;
  const skullInner = skullOuter.map(r => r - scenario.medium.skullThicknessM) as Vec3;
  const r = scenario.array.radiusM;
  const circle = Array.from({ length: 100 }, (_, i) => [r * Math.cos(i / 99 * Math.PI * 2), 0, r * Math.sin(i / 99 * Math.PI * 2)] as Vec3);
  return <>
    <ambientLight intensity={.65} /><directionalLight position={[.4, .1, .5]} intensity={2.4} /><pointLight position={[-.2, -.1, .15]} color="#51c8d2" intensity={.015} />
    {layers.brain && <AnatomyBoundary fallback={<Html center><span className="anatomy-status">Anatomical atlas unavailable. Acoustic ellipsoids remain visible.</span></Html>}><Suspense fallback={<Html center><span className="anatomy-status">Loading anatomical atlas…</span></Html>}><Brain scenario={scenario} clips={clips} onTarget={onTarget} /></Suspense></AnatomyBoundary>}
    {layers.scalp && <mesh scale={outer}><sphereGeometry args={[1, 72, 48]} /><meshPhysicalMaterial color="#718297" transparent opacity={.03} roughness={.25} side={THREE.DoubleSide} clippingPlanes={clips} depthWrite={false} /></mesh>}
    {layers.skull && [skullOuter, skullInner].map((radii, i) => <mesh key={i} scale={radii}><sphereGeometry args={[1, 72, 48]} /><meshStandardMaterial color="#dcc9aa" transparent opacity={i === 0 ? .04 : .025} side={THREE.DoubleSide} clippingPlanes={clips} depthWrite={false} /></mesh>)}
    <Line points={circle} color="#34525d" lineWidth={1} transparent opacity={.5} />
    {scenario.array.elements.map(element => <ElementDisk key={element.id} element={element} selected={selected === element.id} onSelect={() => onSelect(element.id)} />)}
    {selected !== null && <Line points={[scenario.array.elements.find(e => e.id === selected)?.position ?? [0, 0, 0], scenario.targetM]} color="#f1ba68" lineWidth={1} dashed dashSize={.003} gapSize={.002} transparent opacity={.7} depthTest={false} renderOrder={9} />}
    {field && <FieldMesh field={field} normalization={normalization} phase={phase} />}
    <mesh position={[0, scenario.targetM[1], 0]} rotation={[Math.PI / 2, 0, 0]} onClick={e => { e.stopPropagation(); onTarget(e.point.toArray() as Vec3); }}><planeGeometry args={[outer[0] * 2, outer[2] * 2]} /><meshBasicMaterial transparent opacity={0} side={THREE.DoubleSide} depthWrite={false} /></mesh>
    <group position={scenario.targetM}><mesh renderOrder={10}><sphereGeometry args={[.0021, 20, 20]} /><meshBasicMaterial color="#ffcb76" depthTest={false} depthWrite={false} /></mesh><mesh renderOrder={11}><sphereGeometry args={[.004, 20, 20]} /><meshBasicMaterial color="#ffdba1" wireframe transparent opacity={.45} depthTest={false} depthWrite={false} /></mesh></group>
    <Line points={[[-.065, -.13, -.11], [-.025, -.13, -.11]]} color="#9cb5be" lineWidth={2} />
    <OrbitControls makeDefault enableDamping minDistance={.16} maxDistance={.7} target={[0, 0, .005]} />
  </>;
}
function FrameMeter({ onRate }: { onRate: (fps: number) => void }) {
  const windowRef = useRef({ since: performance.now(), frames: 0 });
  useFrame(() => { const now = performance.now(), w = windowRef.current; ++w.frames; if (now - w.since >= 1000) { onRate(w.frames * 1000 / (now - w.since)); w.since = now; w.frames = 0; } });
  return null;
}
interface SceneProps { scenario: Scenario; field?: FieldPlane; normalization: number; phase?: number; selected: number | null; onSelect: (id: number) => void; onTarget: (point: Vec3) => void; cutaway: boolean; layers: { brain: boolean; skull: boolean; scalp: boolean } }
export default function HeadScene(props: SceneProps) {
  const [unavailable, setUnavailable] = useState(false);
  const [fps, setFps] = useState<number>();
  return <div className="scene-canvas">
    <SceneErrorBoundary onError={() => setUnavailable(true)}>{unavailable ? sceneUnavailable : <Canvas camera={{ position: [.28, -.36, .23], up: [0, 0, 1], near: .001, far: 3, fov: 34 }} dpr={[1, 1.7]} gl={{ antialias: true, localClippingEnabled: true }} onCreated={({ gl }) => { gl.domElement.addEventListener('webglcontextlost', () => setUnavailable(true)); }}><Head {...props} /><FrameMeter onRate={setFps} /></Canvas>}</SceneErrorBoundary>
    <span className="frame-meter">{unavailable ? '3D unavailable · numerical views remain active' : fps === undefined ? 'Measuring render cadence…' : `${fps.toFixed(0)} FPS · measured 1 s window`}</span>
  </div>;
}
