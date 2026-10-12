import type { ComplexFrames } from './types';
export interface TemporalSvd {singularValues:number[];vectorsReal:Float64Array;vectorsImag:Float64Array;frames:number;residual:number}
/** Hermitian Jacobi eigendecomposition of XᴴX; vectors are column-major within a row-major matrix. */
export function decomposeTemporal(x:ComplexFrames):TemporalSvd {
  const n=x.frames,pixels=x.pixels,a=new Float64Array(n*n),b=new Float64Array(n*n),vr=new Float64Array(n*n),vi=new Float64Array(n*n);
  for(let t=0;t<n;t++){vr[t*n+t]=1;for(let u=t;u<n;u++){let re=0,im=0;for(let p=0;p<pixels;p++){const i=t*pixels+p,j=u*pixels+p;re+=x.real[i]*x.real[j]+x.imag[i]*x.imag[j];im+=x.real[i]*x.imag[j]-x.imag[i]*x.real[j];}a[t*n+u]=a[u*n+t]=re;b[t*n+u]=im;b[u*n+t]=-im;}}
  const scale=Math.max(...Array.from({length:n},(_,i)=>a[i*n+i]));let residual=0;
  if(scale===0)return {singularValues:Array(n).fill(0),vectorsReal:vr,vectorsImag:vi,frames:n,residual:0};
  for(let sweep=0;sweep<60;sweep++){
    residual=0;for(let p=0;p<n;p++)for(let q=p+1;q<n;q++){
      const pq=p*n+q,off=Math.hypot(a[pq],b[pq]);residual=Math.max(residual,off/scale);if(off<=scale*1e-13)continue;
      const phaseR=a[pq]/off,phaseI=b[pq]/off,app=a[p*n+p],aqq=a[q*n+q],tau=(aqq-app)/(2*off),t=(tau>=0?1:-1)/(Math.abs(tau)+Math.hypot(1,tau)),c=1/Math.hypot(1,t),s=t*c;
      for(let k=0;k<n;k++)if(k!==p&&k!==q){
        const kp=k*n+p,kq=k*n+q,pr=a[kp],pi=b[kp],qr=a[kq],qi=b[kq];
        a[kp]=c*pr-s*(phaseR*qr+phaseI*qi);b[kp]=c*pi-s*(phaseR*qi-phaseI*qr);
        a[kq]=s*(phaseR*pr-phaseI*pi)+c*qr;b[kq]=s*(phaseR*pi+phaseI*pr)+c*qi;
        a[p*n+k]=a[kp];b[p*n+k]=-b[kp];a[q*n+k]=a[kq];b[q*n+k]=-b[kq];
      }
      a[p*n+p]=c*c*app+s*s*aqq-2*c*s*off;a[q*n+q]=s*s*app+c*c*aqq+2*c*s*off;a[pq]=a[q*n+p]=b[pq]=b[q*n+p]=0;
      for(let k=0;k<n;k++){
        const kp=k*n+p,kq=k*n+q,pr=vr[kp],pi=vi[kp],qr=vr[kq],qi=vi[kq];
        vr[kp]=c*pr-s*(phaseR*qr+phaseI*qi);vi[kp]=c*pi-s*(phaseR*qi-phaseI*qr);
        vr[kq]=s*(phaseR*pr-phaseI*pi)+c*qr;vi[kq]=s*(phaseR*pi+phaseI*pr)+c*qi;
      }
    }
    if(residual<1e-12)break;
  }
  if(residual>1e-9)throw new Error('Temporal Gram eigensolver did not converge');
  const order=Array.from({length:n},(_,i)=>i).sort((i,j)=>a[j*n+j]-a[i*n+i]),vectorsReal=new Float64Array(n*n),vectorsImag=new Float64Array(n*n);
  for(let k=0;k<n;k++)for(let t=0;t<n;t++){vectorsReal[t*n+k]=vr[t*n+order[k]];vectorsImag[t*n+k]=vi[t*n+order[k]];}
  return {singularValues:order.map(i=>Math.sqrt(Math.max(0,a[i*n+i]))),vectorsReal,vectorsImag,frames:n,residual};
}
export function filterTemporalSubspace(
  x: ComplexFrames, svd: TemporalSvd, rank: number,
): ComplexFrames {
  if (x.frames !== svd.frames || !Number.isInteger(rank) || rank < 0 || rank > x.frames) {
    throw new Error('Invalid temporal projection');
  }
  const frames = x.frames, real = x.real.slice(), imag = x.imag.slice();
  for (let pixel = 0; pixel < x.pixels; pixel++) for (let mode = 0; mode < rank; mode++) {
    // Project this pixel's complex time series onto a learned temporal mode: X v.
    let coefficientReal = 0, coefficientImag = 0;
    for (let time = 0; time < frames; time++) {
      const sample = time * x.pixels + pixel, vector = time * frames + mode;
      coefficientReal += x.real[sample] * svd.vectorsReal[vector]
        - x.imag[sample] * svd.vectorsImag[vector];
      coefficientImag += x.real[sample] * svd.vectorsImag[vector]
        + x.imag[sample] * svd.vectorsReal[vector];
    }
    // Subtract the mode contribution using the conjugate vector: X v vᴴ.
    for (let time = 0; time < frames; time++) {
      const sample = time * x.pixels + pixel, vector = time * frames + mode;
      real[sample] -= coefficientReal * svd.vectorsReal[vector]
        + coefficientImag * svd.vectorsImag[vector];
      imag[sample] -= coefficientImag * svd.vectorsReal[vector]
        - coefficientReal * svd.vectorsImag[vector];
    }
  }
  return { frames: x.frames, pixels: x.pixels, real, imag };
}
export function powerMap(x:ComplexFrames):Float64Array{
  const out=new Float64Array(x.pixels);for(let t=0;t<x.frames;t++)for(let p=0;p<x.pixels;p++){const i=t*x.pixels+p;out[p]+=(x.real[i]**2+x.imag[i]**2)/x.frames;}return out;
}
export function lagOneDoppler(
  x: ComplexFrames, c: number, f0: number, dt: number,
  powerThreshold: number, coherenceThreshold: number,
) {
  const power = powerMap(x);
  const velocityMps: number[] = [], coherence: number[] = [], valid: number[] = [];
  for (let pixel = 0; pixel < x.pixels; pixel++) {
    let correlationReal = 0, correlationImag = 0, previousEnergy = 0, nextEnergy = 0;
    for (let time = 0; time < x.frames - 1; time++) {
      const previous = time * x.pixels + pixel, next = previous + x.pixels;
      correlationReal += x.real[next] * x.real[previous] + x.imag[next] * x.imag[previous];
      correlationImag += x.imag[next] * x.real[previous] - x.real[next] * x.imag[previous];
      previousEnergy += x.real[previous] ** 2 + x.imag[previous] ** 2;
      nextEnergy += x.real[next] ** 2 + x.imag[next] ** 2;
    }
    const rho = previousEnergy > 0 && nextEnergy > 0
      ? Math.min(1, Math.hypot(correlationReal, correlationImag) / Math.sqrt(previousEnergy * nextEnergy))
      : 0;
    const phase = Math.atan2(correlationImag, correlationReal);
    velocityMps.push(phase * c / (4 * Math.PI * f0 * dt));
    coherence.push(rho);
    valid.push(power[pixel] > powerThreshold && rho >= coherenceThreshold ? 1 : 0);
  }
  return { velocityMps, coherence, valid };
}
