import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';

const isCopy=file=>/(?:\s*\(\d+\)|\s*[-–]?\s*(?:副本|copy)(?:\s*\(\d+\))?)$/i.test(path.basename(file,path.extname(file)));
function preferred(a,b) {
  const scan=file=>/\.(tiff?|bmp)$/i.test(file)?0:1;
  return scan(a)-scan(b)||Number(isCopy(a))-Number(isCopy(b))||a.localeCompare(b,'zh-CN',{numeric:true});
}
function digest(file,size,sampled) {
  const fd=fs.openSync(file,'r'),hash=createHash('sha256');
  try {
    if(sampled) {
      for(const at of new Set([0,Math.max(0,Math.floor(size/2)-32768),Math.max(0,size-65536)])) {
        const buffer=Buffer.alloc(Math.min(65536,size-at)),read=fs.readSync(fd,buffer,0,buffer.length,at);
        hash.update(buffer.subarray(0,read));
      }
    } else {
      const buffer=Buffer.alloc(1024*1024);let at=0;
      while(at<size){const read=fs.readSync(fd,buffer,0,Math.min(buffer.length,size-at),at);if(!read)throw new Error('文件在检查期间发生变化，请重试。');hash.update(buffer.subarray(0,read));at+=read;}
    }
    return hash.digest('hex');
  } finally {fs.closeSync(fd);}
}
export function findExactDuplicates(files) {
  const sizes=new Map();
  for(const file of new Set(files)){const size=fs.statSync(file).size;if(!sizes.has(size))sizes.set(size,[]);sizes.get(size).push(file);}
  const duplicates=[];
  for(const [size,candidates] of sizes) {
    if(candidates.length<2)continue;
    const samples=new Map();
    for(const file of candidates){const key=digest(file,size,true);if(!samples.has(key))samples.set(key,[]);samples.get(key).push(file);}
    for(const sample of samples.values()) {
      if(sample.length<2)continue;
      const originals=new Map();
      for(const file of sample.sort(preferred)) {
        // Sampling only narrows candidates; exclusion always requires a full hash.
        const sha256=digest(file,size,false),kept=originals.get(sha256);
        if(kept)duplicates.push({file,kept,sha256,bytes:size});else originals.set(sha256,file);
      }
    }
  }
  return duplicates;
}
