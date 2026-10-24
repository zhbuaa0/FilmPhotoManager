import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { inspectFolder, makePreview, mimeFor } from './local-import.mjs';
import { createOrientationDetector, getOrientationCapabilities, applyOrientationDecisions, undoOrientationDecisions } from './orientation.mjs';
import { cameraMetadata, resolveRollCamera } from './camera-records.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(process.env.LIGHTBOX_DATA_DIR || path.join(root, 'data'));
const port = Number(process.env.PORT || 4317);
fs.mkdirSync(path.join(dataDir, 'photos'), { recursive: true });
fs.mkdirSync(path.join(dataDir, 'previews'), { recursive: true });
const indexFile = path.join(dataDir, 'library.json');
let library = fs.existsSync(indexFile) ? JSON.parse(fs.readFileSync(indexFile, 'utf8')) : { version: 1, rolls: [] };
library.cameras??=[];
function save() {
  const tmp = indexFile + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(library, null, 2));
  fs.renameSync(tmp, indexFile);
}
function json(res, code, body) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}
async function body(req, limit = 1024 * 1024) {
  const chunks = []; let bytes = 0;
  for await (const chunk of req) { bytes += chunk.length; if (bytes > limit) throw new Error('文件超过 80 MB，请先转换为较小的扫描文件。'); chunks.push(chunk); }
  return Buffer.concat(chunks);
}
const fields = ['title', 'number', 'camera', 'film', 'iso', 'format', 'loadedAt', 'shotStart', 'shotEnd', 'developedAt', 'lab', 'notes'];
function metadata(input, existingId) {
  const result = {};
  for (const key of fields) result[key] = String(input[key] ?? '').trim().slice(0, key === 'notes' ? 4000 : 160);
  Object.assign(result,resolveRollCamera(input,library.cameras));
  if (!result.title || !result.number) throw new Error('请填写胶卷名称和实物编号。');
  if (library.rolls.some(r => r.id !== existingId && r.number === result.number)) throw new Error('这个实物编号已经使用，请填写另一个编号。');
  for (const key of ['loadedAt', 'shotStart', 'shotEnd', 'developedAt']) {
    const d = result[key];
    if (d && (!/^\d{4}-\d{2}-\d{2}$/.test(d) || !Number.isFinite(Date.parse(d)) || new Date(d).toISOString().slice(0, 10) !== d)) throw new Error('请输入有效日期。');
  }
  const dates = [result.loadedAt, result.shotStart, result.shotEnd, result.developedAt].filter(Boolean);
  if (dates.some((d, i) => i && d < dates[i - 1])) throw new Error('时间顺序应为：上卷 → 拍摄开始 → 拍摄结束 → 冲洗。');
  return result;
}
function imageType(b) {
  if(b.length>=54&&b.toString('ascii',0,2)==='BM')return ['bmp','image/bmp'];
  if (b.length>=4 && ((b[0]===73&&b[1]===73&&[42,43].includes(b.readUInt16LE(2)))||(b[0]===77&&b[1]===77&&[42,43].includes(b.readUInt16BE(2))))) return ['tif','image/tiff'];
  if (b[0] === 255 && b[1] === 216 && b[2] === 255) return ['jpg', 'image/jpeg'];
  if (b.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10]))) return ['png', 'image/png'];
  if (b.subarray(0,4).toString() === 'RIFF' && b.subarray(8,12).toString() === 'WEBP') return ['webp', 'image/webp'];
  if (b.subarray(0,6).toString().match(/^GIF8[79]a$/)) return ['gif', 'image/gif'];
  throw new Error('支持 TIFF、BMP、JPG、PNG、WebP 和 GIF；HEIC、RAW 请先转换。');
}
const types = { '.mjs': 'text/javascript; charset=utf-8', '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.jpg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif', '.bmp':'image/bmp', '.tif':'image/tiff', '.tiff':'image/tiff' };
const jobs = new Map(), conversions=new Map();
const orientationJobs = new Map();
for (const roll of library.rolls) if (roll.orientationScan?.status === 'running') { roll.orientationScan.status='interrupted'; save(); }
const versionsOf=p=>p.versions?.length?p.versions:[{id:p.id,name:p.name,mime:p.mime,bytes:p.bytes,file:p.file,thumbnail:p.thumbnail,kind:['image/tiff','image/bmp'].includes(p.mime)?'scan':'image'}];
async function scanOrientation(roll,job,preference) {
  const detector=createOrientationDetector(dataDir);
  try {
  const photos=[...roll.photos];
  for (const photo of photos) {
    if (!library.rolls.includes(roll)) { job.status='cancelled'; return; }
    job.current=photo.name;
    const version=versionsOf(photo).find(v=>v.kind===preference)||versionsOf(photo)[0];
    let result;
    try { result=await detector.detect(path.join(dataDir,'photos',version.thumbnail||photo.thumbnail||version.file)); }
    catch(e) { result={angle:null,reliable:false,method:'unknown',reason:e.message,error:true}; job.errors.push(photo.name); }
    if(roll.photos.includes(photo))photo.orientationCheck={...result,scanId:job.id,versionId:version.id,checkedAt:new Date().toISOString()};
    job.processed++; save();
  }
  job.status='complete';job.current='';job.completedAt=new Date().toISOString();save();
  } finally {await detector.close();}
}
const ownedFiles=p=>[...new Set([p.file,p.thumbnail,p.display,...versionsOf(p).flatMap(v=>[v.file,v.thumbnail,v.display,`${v.id}-view.jpg`,...[90,180,270].flatMap(r=>[`${v.id}-r${r}-thumb.jpg`,`${v.id}-r${r}-view.jpg`])])].filter(Boolean))];
function fileResponse(res,file,mime,name) {
  if(!file||!fs.existsSync(file))return json(res,404,{error:'原文件已移动或不在原位置，请恢复原文件夹。'});
  const headers={'Content-Type':mime,'Content-Length':fs.statSync(file).size,'Cache-Control':'private, max-age=86400'};
  if(name)headers['Content-Disposition']=`attachment; filename="original${path.extname(name).replace(/[^a-zA-Z0-9.]/g,'')}"; filename*=UTF-8''${encodeURIComponent(name)}`;
  res.writeHead(200,headers);const stream=fs.createReadStream(file);stream.on('error',()=>res.destroy());stream.pipe(res);
}
async function importFolder(plan,mode,job) {
  try {
    for(const sourceRoll of plan.rolls) {
      let roll=library.rolls.find(r=>r.sourceFolder===sourceRoll.folder);
      if(!roll) {
        if(library.rolls.some(r=>r.number===sourceRoll.number)){job.errors.push(`${sourceRoll.label}：编号已使用，请修改已有编号再导入。`);job.processed+=sourceRoll.frames.length;continue;}
        roll={id:randomUUID(),...Object.fromEntries(fields.map(k=>[k,''])),title:`${path.basename(plan.root)} · ${sourceRoll.label}`,number:sourceRoll.number,notes:sourceRoll.notes,photos:[],sourceFolder:sourceRoll.folder,storageMode:mode,createdAt:new Date().toISOString()};
        library.rolls.push(roll);save();
      }
      job.rollIds.push(roll.id);
      for(const frame of sourceRoll.frames) {
        let photo=roll.photos.find(p=>p.frameSource===frame.key||versionsOf(p).some(v=>v.sourceKey===frame.key));
        const fresh=!photo;if(!photo)photo={id:randomUUID(),name:path.basename(frame.key),starred:false,frameSource:frame.key,versions:[],createdAt:new Date().toISOString()};
        let added=0;
        for(const variant of frame.variants) {
          job.current=`${sourceRoll.label} / ${path.basename(variant.path)}`;
          const existing=versionsOf(photo).find(v=>v.sourceKey===variant.path);
          if(existing){
            if(mode==='copy'&&existing.source){
              const file=`${existing.id}${path.extname(variant.path).toLowerCase()}`;
              try{fs.copyFileSync(existing.source,path.join(dataDir,'photos',file),fs.constants.COPYFILE_EXCL);existing.file=file;delete existing.source;job.copiedFiles++;save();}
              catch(e){job.errors.push(`${existing.name}：原图复制失败，保留原目录引用。`);}
            }
            job.skipped++;continue;
          }
          const id=randomUUID(),thumbnail=`${id}-thumb.jpg`;let file;
          try {
            const stats=fs.statSync(variant.path),mime=mimeFor(variant.path);
            await makePreview(variant.path,path.join(dataDir,'photos',thumbnail));
            if(mode==='copy'){file=`${id}${path.extname(variant.path).toLowerCase()}`;fs.copyFileSync(variant.path,path.join(dataDir,'photos',file),fs.constants.COPYFILE_EXCL);}
            photo.versions.push({id,name:path.basename(variant.path),kind:variant.kind,matchedBy:variant.match,mime,bytes:stats.size,thumbnail,...(file?{file}:{source:variant.path}),sourceKey:variant.path});added++;job.importedVersions++;
          }catch(e){fs.rmSync(path.join(dataDir,'photos',thumbnail),{force:true});if(file)fs.rmSync(path.join(dataDir,'photos',file),{force:true});job.errors.push(`${path.basename(variant.path)}：${e.message}`);}
        }
        if(photo.versions.length){const preferred=photo.versions.find(v=>v.kind==='finished')||photo.versions[0];Object.assign(photo,{thumbnail:preferred.thumbnail,mime:photo.versions[0].mime,bytes:photo.versions[0].bytes});if(fresh){roll.photos.push(photo);job.importedFrames++;}if(added)save();}
        job.processed++;
      }
      roll.storageMode=roll.photos.some(p=>versionsOf(p).some(v=>v.source))?'reference':'copy';save();
    }
    job.status='complete';job.current='';
  }catch(e){job.errors.push(e.message);job.status='failed';}
  finally{job.finishedAt=new Date().toISOString();}
}
const server = http.createServer(async (req, res) => {
  try {
    const hostname = (req.headers.host || '').split(':')[0];
    if (!['localhost', '127.0.0.1'].includes(hostname)) return json(res, 403, { error: '仅允许本机访问。' });
    if (req.headers.origin && ![`http://localhost:${port}`, `http://127.0.0.1:${port}`].includes(req.headers.origin)) return json(res, 403, { error: '请求来源不受信任。' });
    res.setHeader('X-Content-Type-Options', 'nosniff');
    const url = new URL(req.url, `http://127.0.0.1:${port}`);
    const parts = url.pathname.split('/').filter(Boolean);
    if(req.method==='GET'&&url.pathname==='/api/capabilities')return json(res,200,await getOrientationCapabilities());
    if (req.method === 'GET' && url.pathname === '/api/library') return json(res, 200, library);
    if(url.pathname==='/api/cameras'&&req.method==='GET')return json(res,200,library.cameras);
    if(url.pathname==='/api/cameras'&&req.method==='POST'){
      const input=JSON.parse(await body(req)),camera={id:randomUUID(),...cameraMetadata(input,library.cameras),createdAt:new Date().toISOString()};
      library.cameras.push(camera);
      for(const roll of library.rolls)if(!roll.cameraId&&roll.camera===camera.name)roll.cameraId=camera.id;
      save();return json(res,201,camera);
    }
    if(parts[0]==='api'&&parts[1]==='cameras'&&parts.length===3){
      const camera=library.cameras.find(c=>c.id===parts[2]);if(!camera)return json(res,404,{error:'相机登记不存在。'});
      if(req.method==='PUT'){
        const previousName=camera.name,updated=cameraMetadata(JSON.parse(await body(req)),library.cameras,camera.id);
        Object.assign(camera,updated,{updatedAt:new Date().toISOString()});
        for(const roll of library.rolls)if(roll.cameraId===camera.id||(!roll.cameraId&&roll.camera===previousName)){roll.cameraId=camera.id;roll.camera=camera.name;}
        save();return json(res,200,camera);
      }
      if(req.method==='DELETE'){
        library.cameras=library.cameras.filter(c=>c.id!==camera.id);
        for(const roll of library.rolls)if(roll.cameraId===camera.id)roll.cameraId='';
        save();return json(res,200,{ok:true});
      }
      return json(res,405,{error:'相机登记不支持这个操作。'});
    }
    if(req.method==='POST'&&url.pathname==='/api/folder/inspect'){
      const input=JSON.parse(await body(req)),plan=inspectFolder(input.path,{includeAggregates:input.includeAggregates===true});
      return json(res,200,{root:plan.root,frames:plan.frames,versions:plan.versions,bytes:plan.bytes,ignored:plan.ignored,duplicates:plan.duplicates,warnings:plan.warnings,rolls:plan.rolls.map(r=>({label:r.label,number:r.number,notes:r.notes,frames:r.frames.length,paired:r.paired,tiffs:r.tiffs,bytes:r.bytes}))});
    }
    if(req.method==='POST'&&url.pathname==='/api/folder/import'){
      if([...jobs.values()].some(j=>j.status==='running'))return json(res,409,{error:'已有文件夹正在导入，请等待完成。'});
      const input=JSON.parse(await body(req));if(!['reference','copy'].includes(input.mode))throw new Error('请选择保存方式。');
      const plan=inspectFolder(input.path,{includeAggregates:input.includeAggregates===true}),job={id:randomUUID(),status:'running',total:plan.frames,processed:0,importedFrames:0,importedVersions:0,copiedFiles:0,skipped:0,errors:[],rollIds:[],mode:input.mode,current:'',startedAt:new Date().toISOString()};
      jobs.set(job.id,job);void importFolder(plan,input.mode,job);return json(res,202,job);
    }
    if(req.method==='GET'&&url.pathname==='/api/imports/active')return json(res,200,[...jobs.values()].find(j=>j.status==='running')||null);
    if(req.method==='GET'&&parts[0]==='api'&&parts[1]==='imports')return jobs.has(parts[2])?json(res,200,jobs.get(parts[2])):json(res,404,{error:'导入任务不存在。软件重启后可重新导入，已有文件会跳过。'});
    if (req.method === 'POST' && url.pathname === '/api/rolls') {
      const input = JSON.parse(await body(req)); const roll = { id: randomUUID(), ...metadata(input), photos: [], createdAt: new Date().toISOString() };
      library.rolls.unshift(roll); save(); return json(res, 201, roll);
    }
    if (parts[0] === 'api' && parts[1] === 'rolls') {
      const roll = library.rolls.find(r => r.id === parts[2]);
      if (!roll) return json(res, 404, { error: '胶卷不存在。' });
      if (parts[3] === 'orientation') {
        if(parts.length===4&&req.method==='GET')return json(res,200,roll.orientationScan||null);
        if(parts.length===4&&req.method==='POST') {
          const input=JSON.parse(await body(req));if(!['finished','scan'].includes(input.version))throw new Error('请选择识别的照片版本。');
          const capabilities=await getOrientationCapabilities();
          const running=[...orientationJobs.values()].find(j=>j.status==='running');
          if(running)return running.rollId===roll.id?json(res,202,running):json(res,409,{error:'另一卷正在识别方向，请稍后再试。'});
          if(!roll.photos.length)throw new Error('请先导入这一卷的照片。');
          const job={id:randomUUID(),rollId:roll.id,version:input.version,engineId:capabilities.engineId,engineLabel:capabilities.engineLabel,status:'running',total:roll.photos.length,processed:0,current:'正在准备本机识别引擎',errors:[],startedAt:new Date().toISOString()};
          orientationJobs.set(roll.id,job);roll.orientationScan=job;save();void scanOrientation(roll,job,input.version).catch(()=>{job.status='failed';job.current='识别中断，请重新识别。';save();});
          return json(res,202,job);
        }
        if(parts[4]==='apply'&&req.method==='POST') {
          const input=JSON.parse(await body(req));
          if(roll.orientationScan?.status!=='complete'||roll.orientationScan.id!==input.scanId)throw new Error('请等待识别完成，或重新打开当前识别结果。');
          const changed=applyOrientationDecisions(roll,input.decisions,input.scanId);save();return json(res,200,{changed});
        }
        if(parts[4]==='undo'&&req.method==='POST') { const result=undoOrientationDecisions(roll);save();return json(res,200,result); }
      }
      if (parts.length === 3 && req.method === 'PUT') { Object.assign(roll, metadata(JSON.parse(await body(req)), roll.id)); save(); return json(res, 200, roll); }
      if (parts.length === 3 && req.method === 'DELETE') {
        if([...jobs.values()].some(j=>j.status==='running'&&j.rollIds.includes(roll.id)))return json(res,409,{error:'正在导入，请等待完成再删除。'});
        library.rolls = library.rolls.filter(r => r.id !== roll.id); save();
        for (const p of roll.photos) for (const f of ownedFiles(p)) fs.rmSync(path.join(dataDir, 'photos', f), { force: true });
        for (const suffix of ['', '-3x2', '-16x9', '-free']) fs.rmSync(path.join(dataDir, 'previews', roll.id + suffix + '.png'), { force: true });
        return json(res, 200, { ok: true });
      }
      if (parts[3] === 'preview' && parts.length === 4) {
        const format = url.searchParams.get('format') || '';
        if (!['', '3x2', '16x9', 'free'].includes(format)) throw new Error('请选择有效的预览图比例。');
        const suffix = format ? '-' + format : '';
        const file = path.join(dataDir, 'previews', roll.id + suffix + '.png');
        if (req.method === 'POST') {
          const bytes = await body(req, 80 * 1024 * 1024);
          if (imageType(bytes)[0] !== 'png') throw new Error('预览图必须为 PNG 格式。');
          if (!library.rolls.includes(roll)) return json(res, 409, { error: '胶卷已删除。' });
          const temporary = file + '.tmp'; fs.writeFileSync(temporary, bytes); fs.renameSync(temporary, file);
          return json(res, 201, { url: `/api/rolls/${roll.id}/preview${format ? '?format=' + format : ''}`, saved: true });
        }
        if (req.method === 'GET' && fs.existsSync(file)) {
          res.writeHead(200, { 'Content-Type': 'image/png', 'Content-Length': fs.statSync(file).size, 'Cache-Control': 'no-store', 'Content-Disposition': `attachment; filename="contact-sheet${suffix}.png"; filename*=UTF-8''${encodeURIComponent(roll.number + '-接触印样' + suffix + '.png')}` });
          fs.createReadStream(file).pipe(res); return;
        }
      }
      if (parts[3] === 'photos' && parts.length === 4 && req.method === 'POST') {
        const bytes = await body(req, 80 * 1024 * 1024); const [ext, mime] = imageType(bytes);
        if (!library.rolls.includes(roll)) return json(res, 409, { error: '胶卷已删除。' });
        const id = randomUUID(); const photo = { id, file: `${id}.${ext}`, name: path.basename(decodeURIComponent(req.headers['x-file-name'] || 'scan.' + ext)).slice(0, 200), mime, bytes: bytes.length, starred: false, createdAt: new Date().toISOString() };
        fs.writeFileSync(path.join(dataDir, 'photos', photo.file), bytes);
        if(['image/tiff','image/bmp'].includes(mime)){
          photo.thumbnail=`${id}-thumb.jpg`;
          try{await makePreview(path.join(dataDir,'photos',photo.file),path.join(dataDir,'photos',photo.thumbnail));}
          catch(e){fs.rmSync(path.join(dataDir,'photos',photo.file),{force:true});throw e;}
        }
        roll.photos.push(photo); save(); return json(res, 201, photo);
      }
      if (parts[3] === 'order' && req.method === 'PUT') {
        const { ids } = JSON.parse(await body(req));
        if (!Array.isArray(ids) || ids.length !== roll.photos.length || new Set(ids).size !== ids.length || ids.some(id => !roll.photos.some(p => p.id === id))) throw new Error('照片顺序不完整，请重新载入。');
        roll.photos = ids.map(id => roll.photos.find(p => p.id === id)); save(); return json(res, 200, roll);
      }
      const photo = roll.photos.find(p => p.id === parts[4]);
      if (parts[3] === 'photos' && photo) {
        if(req.method==='GET'&&['original','display','thumbnail'].includes(parts[5])){
          const variants=versionsOf(photo),wanted=url.searchParams.get('version');if(wanted&&!variants.some(v=>v.id===wanted))return json(res,404,{error:'这个照片版本不存在。'});
          const version=variants.find(v=>v.id===wanted)||variants.find(v=>v.kind==='finished')||variants[0];
          const source=version.source||(version.file?path.join(dataDir,'photos',version.file):null);
          if(parts[5]==='original')return fileResponse(res,source,version.mime,version.name);
          const requestedRotation=url.searchParams.get('rotation'),rotation=requestedRotation===null?(photo.rotation||0):Number(requestedRotation),small=parts[5]==='thumbnail';
          if(![0,90,180,270].includes(rotation))throw new Error('旋转角度无效。');
          if(small&&!rotation)return fileResponse(res,path.join(dataDir,'photos',version.thumbnail||photo.thumbnail),'image/jpeg');
          if(!small&&!['image/tiff','image/bmp'].includes(version.mime)&&!rotation)return fileResponse(res,source,version.mime);
          const input=small?path.join(dataDir,'photos',version.thumbnail||photo.thumbnail):source;
          if(!input||!fs.existsSync(input))return json(res,404,{error:'原片不在原位置，请恢复原文件夹。'});
          const preview=`${version.id}${rotation?'-r'+rotation:''}-${small?'thumb':'view'}.jpg`,target=path.join(dataDir,'photos',preview);
          if(!fs.existsSync(target)){
            if(!conversions.has(preview))conversions.set(preview,makePreview(input,target,small?1600:4000,rotation).finally(()=>conversions.delete(preview)));
            await conversions.get(preview);
          }
          version.display=preview;photo.display=preview;save();return fileResponse(res,target,'image/jpeg');
        }
        if (parts[5] === 'thumbnail' && req.method === 'POST') {
          const bytes = await body(req, 8 * 1024 * 1024); const [ext] = imageType(bytes);
          if (!roll.photos.includes(photo)) return json(res, 409, { error: '照片已删除。' });
          const file = `${photo.id}-thumb.${ext}`; fs.writeFileSync(path.join(dataDir, 'photos', file), bytes);
          const old = photo.thumbnail; photo.thumbnail = file; save();
          if (old && old !== file) fs.rmSync(path.join(dataDir, 'photos', old), { force: true });
          return json(res, 200, photo);
        }
        if (req.method === 'PUT' && parts.length === 5) {
          const input=JSON.parse(await body(req));
          if('rotation'in input&&!([0,90,180,270].includes(input.rotation)))throw new Error('旋转角度无效。');
          if('starred'in input)photo.starred=Boolean(input.starred);if('rotation'in input){photo.rotation=input.rotation;photo.rotationSource='manual';photo.rotationRevision=(photo.rotationRevision||0)+1;}save();return json(res,200,photo);
        }
        if (req.method === 'DELETE' && parts.length === 5) {
          if([...jobs.values()].some(j=>j.status==='running'&&j.rollIds.includes(roll.id)))return json(res,409,{error:'正在导入，请等待完成再删除。'});
          roll.photos = roll.photos.filter(p => p.id !== photo.id); save();
          for (const f of ownedFiles(photo)) fs.rmSync(path.join(dataDir, 'photos', f), { force: true });
          return json(res, 200, { ok: true });
        }
      }
      return json(res, 404, { error: '操作不存在。' });
    }
    if (req.method === 'GET' && parts[0] === 'photos' && parts.length === 2 && /^[a-f0-9-]+(?:-(thumb|view))?\.(jpg|png|webp|gif|bmp|tiff?)$/.test(parts[1])) {
      const file = path.join(dataDir, 'photos', parts[1]);
      if (!fs.existsSync(file)) return json(res, 404, { error: '文件不存在。' });
      res.writeHead(200, { 'Content-Type': types[path.extname(file)], 'Cache-Control': 'private, max-age=86400', 'Content-Length': fs.statSync(file).size });
      fs.createReadStream(file).pipe(res); return;
    }
    if (req.method === 'GET' && !url.pathname.startsWith('/api/')) {
      const publicRoot = path.join(root, 'public'); const file = path.resolve(publicRoot, '.' + (url.pathname === '/' ? '/index.html' : decodeURIComponent(url.pathname)));
      if (!file.startsWith(publicRoot + path.sep) || !fs.existsSync(file) || !fs.statSync(file).isFile()) return json(res, 404, { error: '页面不存在。' });
      res.writeHead(200, { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-cache' }); fs.createReadStream(file).pipe(res); return;
    }
    json(res, 404, { error: '操作不存在。' });
  } catch (error) { json(res, 400, { error: error.message || '操作失败，请重试。' }); }
});
server.on('error', err => { console.error(err.code === 'EADDRINUSE' ? `端口 ${port} 正在使用。如果光匣已经打开，请直接访问 http://127.0.0.1:${port}` : err.message); process.exit(1); });
server.listen(port, '127.0.0.1', () => console.log(`光匣已启动：http://127.0.0.1:${port}\n档案保存在：${dataDir}`));
