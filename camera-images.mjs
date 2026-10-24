import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
export const cameraImageLimit=8*1024*1024;
export async function saveCameraImage(bytes,dataDir) {
  if(!bytes.length||bytes.length>cameraImageLimit)throw new Error('相机照片请选择 8 MB 以内的 JPG、PNG 或 WebP。');
  let preview;
  try {
    const image=sharp(bytes,{limitInputPixels:40_000_000}),meta=await image.metadata();
    if(!['jpeg','png','webp'].includes(meta.format))throw new Error('Unsupported image');
    preview=await image.autoOrient().resize({width:1600,height:1200,fit:'inside',withoutEnlargement:true}).flatten({background:'#eeede8'}).jpeg({quality:88}).toBuffer();
  } catch {throw new Error('照片无法读取，请选择 JPG、PNG 或 WebP 图片。');}
  const dir=path.join(dataDir,'camera-images'),name=randomUUID()+'.jpg';
  fs.mkdirSync(dir,{recursive:true});await fs.promises.writeFile(path.join(dir,name),preview,{flag:'wx'});return name;
}
