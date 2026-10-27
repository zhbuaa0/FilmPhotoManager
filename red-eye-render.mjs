import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {openImage} from './image-preview.mjs';
import {correctPixels,findPupil,validateRegions} from './red-eye-mask.mjs';
import {attachTiffProfile} from './tiff-profile.mjs';
import {redEyeDetectionVersion} from './public/red-eye-version.mjs';
export const redEyeEngine=redEyeDetectionVersion;
let srgbProfile;
async function defaultProfile(){srgbProfile??=sharp({create:{width:1,height:1,channels:3,background:'#fff'}}).withIccProfile('srgb').png().toBuffer().then(b=>sharp(b).metadata()).then(m=>m.icc);return srgbProfile;}
export async function sourceHash(file){const hash=createHash('sha256');for await(const chunk of fs.createReadStream(file))hash.update(chunk);return hash.digest('hex');}
export async function readCanonical(file){
  const image=await openImage(file),meta=await image.metadata();
  if(meta.space==='cmyk')throw new Error('这个版本是 CMYK，请先转换为 RGB 成片再去红眼。');
  if(!['uchar','ushort'].includes(meta.depth))throw new Error('去红眼目前支持 8-bit / 16-bit 照片，请先转换这个扫描格式。');
  if(meta.width*meta.height>80_000_000)throw new Error('照片超过去红眼处理的 8000 万像素上限。');
  const depth=meta.depth==='ushort'?16:8;
  const {data,info}=await image.keepIccProfile().autoOrient().flatten({background:'#fff'}).removeAlpha().toColourspace(depth===16?'rgb16':'srgb').raw({depth:depth===16?'ushort':'uchar'}).toBuffer({resolveWithObject:true});
  const pixels=depth===16?new Uint16Array(data.buffer,data.byteOffset,data.length/2):data;
  return {pixels,width:info.width,height:info.height,depth,density:meta.density||72,icc:meta.channels>=3&&meta.icc?meta.icc:await defaultProfile(),source:file,colourInterpretation:meta.icc?'embedded-icc':'assumed-srgb'};
}
export function eightBit(image){if(image.depth===8)return image.pixels;return Uint8Array.from(image.pixels,n=>Math.round(n/257));}
export function manualPupil(image,{x,y,radius}){
  if(![x,y,radius].every(Number.isFinite)||x<0||x>1||y<0||y>1||radius<.001||radius>.1)throw new Error('请在照片内点选瞳孔，并使用有效范围。');
  const candidate=findPupil(eightBit(image),image.width,image.height,{x:x*image.width,y:y*image.height,radius:radius*Math.min(image.width,image.height),manual:true});
  if(!candidate)throw new Error('这个范围没有找到明显红色瞳孔，请靠近红点或调整范围后重试。');
  return candidate;
}
export async function renderCorrection(source,record,target,{rotation=0,preview=false,cropIndex=-1,before=false}={}){
  if(path.resolve(source)===path.resolve(target))throw new Error('修正版必须保存到独立文件，原文件未改动。');
  if(![0,90,180,270].includes(rotation))throw new Error('无效旋转角度。');
  if(await sourceHash(source)!==record.sourceHash)throw new Error('原文件已改变，请重新检测红眼。');
  const image=await readCanonical(source);if(image.width!==record.width||image.height!==record.height)throw new Error('原文件尺寸已改变，请重新检测。');
  if(await sourceHash(source)!==record.sourceHash)throw new Error('解码时原文件已改变，请重新检测。');
  if(!before)correctPixels(image.pixels,image.width,image.height,validateRegions(record.regions),image.depth);
  let result=sharp(image.pixels,{raw:{width:image.width,height:image.height,channels:3}}).toColourspace(image.depth===16?'rgb16':'srgb');
  if(cropIndex>=0){const r=record.regions[cropIndex];if(!r)throw new Error('眼部选区不存在。');const left=Math.max(0,Math.floor((r.x-r.rx*3)*image.width)),top=Math.max(0,Math.floor((r.y-r.ry*3)*image.height)),right=Math.min(image.width,Math.ceil((r.x+r.rx*3)*image.width)),bottom=Math.min(image.height,Math.ceil((r.y+r.ry*3)*image.height));result=result.extract({left,top,width:Math.max(1,right-left),height:Math.max(1,bottom-top)});}
  result=result.rotate(rotation).withExif({IFD0:{Orientation:'1'}});
  if(preview)result=result.resize({width:preview,height:preview,fit:'inside',withoutEnlargement:true});
  const tiff=preview?target+'.rgb.tif':target;
  try{
    await result.toColourspace(image.depth===16?'rgb16':'srgb').tiff({compression:'deflate',xres:image.density/25.4,yres:image.density/25.4}).toFile(tiff);
    await attachTiffProfile(tiff,image.icc);
    if(preview)await sharp(tiff).withIccProfile('srgb').toColourspace('srgb').jpeg({quality:92}).toFile(target);
  }finally{if(preview)await fs.promises.rm(tiff,{force:true});}
  return {width:image.width,height:image.height,depth:image.depth};
}
