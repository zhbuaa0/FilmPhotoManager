import fs from 'node:fs';
import path from 'node:path';
import {randomUUID,createHash} from 'node:crypto';
import {Worker} from 'node:worker_threads';
import {validateRegions,redEyeRenderVersion} from './red-eye-mask.mjs';
export const hasCorrection=record=>!!record?.regions?.some(r=>r.enabled&&(r.strength??1)>0);
export function createRedEyeService({getLibrary,save,dataDir,versionsOf}){
  const dir=path.join(dataDir,'red-eye'),jobsFile=path.join(dir,'jobs.json');
  const jobs=fs.existsSync(jobsFile)?JSON.parse(fs.readFileSync(jobsFile,'utf8')):[];
  for(const job of jobs)if(['running','queued'].includes(job.status))job.status='queued';
  let worker,nextId=0,draining=false,chain=Promise.resolve(),closed=false;const pending=new Map(),renders=new Map();
  function persist(){fs.mkdirSync(dir,{recursive:true});fs.writeFileSync(jobsFile+'.tmp',JSON.stringify(jobs.slice(-80),null,2));fs.renameSync(jobsFile+'.tmp',jobsFile);}
  function engine(){
    if(!worker){worker=new Worker(new URL('./red-eye-worker.mjs',import.meta.url));worker.unref();
      worker.on('message',({id,value,error})=>{const task=pending.get(id);if(!task)return;clearTimeout(task.timer);pending.delete(id);if(!pending.size)worker?.unref();error?task.reject(new Error(error)):task.resolve(value);});
      const failed=error=>{for(const task of pending.values()){clearTimeout(task.timer);task.reject(error);}pending.clear();worker=null;};
      const instance=worker;worker.on('error',failed);worker.on('exit',()=>{if(worker===instance)worker=null;if(pending.size)failed(new Error('本机图像进程已退出，请重试。'));});
    }
    return worker;
  }
  function execute(action,input){
    const request=()=>new Promise((resolve,reject)=>{if(closed)return reject(new Error('去红眼服务已关闭。'));const active=engine(),id=++nextId;active.ref();const timer=setTimeout(()=>{active.terminate();pending.delete(id);reject(new Error('图像处理超时，请减少照片尺寸后重试。'));},180000);pending.set(id,{resolve,reject,timer});active.postMessage({id,action,input});});
    const result=chain.then(request);chain=result.catch(()=>{});return result;
  }
  function sourceOf(version){const source=version.source||(version.file?path.join(dataDir,'photos',version.file):null);if(!source||!fs.existsSync(source)||!fs.statSync(source).isFile())throw new Error('原片不在原位置，请恢复文件夹或连接移动硬盘。');return source;}
  const stamp=source=>{const s=fs.statSync(source);return `${s.size}:${s.mtimeMs}`;};
  function target(rollId,photoId,versionId){const roll=getLibrary().rolls.find(r=>r.id===rollId),photo=roll?.photos.find(p=>p.id===photoId),version=photo&&versionsOf(photo).find(v=>v.id===versionId);if(!version)throw new Error('照片或这个版本已不存在，请刷新。');return {roll,photo,version};}
  function currentRecord(photo,version){const record=photo.redEye?.[version.id];if(!record)throw new Error('请先检测这个照片版本的红眼。');return record;}
  function publicJob(job){if(!job)return null;return {...job,items:job.items.map(({before,...item})=>item)};}
  async function drain(){
    if(draining||closed)return;draining=true;
    try{for(const job of jobs){if(job.status!=='queued')continue;job.status='running';persist();
      for(const item of job.items){if(item.done)continue;if(job.cancelled){job.status='cancelled';break;}
        job.current=item.name;persist();
        try{
          const {photo,version}=target(job.rollId,item.photoId,item.versionId),source=sourceOf(version),initialStamp=stamp(source);
          if(item.beforeRecorded&&photo.redEye?.[version.id]?.jobId===job.id){const existing=photo.redEye[version.id];item.afterRevision=existing.autoRevision;item.status=existing.status;item.done=true;job.processed=job.items.filter(i=>i.done).length;persist();continue;}
          if(!item.beforeRecorded){item.before=structuredClone(photo.redEye?.[version.id]||null);item.beforeRecorded=true;persist();}
          const record=await execute('analyse',{source,options:{rotation:photo.rotation||0}});
          const current=target(job.rollId,item.photoId,item.versionId);
          if(current.photo!==photo||current.version.source!==version.source||current.version.file!==version.file)throw new Error('检测期间照片版本已变更，请重新检测。');
          if(job.cancelled){job.status='cancelled';break;}
          if(stamp(source)!==initialStamp)throw new Error('检测时原文件发生变化，请重试。');
          // Never overwrite an edit made while this worker was analysing the image.
          if((photo.redEye?.[version.id]?.revision||null)!==(item.before?.revision||null))throw new Error('检测期间选区已修改，已保留你的修改。');
          Object.assign(record,{revision:randomUUID(),jobId:job.id,sourceStamp:initialStamp});record.autoRevision=record.revision;for(const region of record.regions){region.id=randomUUID();region.baseRx=region.rx;region.baseRy=region.ry;}
          photo.redEye??={};photo.redEye[version.id]=record;item.afterRevision=record.revision;item.status=record.status;save();
        }catch(e){item.error=e.message;item.status='error';}
        item.done=true;job.processed=job.items.filter(i=>i.done).length;persist();
      }
      if(job.status==='running')job.status='complete';job.current='';job.finishedAt=new Date().toISOString();persist();
    }}finally{draining=false;}
  }
  function start(roll,input){
    const ids=input.ids??roll.photos.map(p=>p.id);
    if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(id=>typeof id!=='string')||new Set(ids).size!==ids.length||ids.some(id=>!roll.photos.some(p=>p.id===id)))throw new Error('请选择有效的照片。');
    if(!['finished','scan'].includes(input.version))throw new Error('请选择成片或扫描原片版本。');
    if(jobs.some(j=>j.rollId===roll.id&&['queued','running'].includes(j.status)))throw new Error('这一卷已有去红眼任务，请等待或取消后重试。');
    const items=ids.map(id=>{const photo=roll.photos.find(p=>p.id===id),list=versionsOf(photo),version=input.versionId&&ids.length===1?list.find(v=>v.id===input.versionId):list.find(v=>v.kind===input.version)||list[0];if(!version)throw new Error('这个照片版本不存在。');return {photoId:id,versionId:version.id,name:version.name||photo.name,done:false};});
    const job={id:randomUUID(),rollId:roll.id,status:'queued',createdAt:new Date().toISOString(),processed:0,total:items.length,items,current:''};jobs.push(job);persist();setImmediate(()=>void drain());return publicJob(job);
  }
  function getJob(roll,id){return publicJob([...jobs].reverse().find(j=>j.rollId===roll.id&&(!id||j.id===id)));}
  function cancel(roll,id){const job=jobs.find(j=>j.id===id&&j.rollId===roll.id);if(!job)throw new Error('任务不存在。');job.cancelled=true;if(job.status==='queued')job.status='cancelled';persist();return publicJob(job);}
  function undo(roll,id){
    const job=jobs.find(j=>j.rollId===roll.id&&j.id===id);if(!job||!['complete','cancelled'].includes(job.status))throw new Error('任务尚未完成，暂时不能撤销。');let changed=0,skipped=0;
    for(const item of job.items){const p=roll.photos.find(p=>p.id===item.photoId);if(!item.afterRevision)continue;if(p?.redEye?.[item.versionId]?.revision!==item.afterRevision){skipped++;continue;}if(item.before)p.redEye[item.versionId]=item.before;else delete p.redEye[item.versionId];changed++;}
    save();return {changed,skipped};
  }
  async function edit(roll,photo,version,input){
    const record=currentRecord(photo,version),source=sourceOf(version);if(input.revision!==record.revision)throw new Error('选区已变更，请重新载入后再修改。');
    if(stamp(source)!==record.sourceStamp)throw new Error('原文件已改变，请重新检测。');
    let regions;
    if(input.point){
      const pupil=await execute('manual',{source,record,point:input.point});
      const current=target(roll.id,photo.id,version.id);
      if(current.photo!==photo||current.version.source!==version.source||current.version.file!==version.file||currentRecord(current.photo,current.version).revision!==input.revision)throw new Error('照片或选区已变更，请重新载入。');
      if(stamp(source)!==record.sourceStamp)throw new Error('原文件已改变，请重新检测。');
      // A second click on the same pupil replaces its region instead of applying twice.
      const existing=record.regions.find(r=>Math.hypot((r.x-pupil.x)/Math.max(r.rx,pupil.rx),(r.y-pupil.y)/Math.max(r.ry,pupil.ry))<.8);
      regions=existing?record.regions.map(r=>r.id===existing.id?{...pupil,id:r.id,baseRx:pupil.rx,baseRy:pupil.ry}:r):[...record.regions,{...pupil,id:randomUUID(),baseRx:pupil.rx,baseRy:pupil.ry}];
      validateRegions(regions);
    }
    else regions=validateRegions(input.regions).map(r=>{const old=record.regions.find(old=>old.id===r.id);return {x:r.x,y:r.y,rx:r.rx,ry:r.ry,baseRx:old?.baseRx||old?.rx||r.rx,baseRy:old?.baseRy||old?.ry||r.ry,strength:r.strength,enabled:r.enabled,id:old?.id||randomUUID(),manual:!!r.manual,score:Number.isFinite(r.score)?r.score:0};});
    photo.redEye[version.id]={...record,regions,previous:record.previous||{regions:structuredClone(record.regions),status:record.status},revision:randomUUID(),status:hasCorrection({regions})?'corrected':'review',note:'已保存眼部选区，可调整或撤销。'};save();return photo.redEye[version.id];
  }
  function undoPhoto(photo,version,input){const record=currentRecord(photo,version);if(input.revision!==record.revision)throw new Error('选区已变更，请刷新。');if(record.previous)photo.redEye[version.id]={...record,...record.previous,previous:undefined,revision:randomUUID()};else delete photo.redEye[version.id];save();return {ok:true};}
  async function rendered(photo,version,{rotation=photo.rotation||0,preview=0,regionId=null,before=false}={}){
    const record=currentRecord(photo,version),source=sourceOf(version);if(stamp(source)!==record.sourceStamp)throw new Error('原文件已改变，请重新检测红眼。');
    const cropIndex=regionId?record.regions.findIndex(r=>r.id===regionId):-1;if(regionId&&cropIndex<0)throw new Error('眼部选区不存在。');
    const hash=createHash('sha256').update(JSON.stringify([version.id,record.revision,redEyeRenderVersion,rotation,preview,cropIndex,before])).digest('hex'),cache=path.join(dir,'renders');fs.mkdirSync(cache,{recursive:true});
    const file=path.join(cache,hash+(preview?'.jpg':'.tif'));
    if(!fs.existsSync(file)){
      if(!renders.has(file)){const promise=execute('render',{source,record,target:file+'.tmp',options:{rotation,preview,cropIndex,before}}).then(()=>fs.renameSync(file+'.tmp',file)).catch(e=>{fs.rmSync(file+'.tmp',{force:true});throw e;}).finally(()=>renders.delete(file));renders.set(file,promise);}
      await renders.get(file);
    }
    return file;
  }
  setImmediate(()=>void drain());
  return {start,getJob,cancel,undo,edit,undoPhoto,rendered,hasCorrection,active:()=>jobs.filter(j=>['queued','running'].includes(j.status)).map(publicJob),async close(){closed=true;await worker?.terminate();}};
}
