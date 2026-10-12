/** SI units throughout. x: lateral, y: anterior/posterior, z: superior. */
export type Vec3 = [number, number, number];
export type PropagationMode = 'homogeneous' | 'uncorrected' | 'corrected';
export interface ArrayElement { id:number; position:Vec3; normal:Vec3; radiusM:number; enabled:boolean; azimuthRad:number; polarRad:number }
export interface ArrayGeometry { elements:ArrayElement[]; radiusM:number; rotationRad:Vec3 }
export interface Material { name:string; soundSpeedMps:number; densityKgM3:number; attenuationDbCmAtMHz:number; attenuationPower:number }
export interface Medium { outerRadiiM:Vec3; scalpThicknessM:number; skullThicknessM:number; fluidThicknessM:number; materials:Record<'water'|'scalp'|'skull'|'fluid'|'brain',Material> }
export interface Scenario { version:1; seed:number; frequencyHz:number; assumedSoundSpeedMps:number; mode:PropagationMode; apodization:'uniform'|'cosine'; array:ArrayGeometry; medium:Medium; targetM:Vec3; acquisitions:number; noiseDb:number; gridSize:number; fieldOfViewM:number }
export interface TransmitSequence { delaysS:Float64Array; weights:Float64Array; activeIds:number[]; acquisitions:number[]; driveEnergy:number }
export interface PathResult { travelTimeS:number; amplitude:number; attenuationDb:number; lengthM:number; layerLengthsM:Record<string,number> }
export interface FieldPlane { size:number; extentM:number; centerM:Vec3; axes:'xz'; real:Float32Array; imag:Float32Array; magnitude:Float32Array; peak:number }
export interface Scatterer { positionM:Vec3; amplitude:number; kind:'speckle'|'point' }
export interface Phantom { scatterers:Scatterer[]; cystCenterM:Vec3; cystRadiusM:number; planeYM:number }
export interface ChannelData { samples:Float32Array; shape:[number,number,number]; axisOrder:['transmit','receive','fastTime']; samplingRateHz:number; timeOriginS:number; transmitIds:number[]; receiveIds:number[]; peak:number }
export interface ReconstructionResult { size:number; extentM:number; centerM:Vec3; real:Float32Array; imag:Float32Array; envelope:Float32Array; db:Float32Array; peak:number }
export interface ComparisonMetrics { targetPressure:number; targetGainDb:number; focalErrorM:number; focalWidthM:number; sidelobeDb:number; meanAttenuationDb:number; driveEnergy:number; activeElements:number; cystContrastDb:number; localizationErrorM:number }
/** elementFields is element-major, then row-major z/x; amplitudes retain the shared drive budget. */
export interface SimulationResult { scenario:Scenario; sequence:TransmitSequence; field:FieldPlane; baselineField:FieldPlane; elementFields?:{size:number;real:Float32Array;imag:Float32Array}; phantom:Phantom; channels:ChannelData; reconstruction:ReconstructionResult; baselineReconstruction:ReconstructionResult; metrics:ComparisonMetrics; timingsMs:Record<string,number>; modelVersion:string; numericBytes:number }
export interface OptimizationCandidate { rotationRad:Vec3; radiusM:number; objectiveDb:number; targetPressure:number }
export interface OptimizationResult { scenario:Scenario; candidates:OptimizationCandidate[]; initialObjectiveDb:number; finalObjectiveDb:number; elapsedMs:number }
export type WorkerRequest = {type:'simulate';id:number;scenario:Scenario} | {type:'optimize';id:number;scenario:Scenario};
export type WorkerResponse = {type:'result';id:number;result:SimulationResult} | {type:'optimized';id:number;result:OptimizationResult} | {type:'progress';id:number;completed:number;total:number} | {type:'error';id:number;message:string};
