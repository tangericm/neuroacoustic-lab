import type { ArrayGeometry, Scenario, Vec3 } from './types';
export function rotate(v:Vec3,r:Vec3):Vec3 {
  const [a,b,c]=r; const x=v[0], y=v[1]*Math.cos(a)-v[2]*Math.sin(a), z=v[1]*Math.sin(a)+v[2]*Math.cos(a);
  const u=x*Math.cos(b)+z*Math.sin(b), w=-x*Math.sin(b)+z*Math.cos(b);
  return [u*Math.cos(c)-y*Math.sin(c),u*Math.sin(c)+y*Math.cos(c),w];
}
export function buildArray(count=64,radiusM=.118,rotationRad:Vec3=[0,0,0]):ArrayGeometry {
  if(!Number.isInteger(count)||count<1||count>128||!Number.isFinite(radiusM)||radiusM<.108||radiusM>.15||!rotationRad.every(Number.isFinite))throw new Error('Invalid array geometry');
  const elements=Array.from({length:count},(_,id)=>{
    const azimuthRad=id*Math.PI*(3-Math.sqrt(5)), polarRad=Math.acos(1-(id+.5)/count*(1-Math.cos(.92)));
    const unit=rotate([Math.sin(polarRad)*Math.cos(azimuthRad),Math.sin(polarRad)*Math.sin(azimuthRad),Math.cos(polarRad)],rotationRad);
    return {id,position:unit.map(v=>v*radiusM) as Vec3,normal:unit.map(v=>-v) as Vec3,radiusM:.003,enabled:true,azimuthRad,polarRad};
  });
  return {elements,radiusM,rotationRad};
}
export function defaultScenario():Scenario {return {
  version:1,seed:1729,frequencyHz:500000,assumedSoundSpeedMps:1560,mode:'corrected',apodization:'uniform',
  array:buildArray(),medium:{outerRadiiM:[.085,.10,.09],scalpThicknessM:.004,skullThicknessM:.0065,fluidThicknessM:.002,
    materials:{water:{name:'Water coupling',soundSpeedMps:1500,densityKgM3:1000,attenuationDbCmAtMHz:0,attenuationPower:2},
      scalp:{name:'Scalp',soundSpeedMps:1540,densityKgM3:1050,attenuationDbCmAtMHz:.5,attenuationPower:1},
      skull:{name:'Skull',soundSpeedMps:2800,densityKgM3:1900,attenuationDbCmAtMHz:12,attenuationPower:1},
      fluid:{name:'CSF',soundSpeedMps:1500,densityKgM3:1000,attenuationDbCmAtMHz:.0022,attenuationPower:2},
      brain:{name:'Brain',soundSpeedMps:1560,densityKgM3:1040,attenuationDbCmAtMHz:1.2,attenuationPower:2}}},
  targetM:[.015,0,.015],acquisitions:8,noiseDb:-35,gridSize:96,fieldOfViewM:.12,
};}
export function isTargetValid(s:Scenario):boolean {
  const inset=s.medium.scalpThicknessM+s.medium.skullThicknessM+s.medium.fluidThicknessM;
  return s.targetM.every(Number.isFinite)&&s.targetM.reduce((a,v,i)=>a+(v/(s.medium.outerRadiiM[i]-inset))**2,0)<1;
}
export function moveElement(s:Scenario,id:number,azimuthRad:number,polarRad:number):Scenario {
  if(!Number.isFinite(azimuthRad)||!Number.isFinite(polarRad)||polarRad<0||polarRad>1.35)throw new Error('Invalid element angles');
  const next=structuredClone(s), e=next.array.elements.find(e=>e.id===id);if(!e)throw new Error('Unknown element');
  const u=rotate([Math.sin(polarRad)*Math.cos(azimuthRad),Math.sin(polarRad)*Math.sin(azimuthRad),Math.cos(polarRad)],s.array.rotationRad);
  e.position=u.map(v=>v*s.array.radiusM) as Vec3;e.normal=u.map(v=>-v) as Vec3;e.azimuthRad=azimuthRad;e.polarRad=polarRad;
  if(e.position.reduce((a,v,i)=>a+(v/(s.medium.outerRadiiM[i]+.005))**2,0)<=1)throw new Error('Element must clear head by 5 mm');
  if(next.array.elements.some(other=>other.id!==id&&Math.hypot(...e.position.map((v,i)=>v-other.position[i]))<.008))throw new Error('Elements must remain at least 8 mm apart');
  return next;
}

