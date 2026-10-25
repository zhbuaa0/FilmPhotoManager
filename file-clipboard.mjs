import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import {fileURLToPath} from 'node:url';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
const run=promisify(execFile);
const script=fileURLToPath(new URL('./native/copy-files.ps1',import.meta.url));
const versions=p=>p.versions?.length?p.versions:[p];
export async function planFileCopy(roll,ids,preference,dataDir){
  if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length)throw new Error('请选择要复制的照片。');
  if(!['finished','scan'].includes(preference))throw new Error('请选择有效的显示版本。');
  const wanted=new Set(ids),photos=roll.photos.filter(p=>wanted.has(p.id));
  if(photos.length!==ids.length)throw new Error('选中的照片已变更，请刷新后重新选择。');
  return Promise.all(photos.map(async photo=>{
    const list=versions(photo),version=list.find(v=>v.kind===preference)||list[0];
    const source=version.source||(version.file?path.join(dataDir,'photos',version.file):null);
    if(!source)throw new Error(`找不到原文件：${photo.name}`);
    try{if(!(await fs.stat(source)).isFile())throw new Error();}catch{throw new Error(`原文件不可用：${version.name||photo.name}。请检查原目录或移动硬盘。`);}
    return {source:path.resolve(source),name:version.name||photo.name||path.basename(source),owned:!version.source};
  }));
}
function safeName(name){let clean=path.win32.basename(name).replace(/[<>:"/\\|?*\x00-\x1f]/g,'-').replace(/[. ]+$/,'');if(!clean)clean='photo';if(/^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i.test(clean))clean='_'+clean;return clean;}
export async function prepareFileDrop(files,dataDir){
  let stage;const used=new Set();const paths=[];
  for(const file of files){
    // Referenced originals already have their real filename. Uploaded files have UUID storage names.
    if(!file.owned){paths.push(file.source);continue;}
    if(!stage){const cache=path.join(dataDir,'clipboard');await fs.mkdir(cache,{recursive:true});stage=await fs.mkdtemp(path.join(cache,'copy-'));}
    let name=safeName(file.name),candidate=name,index=2;const ext=path.extname(name),stem=name.slice(0,name.length-ext.length);
    while(used.has(candidate.toLocaleLowerCase()))candidate=`${stem} (${index++})${ext}`;
    used.add(candidate.toLocaleLowerCase());const target=path.join(stage,candidate);
    try{await fs.link(file.source,target);}catch{await fs.copyFile(file.source,target);}
    paths.push(target);
  }
  return paths;
}
export async function copyOriginalFiles(roll,ids,preference,dataDir,{platform=process.platform,execute=run}={}){
  if(platform!=='win32')throw new Error('文件复制到系统剪贴板目前支持 Windows；其他平台可在放大窗口下载原文件。');
  const files=await planFileCopy(roll,ids,preference,dataDir),paths=await prepareFileDrop(files,dataDir);
  const temp=await fs.mkdtemp(path.join(os.tmpdir(),'lightbox-clipboard-')),manifest=path.join(temp,'files.json');
  try{
    await fs.writeFile(manifest,JSON.stringify(paths),'utf8');
    try{await execute('powershell.exe',['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',script,'-Manifest',manifest],{windowsHide:true,timeout:30000,maxBuffer:64*1024});}
    catch{throw new Error('未能写入 Windows 文件剪贴板，请关闭正在占用剪贴板的程序后重试。');}
    return {count:paths.length};
  }finally{await fs.rm(temp,{recursive:true,force:true});}
}
