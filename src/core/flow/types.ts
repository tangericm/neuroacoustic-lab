/** Independent homogeneous imaging probe; does not inherit focused-head-array constraints. */
export interface FlowConfig {
  seed:number; size:number; frames:number; frameIntervalS:number; frequencyHz:number;
  soundSpeedMps:number; attenuationDbCmAtMHz:number; attenuationPower:number; samplingRateHz:number; samples:number; elementCount:number;
  elementPitchM:number; elementRadiusM:number; probeZM:number; centerZM:number; extentM:number;
  tissueDisplacementM:number; bloodSpeedMps:number; noiseRmsRelative:number; clutterRank:number;
}
export interface ComplexFrames { frames:number; pixels:number; real:Float64Array; imag:Float64Array }
export interface FlowVessel { id:string; pointsM:[number,number][]; radiusM:number; speedMps:number; role:'calibration'|'network' }
export interface FlowMetric { label:string; value:number|null; unit:string; scope:string }
export interface FlowMethod { title:string; formula:string; variables:string; explanation:string; limitation:string }
export interface FlowFixture {
  version:1; kind:'temporal-flow-imaging'; config:FlowConfig;
  plane:{size:number;extentM:number;centerM:[number,number,number];axes:'xz';rowDirection:'decreasing-z'};
  acquisition:{channelShape:[number,number,number,number];axisOrder:['slowTime','transmit','receive','fastTime'];timeOriginS:number;transmitIndex:number;frameTimesS:number[];noiseRms:number};
  truth:{vessels:FlowVessel[];tissueDisplacementM:number;description:string};
  /** bmode contains grayscale bytes 0–255 already mapped from true envelopes with one scale. */
  cine:{frameIndices:number[];timeMs:number[];bmode: number[][];referenceAmplitude:number;floorDb:number};
  power:{before:number[];after:number[];referencePower:number;floorDb:number};
  flow:{velocityMps:number[];coherence:number[];valid:number[];nyquistMps:number;positiveDirection:string;powerThreshold:number;coherenceThreshold:number};
  displacement:{points:{xM:number;zM:number;dzM:number;confidence:number;valid:boolean}[];fromFrame:number;toFrame:number;truthM:number;confidenceThreshold:number;searchRadiusPixels:number};
  spectrum:{singularValues:number[];removedModes:number};
  rf:{timeUs:number[];traces:{frame:number;receiver:number;values:number[]}[];referenceAmplitude:number};
  metrics:FlowMetric[]; methods:FlowMethod[];
  compute:{timingsMs:Record<string,number>;cachedDelayEntries:number;directTravelEvaluations:number;cachedTravelEvaluations:number;note:string};
  provenance:{modelVersion:string;generatedUtc:string;sourceHashes:Record<string,string>;assumptions:string[];sources:{title:string;url:string}[];referenceUrl:string};
}
