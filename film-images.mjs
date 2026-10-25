import fs from 'node:fs';
import path from 'node:path';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {filmStocks} from './public/film-stocks.mjs';
const pending=new Map(),waiting=[];let active=0;
async function imageBytes(url) {
  let error;
  for(let attempt=0;attempt<2;attempt++)try {
    const response=await fetch(url,{signal:AbortSignal.timeout(20000),redirect:'error',headers:{'User-Agent':'FilmPhotoManager (local product reference preview)'}});
    if(!response.ok)throw new Error('参考图暂时无法下载。');
    const chunks=[];let size=0;
    for await(const chunk of response.body){size+=chunk.length;if(size>10*1024*1024)throw new Error('参考图超过大小限制。');chunks.push(chunk);}
    return Buffer.concat(chunks);
  } catch(cause){error=cause;if(!attempt)await new Promise(resolve=>setTimeout(resolve,300));}
  throw error;
}
async function download(stock,dataDir,directory) {
  if(active>=4)await new Promise(resolve=>waiting.push(resolve));else active++;
  const dir=path.join(dataDir,directory),target=path.join(dir,`${stock.id}-v${stock.imageVersion||1}.jpg`),temp=target+'.'+randomUUID()+'.tmp';
  try {
    const input=await imageBytes(stock.imageUrl);
    const photograph=directory==='canister-images';
    const bytes=await sharp(input,{limitInputPixels:45_000_000}).autoOrient().resize({width:700,height:700,fit:'inside',withoutEnlargement:true}).flatten({background:photograph?'#ffffff':'#eeede8'}).jpeg({quality:photograph?90:85}).toBuffer();
    fs.mkdirSync(dir,{recursive:true});await fs.promises.writeFile(temp,bytes,{flag:'wx'});await fs.promises.rename(temp,target);return target;
  } finally {fs.rmSync(temp,{force:true});const next=waiting.shift();if(next)next();else active--;}
}
export async function ensureReferenceImage(id,dataDir,references,directory) {
  const stock=references.find(f=>f.id===id);if(!stock)throw new Error('胶卷型号不存在。');
  const target=path.join(dataDir,directory,`${stock.id}-v${stock.imageVersion||1}.jpg`);
  if(fs.existsSync(target))return target;
  const key=path.resolve(target);
  if(!pending.has(key))pending.set(key,download(stock,dataDir,directory).finally(()=>pending.delete(key)));
  return pending.get(key);
}
export const ensureFilmImage=(id,dataDir)=>ensureReferenceImage(id,dataDir,filmStocks,'film-images');
