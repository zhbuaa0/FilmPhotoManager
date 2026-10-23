import fs from 'node:fs';
import path from 'node:path';
import { makePreview } from './image-preview.mjs';
export { makePreview };
export const natural = (a,b) => a.localeCompare(b,'zh-CN',{numeric:true});
const formats = new Set(['.tif','.tiff','.bmp','.jpg','.jpeg','.png','.webp','.gif']);
const isScan = file => /\.(tiff?|bmp)$/i.test(file);
export const mimeFor = file => ({'.tif':'image/tiff','.tiff':'image/tiff','.bmp':'image/bmp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp','.gif':'image/gif'}[path.extname(file).toLowerCase()]);
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
function csvRows(text) {
  const rows=[];let row=[],value='',quoted=false;
  for(let i=0;i<text.length;i++) {
    const c=text[i];
    if(c==='"'){if(quoted&&text[i+1]==='"'){value+='"';i++;}else quoted=!quoted;}
    else if(!quoted&&(c===','||c==='\n')){row.push(value.replace(/\r$/,''));value='';if(c==='\n'){rows.push(row);row=[];}}
    else value+=c;
  }
  if(value||row.length){row.push(value.replace(/\r$/,''));rows.push(row);}
  return rows;
}
function rollInfo(folder,indexRows) {
  const label=path.basename(folder),dated=label.match(/^(\d{4}[.-]\d{2}[.-]\d{2})_(.+)$/);
  const identifiers=(dated?.[2]||label).split('_'),number=identifiers[0];
  const rows=indexRows.filter(row=>row[1]===number),entry=rows.length===1?rows[0]:null;
  const notes=['编号来自文件夹名称，可修改为实物胶卷编号。'];
  if(dated)notes.push(`目录日期：${dated[1]}（未自动作为拍摄或冲洗日期）。`);
  if(identifiers.length>1)notes.push(`二级编号：${identifiers.slice(1).join('_')}`);
  if(entry?.[0]&&entry[0]!==dated?.[1])notes.push(`索引日期：${entry[0]}（与目录分别保留）。`);
  if(entry?.[2]&&!identifiers.slice(1).includes(entry[2]))notes.push(`索引二级编号：${entry[2]}`);
  if(entry?.[3])notes.push(`索引备注：${entry[3]}`);
  return {label,number,notes:notes.join('\n')};
}
export function inspectFolder(input, { includeAggregates=false }={}) {
  if(typeof input!=='string'||!input.trim())throw new Error('请填写本机文件夹路径。');
  const root=fs.realpathSync(input.trim().replace(/^"(.*)"$/,'$1')); if(!fs.statSync(root).isDirectory())throw new Error('请选择文件夹。');
  const immediate=fs.readdirSync(root,{withFileTypes:true});
  const hasImages=immediate.some(e=>e.isFile()&&formats.has(path.extname(e.name).toLowerCase()));
  const children=immediate.filter(e=>e.isDirectory()&&!e.name.startsWith('.')&&(includeAggregates||e.name!=='汇总文件夹'));
  const multiple=children.some(e=>/^(?:\d{4}[.-]\d{2}[.-]\d{2}_|\d{4,}$)/.test(e.name));
  const folders=hasImages&&!multiple?[root]:children.map(e=>path.join(root,e.name)).sort(natural);
  const warnings=[];
  if(!includeAggregates&&immediate.some(e=>e.isDirectory()&&e.name==='汇总文件夹'))warnings.push('已跳过“汇总文件夹”，避免与逐卷原图重复导入；可勾选包含汇总目录。');
  if(hasImages&&multiple)warnings.push('已按胶卷子目录拆卷，根目录散图/拼图未导入；需要时可单独上传。');
  const indexFile=path.join(root,'film_index.csv');
  const indexRows=fs.existsSync(indexFile)?csvRows(fs.readFileSync(indexFile,'utf8').replace(/^\uFEFF/,'')):[];
  const rolls=[];let ignored=folders.includes(root)?0:immediate.filter(e=>e.isFile()).length;
  for(const folder of folders) {
    const files=walk(folder), images=files.filter(f=>formats.has(path.extname(f).toLowerCase()));
    ignored+=files.filter(f=>!formats.has(path.extname(f).toLowerCase())).length;
    if(!images.length)continue;
    const originals=images.filter(isScan), others=images.filter(f=>!isScan(f));
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
    rolls.push({folder,...rollInfo(folder,indexRows),frames,paired,bytes:images.reduce((sum,f)=>sum+fs.statSync(f).size,0),tiffs:originals.filter(f=>/\.tiff?$/i.test(f)).length});
  }
  if(!rolls.length)throw new Error('这个文件夹里没有支持的照片。');
  // Renamed scan files retain their original basename after the directory prefix.
  // Only a unique XMP match may move an edit from another folder into a roll.
  const scans=new Map();
  for(const roll of rolls)for(const frame of roll.frames.filter(f=>isScan(f.key))) {
    const full=path.basename(frame.key),prefix=roll.label+'_';
    for(const name of new Set([full,full.startsWith(prefix)?full.slice(prefix.length):full])) {
      const key=name.toLowerCase();if(!scans.has(key))scans.set(key,[]);scans.get(key).push({roll,frame});
    }
  }
  for(const roll of rolls)for(const frame of [...roll.frames]) {
    if(frame.variants.length!==1||isScan(frame.key))continue;
    const preserved=preservedFileName(frame.key),matches=preserved?scans.get(preserved.toLowerCase()):null;
    if(matches?.length!==1)continue;
    const target=matches[0],variant=frame.variants[0];
    target.frame.variants.push({...variant,kind:'finished',match:'xmp'});target.roll.paired++;
    roll.frames.splice(roll.frames.indexOf(frame),1);
    if(roll!==target.roll){const bytes=fs.statSync(variant.path).size;roll.bytes-=bytes;target.roll.bytes+=bytes;}
  }
  const nonempty=rolls.filter(r=>r.frames.length);
  const numbers=new Set();for(const roll of nonempty){if(numbers.has(roll.number))throw new Error(`多个目录使用同一胶卷编号 ${roll.number}，请分别导入或调整目录名称。`);numbers.add(roll.number);}
  return {root,rolls:nonempty,ignored,warnings,frames:nonempty.reduce((n,r)=>n+r.frames.length,0),versions:nonempty.reduce((n,r)=>n+r.frames.reduce((sum,f)=>sum+f.variants.length,0),0),bytes:nonempty.reduce((n,r)=>n+r.bytes,0)};
}
