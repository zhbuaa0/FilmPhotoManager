import {parentPort} from 'node:worker_threads';
import {analyseRedEye} from './red-eye-detector.mjs';
import {readCanonical,manualPupil,renderCorrection,sourceHash} from './red-eye-render.mjs';
parentPort.on('message',async({id,action,input})=>{
  try{
    let value;
    if(action==='analyse')value=await analyseRedEye(input.source,input.options);
    else if(action==='render')value=await renderCorrection(input.source,input.record,input.target,input.options);
    else if(action==='manual'){if(await sourceHash(input.source)!==input.record.sourceHash)throw new Error('原文件已改变，请重新检测。');value=manualPupil(await readCanonical(input.source),input.point);if(await sourceHash(input.source)!==input.record.sourceHash)throw new Error('点选时原文件发生变化，请重新检测。');}
    else throw new Error('无效的去红眼任务。');
    parentPort.postMessage({id,value});
  }catch(e){parentPort.postMessage({id,error:e.message});}
});
