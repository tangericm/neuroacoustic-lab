import {createHash} from 'node:crypto';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {gzipSync} from 'node:zlib';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
import {createServer} from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const sources=['src/core/flow/types.ts','src/core/flow/acquisition.ts','src/core/flow/processing.ts','src/core/flow/motion.ts','src/core/imaging.ts','src/core/physics.ts','src/core/scenario.ts','src/core/types.ts','src/demo/generate-flow-fixture.ts','scripts/generate-flow.mjs','reference/flow_oracle.py'];
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async path=>[path,createHash('sha256').update((await readFile(resolve(root,path),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const server=await createServer({root,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try{
  const {generateFlowCase,flowFixture}=await server.ssrLoadModule('/src/demo/generate-flow-fixture.ts');
  const result=generateFlowCase();
  const provenance={modelVersion:'homogeneous-temporal-scatterers-v1',generatedUtc:new Date().toISOString(),sourceHashes,referenceUrl:'/demo/flow-validation.json',assumptions:[
    'Original procedural phantom; prescribed trajectories, not anatomy or fluid dynamics. Network branches are independent scatterer streams with wrapping; no conservation or vessel-wall mechanics claim.',
    '97-square image over 40 mm, 32 frames separated by 2 ms, 32 linear 0.6 mm-diameter pistons at 0.75 mm pitch, one central individual transmitter; no transmit compounding.',
    'Homogeneous scalar straight paths at 1560 m/s. The Gaussian carrier has f₀=1 MHz and σ=0.7/f₀=0.7 µs, giving amplitude-spectrum FWHM ≈536 kHz. Piston directivity and brain-like attenuation use a center-frequency approximation. No refraction, multiple scattering or full-wave solver.',
    'Scatterers are stationary during each echo acquisition. Tissue shifts by 0.43 mm over 62 ms; blood travels at prescribed centerline speeds, with ±40 mm/s in calibration tubes.',
    'Tissue and blood amplitudes are seeded, blood amplitudes are one tenth as large. Gaussian receiver noise has independent per-frame seeds and fixed RMS 0.002 times the maximum noiseless channel amplitude across the ensemble.',
    'Fast-time sampling is 8 MHz with a fixed origin and 1024 samples. Complex phase is preserved across frames; physical slow time differs from browser playback time.',
    'Rank two was chosen in the disclosed earlier exploratory tube probe and frozen before the held-out seed/noise/translation cases saved in the validation report.',
    'Tissue/blood oracle components and geometry masks are evaluation only; neither supplies the estimated image, SVD projector, velocity validity mask or motion validity mask.',
    'Power comparisons share the unfiltered peak and -40 dB display floor; values below the floor are clipped only for display. B-mode cine uses one ensemble envelope peak and -55 dB floor. No per-frame normalization.',
    'Positive axial velocity and displacement point toward the probe (+z). Phase velocity is a near-axis estimate, not full vector speed; invalid pixels are masked.',
    'Source SHA-256 uses UTF-8 text with CRLF normalized to LF; binary hashes use raw bytes. Saved float32 references are compared with independent NumPy float64 calculations.'
  ],sources:[
    {title:'Demené et al. (2015), spatiotemporal SVD clutter filtering',url:'https://pubmed.ncbi.nlm.nih.gov/25955583/'},
    {title:'Kasai et al. (1988), complex autocorrelation flow imaging',url:'https://onlinelibrary.wiley.com/doi/10.1002/scj.4690191102'},
    {title:'Mirzaei et al., normalized cross-correlation displacement estimation',url:'https://arxiv.org/abs/1804.05305'},
    {title:'Field II, moving-scatterer flow example',url:'https://www.field-ii.dk/examples/flow_example/flow_example.html'}
  ]};
  const fixture=flowFixture(result,provenance);
  const output=resolve(root,'public/demo'),reference=resolve(root,'reference');await mkdir(output,{recursive:true});
  const floatBytes=values=>{const bytes=Buffer.alloc(values.length*4);for(let i=0;i<values.length;i++)bytes.writeFloatLE(values[i],i*4);return bytes;};
  const complexBytes=x=>{const bytes=Buffer.alloc(x.real.length*8);for(let i=0;i<x.real.length;i++){bytes.writeFloatLE(x.real[i],i*8);bytes.writeFloatLE(x.imag[i],i*8+4);}return bytes;};
  const archives=[['flow_rf.f32.gz',gzipSync(floatBytes(result.acquisition.mixed),{level:9})],['flow_iq.f32.gz',gzipSync(complexBytes(result.iq),{level:9})],['flow_filtered.f32.gz',gzipSync(complexBytes(result.filtered),{level:9})]];
  for(const [name,bytes] of archives)await writeFile(resolve(reference,name),bytes);
  const manifest={version:1,config:result.config,sourceHashes,encoding:'little-endian float32; RF frame/receiver/sample; complex frame/pixel/interleaved real-imag',powerThreshold:result.powerThreshold,coherenceThreshold:result.coherenceThreshold,afterPower:Array.from(result.after),velocityMps:result.flow.velocityMps,valid:result.flow.valid,singularValues:result.svd.singularValues,archives:archives.map(([name,bytes])=>({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}))};
  await writeFile(resolve(reference,'flow_manifest.json'),JSON.stringify(manifest));
  const oracle=JSON.parse(execFileSync('python',[resolve(reference,'flow_oracle.py'),'--check'],{cwd:root,encoding:'utf8'}));
  const cases=[{name:'fixed-network-main',config:result.config,metrics:result.validation,timingsMs:result.timingsMs}];
  for(const variation of [{name:'held-out-seed-and-translation',seed:2027,tissueDisplacementM:.00037,noiseRmsRelative:.002},{name:'held-out-noise-and-negative-shift',seed:811,tissueDisplacementM:-.00029,noiseRmsRelative:.01},{name:'slow-flow-failure-probe',seed:2027,bloodSpeedMps:.002}]){
    const {name,...override}=variation,r=generateFlowCase({...result.config,...override});cases.push({name,config:r.config,metrics:r.validation,timingsMs:r.timingsMs});
  }
  const validation={version:1,generatedUtc:provenance.generatedUtc,sourceHashes,rankFrozen:2,oracle,cases,limits:'Fixed model/geometry; three extra cases are sensitivity checks, not population accuracy. Slow-flow case is intentionally retained even if blood suppression or coverage degrades. Motion masks are computed from images; truth masks only define evaluation.',archives:manifest.archives};
  const json=JSON.stringify(fixture),validationJson=JSON.stringify(validation,null,2)+'\n';
  await writeFile(resolve(output,'flow.json'),json);await writeFile(resolve(output,'flow-validation.json'),validationJson);
  console.log(JSON.stringify({fixtureBytes:Buffer.byteLength(json),fixtureGzipBytes:gzipSync(json).length,validationBytes:Buffer.byteLength(validationJson),oracle,main:result.validation,cases:cases.map(c=>({name:c.name,tubeCoverage:c.metrics.tubeCoverage,bloodRetentionDb:c.metrics.bloodRetentionDb,motionMedianAbsoluteErrorM:c.metrics.motionMedianAbsoluteErrorM})),archives:manifest.archives},null,2));
}finally{await server.close();}
