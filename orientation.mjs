import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
import { createTextDetector } from './orientation-text.mjs';
import { windowsEngineId, windowsFaceCapabilities, detectWindowsFaces, classifyLocalOrientation } from './orientation-windows.mjs';
const execute=promisify(execFile),root=path.dirname(fileURLToPath(import.meta.url));
let preparing;
export function classifyOrientation(candidates) {
  const unknown={angle:null,reliable:false,method:'unknown',reason:'没有足够明确的人脸或文字朝向，请手动确认。'};
  if(!Array.isArray(candidates)||candidates.length!==4)return unknown;
  const faces=[...candidates].sort((a,b)=>b.faceScore-a.faceScore),best=faces[0];
  if(best.faces>0&&best.faceWeight>=0.0015&&best.faceScore>=0.65&&best.faceScore-faces[1].faceScore>=0.25) return {angle:best.angle,reliable:true,method:'face',reason:'清晰人脸在这个方向更接近正立；请核对是否为刻意横躺或倾斜构图。'};
  const texts=[...candidates].sort((a,b)=>b.textScore-a.textScore),text=texts[0];
  if(text.textLines>=2&&text.textChars>=8&&text.textScore>=7&&text.textScore>=texts[1].textScore*1.6+3) {
    if(best.faces>0&&best.faceScore>=0.5&&best.angle!==text.angle)return {...unknown,reason:'人脸与文字给出的方向不一致，请手动确认。'};
    return {angle:text.angle,reliable:true,method:'text',reason:'多行文字在这个方向更容易识别；请核对背景文字是否代表整张照片的方向。'};
  }
  return best.faces>0?{...unknown,reason:'人脸朝向倾斜或不同人物方向不一致，请手动确认。'}:unknown;
}
async function detectMacOrientation(file,dataDir) {
  const bundled=path.join(root,'native',`orientation-${process.arch}`),cached=path.join(dataDir,'tools',`orientation-${process.arch}`);
  let binary=fs.existsSync(bundled)?bundled:cached;
  if(!fs.existsSync(binary)) {
    if(!preparing)preparing=(async()=>{fs.mkdirSync(path.dirname(cached),{recursive:true});await execute('/usr/bin/xcrun',['swiftc',path.join(root,'native','orientation.swift'),'-O','-module-cache-path',path.join(dataDir,'tools','swift-cache'),'-o',cached],{timeout:120000,maxBuffer:1024*1024});})().finally(()=>{preparing=null;});
    try{await preparing;}catch{throw new Error('本机识别引擎无法准备，请安装 Apple 命令行开发工具后重试。');}
    binary=cached;
  }
  let output;
  try{output=await execute(binary,[file],{timeout:60000,maxBuffer:1024*1024});}catch{throw new Error('本机视觉引擎未能读取这张照片，方向保持不变。');}
  const result=JSON.parse(output.stdout.trim());if(result.error)throw new Error('本机方向检测失败，方向保持不变。');
  return classifyOrientation(result.candidates);
}
export async function getOrientationCapabilities() {
  if(process.platform==='darwin')return {platform:process.platform,automaticOrientation:true,engineId:'apple-vision-v1',engineLabel:'Apple Vision · 人脸与文字',face:true,text:true};
  if(process.platform==='win32') {
    const {face}=await windowsFaceCapabilities();
    return {platform:process.platform,automaticOrientation:true,engineId:windowsEngineId,engineLabel:face?'Windows 人脸检测 + 离线中英文 OCR':'离线中英文 OCR · 系统人脸检测不可用',face,text:true};
  }
  return {platform:process.platform,automaticOrientation:false,engineId:'manual-v1',engineLabel:'手动方向核对',face:false,text:false};
}
// One OCR worker per roll, always released by the caller, including failed scans.
export function createOrientationDetector(dataDir) {
  const text=process.platform==='win32'?createTextDetector(dataDir):null;
  return {
    async detect(file) {
      if(process.platform==='darwin')return detectMacOrientation(file,dataDir);
      if(!text)return {angle:null,reliable:false,method:'manual',reason:'此平台暂不支持自动人脸与文字识别，请对照预览手动选择方向。'};
      const meta=await sharp(file).metadata();
      if(Math.min(meta.width||0,meta.height||0)<48)return {angle:null,reliable:false,method:'unknown',reason:'预览尺寸太小，无法可靠判断方向，请手动确认。'};
      const tools=path.join(dataDir,'tools');fs.mkdirSync(tools,{recursive:true});
      const normalized=path.join(tools,`orientation-${randomUUID()}.png`);
      try {
        // Both engines see the same EXIF-normalized pixels as the browser preview.
        await sharp(file).autoOrient().resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).png().toFile(normalized);
        const [faceResult,textResult]=await Promise.allSettled([detectWindowsFaces(normalized),text.analyze(normalized)]);
        if(textResult.status==='rejected')throw textResult.reason;
        const faces=faceResult.status==='fulfilled'?faceResult.value:{candidates:[],faceAvailable:false};
        const candidates=textResult.value.map(c=>({...c,...faces.candidates.find(f=>f.angle===c.angle)}));
        return classifyLocalOrientation(candidates,{faceAvailable:faces.faceAvailable});
      } finally {fs.rmSync(normalized,{force:true});}
    },
    async close(){await text?.close();}
  };
}
export async function detectOrientation(file,dataDir) {
  const detector=createOrientationDetector(dataDir);
  try{return await detector.detect(file);}finally{await detector.close();}
}
export function applyOrientationDecisions(roll,decisions,scanId) {
  if(!Array.isArray(decisions)||!decisions.length)throw new Error('请先勾选要调整的照片。');
  if(new Set(decisions.map(d=>d.photoId)).size!==decisions.length)throw new Error('照片选择重复。');
  const changes=decisions.map(d=>{
    const photo=roll.photos.find(p=>p.id===d.photoId);
    if(!photo||photo.orientationCheck?.scanId!==scanId)throw new Error('识别结果已变化，请重新检查。');
    if(![0,90,180,270].includes(d.rotation))throw new Error('旋转角度无效。');
    if((photo.rotation||0)!==d.expectedRotation||(photo.rotationRevision||0)!==d.expectedRevision)throw new Error('照片方向已被调整，请重新打开识别结果。');
    return {photo,rotation:d.rotation};
  }).filter(({photo,rotation})=>(photo.rotation||0)!==rotation);
  const undo=[];
  for(const {photo,rotation} of changes) {
    undo.push({id:photo.id,before:photo.rotation||0,source:photo.rotationSource||null,after:rotation,revision:(photo.rotationRevision||0)+1});
    photo.rotation=rotation;photo.rotationSource=photo.orientationCheck.reliable&&photo.orientationCheck.angle===rotation?'auto':'manual';photo.rotationRevision=(photo.rotationRevision||0)+1;
  }
  if(undo.length)roll.orientationUndo={changes:undo,appliedAt:new Date().toISOString()};
  return changes.length;
}
export function undoOrientationDecisions(roll) {
  if(!roll.orientationUndo)throw new Error('没有可撤销的方向调整。');
  let restored=0,skipped=0;
  for(const item of roll.orientationUndo.changes){const photo=roll.photos.find(p=>p.id===item.id);if(!photo||photo.rotation!==item.after||(photo.rotationRevision||0)!==item.revision){skipped++;continue;}photo.rotation=item.before;photo.rotationRevision++;if(item.source)photo.rotationSource=item.source;else delete photo.rotationSource;restored++;}
  delete roll.orientationUndo;return {restored,skipped};
}
