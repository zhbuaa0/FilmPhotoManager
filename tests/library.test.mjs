import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import sharp from 'sharp';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { once } from 'node:events';
import net from 'node:net';
import { inspectFolder,makePreview } from '../local-import.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const data = fs.mkdtempSync(path.join(os.tmpdir(), 'lightbox-test-'));
// Windows may reserve a fixed port; let the OS choose an available test port.
const probe=net.createServer();
await new Promise((resolve,reject)=>{probe.once('error',reject);probe.listen(0,'127.0.0.1',resolve);});
const port=probe.address().port;
await new Promise(resolve=>probe.close(resolve));
const base = `http://127.0.0.1:${port}`;
let process;
async function start() {
  process = spawn(globalThis.process.execPath, [path.join(root, 'server.mjs')], { env: { ...globalThis.process.env, PORT: String(port), LIGHTBOX_DATA_DIR: data }, stdio: ['ignore', 'pipe', 'pipe'] });
  await Promise.race([once(process.stdout, 'data'), once(process, 'exit').then(() => { throw new Error('测试服务未启动'); })]);
}
async function stop() { const done = once(process, 'exit'); process.kill('SIGTERM'); await done; }
const call = async (route, method='GET', value) => {
  const response = await fetch(base+route, { method, ...(value ? { headers:{'Content-Type':'application/json'}, body:JSON.stringify(value) } : {}) });
  return { status: response.status, body: await response.json() };
};

test('登记相机、胶卷关联、改名、磁盘恢复和移除后保留历史文字',async t=>{
  await start();t.after(async()=>{if(process.exitCode===null)await stop();fs.rmSync(data,{recursive:true,force:true});});
  assert.deepEqual((await call('/api/cameras')).body,[]);
  const unknown=await call('/api/rolls','POST',{title:'待确认胶卷',number:'UNKNOWN'});assert.equal(unknown.body.camera,'');
  const legacy=await call('/api/rolls','POST',{title:'历史胶卷',number:'LEGACY',camera:'我的相机'});
  const spec={name:'我的相机',model:'EOS Kiss III',lens:'EF 50mm f/1.8 STM',format:'135',sources:['https://global.canon/en/c-museum/product/film214.html']};
  const created=await call('/api/cameras','POST',spec);assert.equal(created.status,201);const id=created.body.id;
  const image=await sharp({create:{width:40,height:30,channels:3,background:'#ddaa66'}}).png().toBuffer();
  const uploaded=await fetch(base+`/api/cameras/${id}/photo`,{method:'POST',body:image});assert.equal(uploaded.status,200);const cameraImage=(await uploaded.json()).photo;
  const preview=await fetch(base+'/camera-images/'+cameraImage);assert.equal(preview.status,200);assert.equal(preview.headers.get('content-type'),'image/jpeg');assert.equal((await sharp(Buffer.from(await preview.arrayBuffer())).metadata()).width,40);
  assert.equal((await fetch(base+`/api/cameras/${id}/photo`,{method:'POST',body:'not an image'})).status,400);
  assert.equal((await fetch(base+`/api/cameras/missing/photo`,{method:'POST',body:image})).status,404);
  assert.equal((await call('/api/cameras','POST',spec)).status,400);
  const selected=await call('/api/rolls','POST',{title:'已选相机',number:'LINKED',camera:spec.name});assert.equal(selected.body.cameraId,id);
  const library=(await call('/api/library')).body;assert.equal(library.rolls.find(r=>r.id===legacy.body.id).cameraId,id);assert.equal(library.rolls.find(r=>r.id===unknown.body.id).camera,'');
  assert.equal((await call('/api/rolls','POST',{title:'无效相机',number:'BAD',cameraId:'missing'})).status,400);
  assert.equal((await call('/api/cameras/'+id,'PUT',{...spec,name:'旅行相机'})).status,200);
  await stop();await start();
  const restored=(await call('/api/library')).body;assert.equal(restored.cameras.length,1);assert.equal(restored.cameras[0].name,'旅行相机');assert.equal(restored.rolls.find(r=>r.id===selected.body.id).camera,'旅行相机');
  assert.equal(restored.cameras[0].photo,cameraImage);assert.equal(restored.cameras[0].photoChoice,'custom');assert.equal((await fetch(base+'/camera-images/'+cameraImage)).status,200);
  assert.equal((await call('/api/cameras/'+id,'DELETE')).status,200);
  const after=(await call('/api/library')).body;assert.equal(after.cameras.length,0);assert.equal(after.rolls.length,3);assert.equal(after.rolls.find(r=>r.id===selected.body.id).camera,'旅行相机');assert.equal(after.rolls.find(r=>r.id===selected.body.id).cameraId,'');
});

test('胶卷档案、原图、帧序和磁盘恢复', async t => {
  await start();
  t.after(async()=>{if(process.exitCode===null)await stop();fs.rmSync(data,{recursive:true,force:true});});
  const meta={title:'测试胶卷',number:'TEST-001',camera:'Nikon FM2',film:'Gold 200',loadedAt:'2026-09-01',shotStart:'2026-09-02',shotEnd:'2026-09-05',developedAt:'2026-09-07'};
  assert.equal((await call('/api/library')).body.rolls.length,0);
  assert.equal((await call('/api/rolls','POST',{...meta,shotEnd:'2026-08-01'})).status,400);
  assert.equal((await call('/api/rolls','POST',{...meta,loadedAt:'2026-02-30'})).status,400);
  const created=await call('/api/rolls','POST',meta);assert.equal(created.status,201);const id=created.body.id;assert.equal(created.body.status,undefined);
  assert.equal((await call('/api/rolls','POST',meta)).status,400);
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jY1kAAAAASUVORK5CYII=','base64');
  const upload=await fetch(base+`/api/rolls/${id}/photos`,{method:'POST',headers:{'X-File-Name':encodeURIComponent('中文扫描-1.png')},body:png});assert.equal(upload.status,201);const photo=await upload.json();
  const original=Buffer.from(await(await fetch(base+'/photos/'+photo.file)).arrayBuffer());assert.deepEqual(original,png);assert.equal(photo.name,'中文扫描-1.png');
  const bad=await fetch(base+`/api/rolls/${id}/photos`,{method:'POST',body:'bad image'});assert.equal(bad.status,400);
  const bmp=Buffer.alloc(62);bmp.write('BM');bmp.writeUInt32LE(62,2);bmp.writeUInt32LE(54,10);bmp.writeUInt32LE(40,14);bmp.writeInt32LE(2,18);bmp.writeInt32LE(1,22);bmp.writeUInt16LE(1,26);bmp.writeUInt16LE(24,28);bmp[56]=255;bmp[58]=255;
  const bmpUpload=await fetch(base+`/api/rolls/${id}/photos`,{method:'POST',headers:{'X-File-Name':encodeURIComponent('扫描.BMP')},body:bmp});assert.equal(bmpUpload.status,201);const bitmap=await bmpUpload.json();assert.equal(bitmap.mime,'image/bmp');assert.ok(bitmap.thumbnail);
  const bmpRoute=`/api/rolls/${id}/photos/${bitmap.id}`;
  assert.deepEqual(Buffer.from(await(await fetch(base+bmpRoute+'/original')).arrayBuffer()),bmp);
  assert.equal((await fetch(base+bmpRoute+'/display')).headers.get('content-type'),'image/jpeg');
  const bmpRotated=await fetch(base+bmpRoute+'/display?rotation=90');assert.equal(bmpRotated.status,200);const bmpMeta=await sharp(Buffer.from(await bmpRotated.arrayBuffer())).metadata();assert.equal(bmpMeta.width,1);assert.equal(bmpMeta.height,2);
  await call(bmpRoute,'DELETE');
  const thumb=await fetch(base+`/api/rolls/${id}/photos/${photo.id}/thumbnail`,{method:'POST',body:png});assert.equal(thumb.status,200);const thumbnail=(await thumb.json()).thumbnail;
  await call(`/api/rolls/${id}/photos/${photo.id}`,'PUT',{starred:true});
  assert.equal((await call(`/api/rolls/${id}/order`,'PUT',{ids:[photo.id,photo.id]})).status,400);
  assert.equal((await call(`/api/rolls/${id}/order`,'PUT',{ids:[photo.id]})).status,200);
  assert.equal((await call(`/api/rolls/${id}`,'PUT',{...meta,notes:'保存的档案备注'})).status,200);
  const preview=await fetch(base+`/api/rolls/${id}/preview`,{method:'POST',body:png});assert.equal(preview.status,201);
  const previewGet=await fetch(base+`/api/rolls/${id}/preview`);assert.equal(previewGet.headers.get('content-type'),'image/png');assert.ok(previewGet.headers.get('content-disposition').includes('attachment'));assert.deepEqual(Buffer.from(await previewGet.arrayBuffer()),png);
  for(const format of ['3x2','16x9','free']) {
    const saved=await fetch(base+`/api/rolls/${id}/preview?format=${format}`,{method:'POST',body:png});assert.equal(saved.status,201);
    const exported=await fetch(base+(await saved.json()).url);assert.deepEqual(Buffer.from(await exported.arrayBuffer()),png);
    assert.ok(exported.headers.get('content-disposition').includes(format));assert.ok(fs.existsSync(path.join(data,'previews',`${id}-${format}.png`)));
  }
  assert.equal((await fetch(base+`/api/rolls/${id}/preview?format=unknown`,{method:'POST',body:png})).status,400);
  const scan=await call(`/api/rolls/${id}/orientation`,'POST',{version:'finished'});assert.equal(scan.status,202);
  assert.equal(scan.body.engineId,(await call('/api/capabilities')).body.engineId);
  let check;
  for(let i=0;i<400;i++){check=(await call(`/api/rolls/${id}/orientation`)).body;if(check.status!=='running')break;await new Promise(r=>setTimeout(r,50));}
  assert.equal(check.status,'complete');assert.equal(check.processed,1);
  const decision={photoId:photo.id,rotation:90,expectedRotation:0,expectedRevision:0};
  assert.equal((await call(`/api/rolls/${id}/orientation/apply`,'POST',{scanId:scan.body.id,decisions:[decision]})).body.changed,1);
  assert.equal((await call(`/api/rolls/${id}/orientation/apply`,'POST',{scanId:scan.body.id,decisions:[decision]})).status,400);
  const origin=await fetch(base+'/api/rolls',{method:'POST',headers:{Origin:'https://untrusted.example','Content-Type':'application/json'},body:JSON.stringify({...meta,number:'OTHER'})});assert.equal(origin.status,403);
  await stop();await start();
  const restored=(await call('/api/library')).body.rolls[0];assert.equal(restored.photos[0].starred,true);assert.equal(restored.notes,'保存的档案备注');assert.equal(restored.photos[0].thumbnail,thumbnail);
  assert.equal(restored.photos[0].rotation,90);assert.equal(restored.orientationScan.status,'complete');
  assert.equal((await call(`/api/rolls/${id}/orientation/undo`,'POST')).body.restored,1);
  assert.equal((await call('/api/library')).body.rolls[0].photos[0].rotation,0);
  assert.equal((await call(`/api/rolls/${id}/photos/${photo.id}`,'DELETE')).status,200);assert.equal(fs.existsSync(path.join(data,'photos',photo.file)),false);assert.equal(fs.existsSync(path.join(data,'photos',thumbnail)),false);
  assert.equal((await call(`/api/rolls/${id}`,'DELETE')).status,200);assert.equal((await call('/api/library')).body.rolls.length,0);assert.equal(fs.existsSync(path.join(data,'previews',id+'.png')),false);
  for(const format of ['3x2','16x9','free']) assert.equal(fs.existsSync(path.join(data,'previews',`${id}-${format}.png`)),false);
});

test('TIFF 文件夹、XMP 成片关联、重复导入和源文件保护',async t=>{
  const fixture=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-source-')),folder=path.join(fixture,'00001234');fs.mkdirSync(path.join(folder,'成片'),{recursive:true});
  const tiff=Buffer.from('SUkqAAgAAAAKAAABBAABAAAACAAAAAEBBAABAAAACAAAAAIBAwADAAAAhgAAAAMBAwABAAAAAQAAAAYBAwABAAAAAgAAABEBBAABAAAAjAAAABUBAwABAAAAAwAAABYBBAABAAAACAAAABcBBAABAAAAwAAAABwBAwABAAAAAQAAAAAAAAAIAAgACABablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablBablA=','base64');
  const secondTiff=Buffer.from(tiff);secondTiff[secondTiff.length-1]^=1;
  const first=path.join(folder,'000012340001.TIF'),second=path.join(folder,'000012340002.TIF'),finished=path.join(folder,'成片','名称不同的成片.jpg');fs.writeFileSync(first,tiff);fs.writeFileSync(second,secondTiff);fs.writeFileSync(path.join(folder,'000012340001 - 副本.jpg'),tiff);fs.writeFileSync(path.join(folder,'辅助.thm'),'ignored');
  await makePreview(second,finished);
  const previewSize=await sharp(finished).metadata();
  assert.equal(previewSize.width,8);assert.equal(previewSize.height,8);
  const jpg=fs.readFileSync(finished),xmp=Buffer.from('http://ns.adobe.com/xap/1.0/\0<x:xmpmeta xmpMM:PreservedFileName="000012340002.tif"/>'),length=Buffer.alloc(2);length.writeUInt16BE(xmp.length+2);fs.writeFileSync(finished,Buffer.concat([jpg.subarray(0,2),Buffer.from([255,225]),length,xmp,jpg.subarray(2)]));
  const plan=inspectFolder(fixture);assert.equal(plan.frames,2);assert.equal(plan.versions,3);assert.equal(plan.ignored,1);assert.equal(plan.duplicates,1);assert.equal(plan.rolls[0].paired,1);
  await start();t.after(async()=>{if(process.exitCode===null)await stop();fs.rmSync(data,{recursive:true,force:true});fs.rmSync(fixture,{recursive:true,force:true});});
  async function importMode(mode){const result=await call('/api/folder/import','POST',{path:fixture,mode});assert.equal(result.status,202);for(let i=0;i<150;i++){const job=(await call('/api/imports/'+result.body.id)).body;if(job.status!=='running'){assert.equal(job.status,'complete');assert.deepEqual(job.errors,[]);return job;}await new Promise(r=>setTimeout(r,50));}throw new Error('导入未完成');}
  const initial=await importMode('reference');assert.equal(initial.importedFrames,2);assert.equal(initial.importedVersions,3);
  let roll=(await call('/api/library')).body.rolls[0];assert.equal(roll.camera,'');assert.equal(roll.shotStart,'');assert.equal(roll.format,'');assert.equal(roll.photos[1].versions.length,2);
  const original=await fetch(base+`/api/rolls/${roll.id}/photos/${roll.photos[0].id}/original`);assert.deepEqual(Buffer.from(await original.arrayBuffer()),tiff);
  const display=await fetch(base+`/api/rolls/${roll.id}/photos/${roll.photos[0].id}/display`);assert.equal(display.status,200);assert.equal(display.headers.get('content-type'),'image/jpeg');assert.equal(Buffer.from(await display.arrayBuffer()).readUInt16BE(0),0xffd8);
  const photoRoute=`/api/rolls/${roll.id}/photos/${roll.photos[0].id}`;await call(photoRoute,'PUT',{starred:true});const rotated=await call(photoRoute,'PUT',{rotation:90});assert.equal(rotated.body.starred,true);assert.equal(rotated.body.rotation,90);assert.equal((await call(photoRoute,'PUT',{rotation:45})).status,400);
  const rotatedThumb=await fetch(base+photoRoute+'/thumbnail?rotation=90');assert.equal(rotatedThumb.status,200);assert.equal(rotatedThumb.headers.get('content-type'),'image/jpeg');assert.deepEqual(fs.readFileSync(first),tiff);
  assert.equal((await fetch(base+photoRoute+'/original?version=missing')).status,404);
  await stop();await start();assert.equal((await call('/api/library')).body.rolls[0].photos[0].rotation,90);
  const repeat=await importMode('reference');assert.equal(repeat.importedFrames,0);assert.equal(repeat.importedVersions,0);assert.equal(repeat.skipped,3);assert.equal((await call('/api/library')).body.rolls[0].photos.length,2);
  fs.renameSync(first,first+'.moved');const missing=await fetch(base+`/api/rolls/${roll.id}/photos/${roll.photos[0].id}/display`);assert.equal(missing.status,404);fs.renameSync(first+'.moved',first);
  const upgraded=await importMode('copy');assert.equal(upgraded.importedFrames,0);assert.equal(upgraded.copiedFiles,3);assert.equal((await call('/api/library')).body.rolls[0].photos.length,2);assert.equal((await call('/api/library')).body.rolls[0].storageMode,'copy');
  await call(`/api/rolls/${roll.id}`,'DELETE');assert.deepEqual(fs.readFileSync(first),tiff);assert.ok(fs.existsSync(finished));
  const copy=await importMode('copy');assert.equal(copy.importedFrames,2);roll=(await call('/api/library')).body.rolls[0];assert.ok(roll.photos.flatMap(p=>p.versions).every(v=>v.file&&!v.source));
  await call(`/api/rolls/${roll.id}`,'DELETE');assert.deepEqual(fs.readFileSync(first),tiff);assert.deepEqual(fs.readFileSync(second),secondTiff);assert.ok(fs.existsSync(finished));
});
