import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
export const windowsEngineId='windows-face-ocr-v1';
let capabilityPromise;
function powershell(){return path.join(process.env.SystemRoot||'C:\\Windows','System32','WindowsPowerShell','v1.0','powershell.exe');}
async function native(args){const result=await execute(powershell(),['-NoProfile','-NonInteractive','-File',path.join(root,'native','orientation-windows.ps1'),...args],{timeout:45000,maxBuffer:1024*1024,windowsHide:true,encoding:'utf8'});const value=JSON.parse(result.stdout.trim().replace(/^\uFEFF/,''));if(value.error)throw new Error(value.error);return value;}
export async function windowsFaceCapabilities() {
  if(process.platform!=='win32')return {face:false};
  if(!capabilityPromise)capabilityPromise=native(['-Probe']).then(value=>({face:value.face===true})).catch(()=>({face:false}));
  return capabilityPromise;
}
export async function detectWindowsFaces(file) {
  if(!fs.existsSync(file))throw new Error('浏览预览不存在，请重新导入照片。');
  const capabilities=await windowsFaceCapabilities();
  if(!capabilities.face)return {candidates:[],faceAvailable:false};
  try{return {...await native(['-ImagePath',path.resolve(file)]),faceAvailable:true};}
  catch{return {candidates:[],faceAvailable:false};}
}

export function classifyLocalOrientation(candidates,{faceAvailable=false}={}) {
  const unknown={angle:null,reliable:false,method:'unknown',reason:'没有足够明确的人脸或文字朝向，请手动确认。'};
  if(!Array.isArray(candidates)||candidates.length!==4||new Set(candidates.map(c=>c.angle)).size!==4||!candidates.every(c=>[0,90,180,270].includes(c.angle)))return unknown;
  const faces=[...candidates].sort((a,b)=>(b.faceWeight||0)-(a.faceWeight||0)),bestFace=faces[0];
  const total=faces.reduce((n,c)=>n+(c.faceWeight||0),0),share=total?(bestFace.faceWeight||0)/total:0,runnerShare=total?(faces[1].faceWeight||0)/total:0;
  // FaceDetector has no confidence value: discard tiny isolated detections.
  const faceClear=faceAvailable&&bestFace.faces>0&&bestFace.faceWeight>=0.006&&(bestFace.faces>=2||bestFace.faceWeight>=0.012)&&share>=0.8&&share-runnerShare>=0.55;
  const texts=[...candidates].sort((a,b)=>(b.textScore||0)-(a.textScore||0)),bestText=texts[0];
  const textClear=bestText.textLines>=2&&bestText.textChars>=10&&bestText.textConfidence>=80&&bestText.textScore>=8&&bestText.textScore>=texts[1].textScore*1.8+4;
  const evidence={faceAvailable,faces:bestFace.faces||0,faceShare:Number(share.toFixed(3)),textLines:bestText.textLines||0,textChars:bestText.textChars||0,textConfidence:Number((bestText.textConfidence||0).toFixed(1))};
  if(textClear&&(faceClear||faceAvailable&&share>=0.6&&bestFace.faceWeight>=0.0015)&&bestFace.angle!==bestText.angle)return {...unknown,evidence,reason:'人脸与文字给出的方向不一致，请手动确认。'};
  if(faceClear)return {angle:bestFace.angle,reliable:true,method:'face',evidence,reason:'这个方向的人脸检出明显更稳定；请核对是否为刻意横躺或背景中的人像。'};
  if(textClear)return {angle:bestText.angle,reliable:true,method:'text',evidence,reason:'多行中英文文字在这个方向识别更清晰，置信度与其他方向差距明确；请核对文字是否代表整张照片的方向。'};
  return {...unknown,evidence,...(total?{reason:'不同方向的人脸证据接近或不足，请对照预览手动确认。'}:{})};
}
