/// <reference lib="webworker" />
import { simulate, optimizePlacement } from '../core';
import type { WorkerRequest, WorkerResponse } from '../core/types';
const ctx=self as unknown as DedicatedWorkerGlobalScope;
let generation=0;
function buffers(value:unknown,seen=new Set<ArrayBuffer>()):ArrayBuffer[]{
  if(ArrayBuffer.isView(value)){if(value.buffer instanceof ArrayBuffer)seen.add(value.buffer);}
  else if(value&&typeof value==='object')for(const v of Object.values(value))buffers(v,seen);
  return [...seen];
}
ctx.onmessage=async(event:MessageEvent<WorkerRequest>)=>{
  const {id,scenario,type}=event.data,myGeneration=++generation;
  try{
    if(type==='simulate'){
      const result=simulate(scenario);if(myGeneration!==generation)return;
      ctx.postMessage({type:'result',id,result} satisfies WorkerResponse,buffers(result));
    }else{
      const result=await optimizePlacement(scenario,(completed,total)=>{
        if(myGeneration!==generation)throw new Error('Superseded');ctx.postMessage({type:'progress',id,completed,total} satisfies WorkerResponse);
      });
      if(myGeneration===generation)ctx.postMessage({type:'optimized',id,result} satisfies WorkerResponse);
    }
  }catch(error){if(myGeneration===generation)ctx.postMessage({type:'error',id,message:error instanceof Error?error.message:String(error)} satisfies WorkerResponse);}
};
