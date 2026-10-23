import fs from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';
import { execFile } from 'node:child_process';
const execute = promisify(execFile);
export const natural = (a,b) => a.localeCompare(b,'zh-CN',{numeric:true});
const formats = new Set(['.tif','.tiff','.jpg','.jpeg','.png','.webp','.gif']);
export const mimeFor = file => ({'.tif':'image/tiff','.tiff':'image/tiff','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif'}[path.extname(file).toLowerCase()]);
function walk(folder) {
  const files=[];
  for(const entry of fs.readdirSync(folder,{withFileTypes:true})) {
    if(entry.name.startsWith('.')||entry.isSymbolicLink())continue;
    const file=path.join(folder,entry.name);
    if(entry.isDirectory())files.push(...walk(file)); else if(entry.isFile())files.push(file);
    if(files.length>10000)throw new Error('文件过多，请按年份或胶卷分别导入。');
  }
  return files.sort(natural);
}
function preservedFileName(file) {
  if(!/\.jpe?g$/i.test(file))return null;
  const fd=fs.openSync(file,'r'); const buffer=Buffer.alloc(Math.min(fs.statSync(file).size,1024*1024));
  try { fs.readSync(fd,buffer,0,buffer.length,0); } finally { fs.closeSync(fd); }
  const text=buffer.toString('utf8');
  const match=text.match(/(?:xmpMM:PreservedFileName|crs:RawFileName)\s*=\s*["']([^"']+)["']/)||text.match(/<(?:xmpMM:PreservedFileName|crs:RawFileName)>([^<]+)</);
  return match ? path.basename(match[1].replace(/&amp;/g,'&').replace(/&quot;/g,'"').replace(/&lt;/g,'<').replace(/&gt;/g,'>')) : null;
}
export function inspectFolder(input) {
  if(typeof input!=='string'||!input.trim())throw new Error('请填写本机文件夹路径。');
  const root=fs.realpathSync(input.trim()); if(!fs.statSync(root).isDirectory())throw new Error('请选择文件夹。');
  const immediate=fs.readdirSync(root,{withFileTypes:true});
  const hasImages=immediate.some(e=>e.isFile()&&formats.has(path.extname(e.name).toLowerCase()));
  const folders=hasImages?[root]:immediate.filter(e=>e.isDirectory()&&!e.name.startsWith('.')).map(e=>path.join(root,e.name)).sort(natural);
  const rolls=[];let ignored=0;
  for(const folder of folders) {
    const files=walk(folder), images=files.filter(f=>formats.has(path.extname(f).toLowerCase()));
    ignored+=files.filter(f=>!formats.has(path.extname(f).toLowerCase())).length;
    if(!images.length)continue;
    const originals=images.filter(f=>/\.tiff?$/i.test(f)), others=images.filter(f=>!/\.tiff?$/i.test(f));
    const frames=originals.map(file=>({key:file,variants:[{path:file,kind:'scan',match:'original'}]}));
    const byName=new Map();for(const frame of frames){const name=path.basename(frame.key).toLowerCase();if(!byName.has(name))byName.set(name,[]);byName.get(name).push(frame);}
    let paired=0;
    for(const file of others) {
      const preserved=preservedFileName(file);let candidates=preserved?byName.get(preserved.toLowerCase()):null;
      if(!candidates&& !preserved) { const stem=path.basename(file,path.extname(file)).toLowerCase();candidates=frames.filter(f=>path.basename(f.key,path.extname(f.key)).toLowerCase()===stem); }
      if(candidates?.length===1) { candidates[0].variants.push({path:file,kind:'finished',match:preserved?'xmp':'filename'});paired++; }
      else frames.push({key:file,variants:[{path:file,kind:'image',match:'standalone'}]});
    }
    frames.sort((a,b)=>natural(path.basename(a.key),path.basename(b.key)));
    const label=path.basename(folder), number=label.match(/^\d+/)?.[0]||label;
    rolls.push({folder,label,number,frames,paired,bytes:images.reduce((sum,f)=>sum+fs.statSync(f).size,0),tiffs:originals.length});
  }
  if(!rolls.length)throw new Error('这个文件夹里没有支持的照片。');
  return {root,rolls,ignored,frames:rolls.reduce((n,r)=>n+r.frames.length,0),versions:rolls.reduce((n,r)=>n+r.frames.reduce((sum,f)=>sum+f.variants.length,0),0),bytes:rolls.reduce((n,r)=>n+r.bytes,0)};
}
export async function makePreview(source, target, maxSize=1600,rotation=0) {
  if(process.platform!=='darwin')throw new Error('TIFF 和文件夹导入目前使用 macOS 的图像转换工具。');
  const info=await execute('/usr/bin/sips',['-g','pixelWidth','-g','pixelHeight',source],{timeout:10000,maxBuffer:1024*1024});
  const width=Number(info.stdout.match(/pixelWidth:\s*(\d+)/)?.[1]),height=Number(info.stdout.match(/pixelHeight:\s*(\d+)/)?.[1]);
  if(!width||!height)throw new Error('无法读取照片尺寸。');
  const args=['-s','format','jpeg','-s','formatOptions','88'];
  if(Math.max(width,height)>maxSize)args.push('-Z',String(maxSize));
  if(rotation)args.push('-r',String(rotation));
  const profile='/System/Library/ColorSync/Profiles/sRGB Profile.icc';if(fs.existsSync(profile))args.push('-m',profile);
  args.push(source,'--out',target);
  try { await execute('/usr/bin/sips',args,{timeout:45000,maxBuffer:1024*1024}); }
  catch {fs.rmSync(target,{force:true});throw new Error('照片无法解码，原文件未改动。');}
  if(!fs.existsSync(target)||fs.statSync(target).size<100)throw new Error('预览图生成失败。');
}
