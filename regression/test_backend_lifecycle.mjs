#!/usr/bin/env node
import assert from "node:assert/strict";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
import {resolve} from "node:path";
import {existsSync,readdirSync} from "node:fs";

const projectRoot=resolve(fileURLToPath(new URL("..",import.meta.url)));
const webRoot=resolve(projectRoot,process.env.LLVM_WEB_ROOT||"dist");
function resolveAsset(name){
  const exact=resolve(webRoot,name); if(existsSync(exact))return exact;
  const path=name.lastIndexOf('.');
  const stem=name.slice(0,path),suffix=name.slice(path);
  const match=readdirSync(webRoot).find(item=>item.startsWith(stem+'.')&&item.endsWith(suffix));
  if(!match)throw new Error(`Missing ${name} in ${webRoot}`);
  return resolve(webRoot,match);
}

globalThis.window=globalThis;
globalThis.fetch=async()=>({ok:true,json:async()=>({bundles:{mainstream:{js:'m.js',wasm:'m.wasm',factory:'M',families:['X86']}}})});
class FakeWorker {
  static instances=0;
  constructor(){this.initialized=false;FakeWorker.instances++;}
  postMessage(message){
    if(message.method==='initialize'){
      setTimeout(()=>{this.initialized=true;this.onmessage({data:{id:message.id,ok:true,result:{heapBytes:65536}}});},10);
      return;
    }
    queueMicrotask(()=>this.onmessage({data:this.initialized
      ?{id:message.id,ok:true,result:{heapBytes:65536}}
      :{id:message.id,ok:false,error:'Backend worker is not initialized'}}));
  }
  terminate(){this.terminated=true;}
}
globalThis.Worker=FakeWorker;
createRequire(import.meta.url)(resolveAsset("backend-manager.js"));

const manager=new LLVMBackendManager({idleMs:10});
await Promise.all([
  manager.acquire('mainstream','panel-1'),
  manager.request('mainstream','memory',{},'panel-2'),
]);
assert.equal(FakeWorker.instances,1);
assert.equal(manager.status()[0].refs,2);
manager.release('mainstream','panel-1');
manager.release('mainstream','panel-2');
assert.equal(manager.status()[0].idle,true);
await new Promise(resolve=>setTimeout(resolve,20));
assert.equal(manager.status().length,0);
console.log('Backend lifecycle tests passed');
