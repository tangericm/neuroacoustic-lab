import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { gzipSync } from 'node:zlib';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { createServer } from 'vite';

const root=fileURLToPath(new URL('../',import.meta.url));
const sources=['src/core/types.ts','src/core/scenario.ts','src/core/physics.ts','src/core/imaging.ts','src/core/index.ts','src/demo/types.ts','src/demo/generate-fixtures.ts','scripts/generate-demo.mjs'];
const sourceHashes=Object.fromEntries(await Promise.all(sources.map(async p=>[p,createHash('sha256').update((await readFile(resolve(root,p),'utf8')).replace(/\r\n/g,'\n')).digest('hex')])));
const server=await createServer({root,server:{middlewareMode:true,watch:null},optimizeDeps:{noDiscovery:true,include:[]},appType:'custom'});
try {
  const {createFocusFixture,createImagingFixture,createDisplaySamplingReport}=await server.ssrLoadModule('/src/demo/generate-fixtures.ts');
  const {MODEL_VERSION}=await server.ssrLoadModule('/src/core/index.ts');
  const provenance={modelVersion:MODEL_VERSION,generatedUtc:new Date().toISOString(),seed:1729,sourceHashes,assumptions:['Source SHA-256 hashes use UTF-8 text with CRLF normalized to LF; binary asset hashes use original bytes.']};
  const start=performance.now(),focus=createFocusFixture(provenance),focusMs=performance.now()-start;
  const imageStart=performance.now(),imaging=createImagingFixture(provenance),imagingMs=performance.now()-imageStart;
  const dir=resolve(root,'public/demo');await mkdir(dir,{recursive:true});
  const frameBytes=Buffer.alloc(focus.frames.length*2);for(let i=0;i<focus.frames.length;i++)frameBytes.writeInt16LE(focus.frames[i],i*2);
  const rfBytes=Buffer.alloc(imaging.channels.samples.length*4);for(let i=0;i<imaging.channels.samples.length;i++)rfBytes.writeFloatLE(imaging.channels.samples[i],i*4);
  const sampling=createDisplaySamplingReport();
  const assets=[['focus-pressure.i16.gz',gzipSync(frameBytes,{level:9})],['imaging-rf.f32.gz',gzipSync(rfBytes,{level:9})],['focus.json',Buffer.from(JSON.stringify(focus.fixture))],['imaging.json',Buffer.from(JSON.stringify(imaging.fixture))],['display-sampling-report.json',Buffer.from(JSON.stringify(sampling,null,2)+'\n')]];
  const report={generatedUtc:provenance.generatedUtc,focusMs,imagingMs,saturatedSamples:focus.saturatedSamples,frameDecodedBytes:frameBytes.length,rfDecodedBytes:rfBytes.length,assets:assets.map(([name,bytes])=>({name,bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')}))};
  for(const [name,bytes] of assets)await writeFile(resolve(dir,name),bytes);
  await writeFile(resolve(dir,'generation-report.json'),JSON.stringify(report,null,2)+'\n');
  console.log(JSON.stringify(report,null,2));
} finally {await server.close();}
