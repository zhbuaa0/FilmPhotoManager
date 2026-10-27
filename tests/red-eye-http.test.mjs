import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import net from 'node:net';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import {fileURLToPath} from 'node:url';
import sharp from 'sharp';
test('去红眼 API：单张版本、原图下载、眼部对照、导出、非法选区与撤销',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'redeye-http-')),probe=net.createServer();await new Promise(r=>probe.listen(0,'127.0.0.1',r));const port=probe.address().port;await new Promise(r=>probe.close(r));
  const child=spawn(process.execPath,[fileURLToPath(new URL('../server.mjs',import.meta.url))],{env:{...process.env,PORT:String(port),LIGHTBOX_DATA_DIR:dir},stdio:['ignore','pipe','pipe']});let stderr='';child.stderr.on('data',b=>stderr+=b);
  t.after(async()=>{if(child.exitCode===null){const done=once(child,'exit');child.kill();await done;}fs.rmSync(dir,{recursive:true,force:true});});await Promise.race([once(child.stdout,'data'),once(child,'exit').then(()=>{throw new Error(stderr);})]);
  const base=`http://127.0.0.1:${port}`,call=async(url,method='GET',value)=>{const r=await fetch(base+url,{method,...(value?{headers:{'Content-Type':'application/json'},body:JSON.stringify(value)}:{})});return {status:r.status,value:await r.json()};};
  const roll=(await call('/api/rolls','POST',{title:'测试',number:'RED-01'})).value,bytes=Buffer.alloc(160*100*3,120);for(let y=35;y<45;y++)for(let x=55;x<65;x++){const p=(y*160+x)*3;bytes[p]=240;bytes[p+1]=bytes[p+2]=20;}
  const png=await sharp(bytes,{raw:{width:160,height:100,channels:3}}).png().toBuffer(),upload=await fetch(base+`/api/rolls/${roll.id}/photos`,{method:'POST',headers:{'X-File-Name':encodeURIComponent('测试原图.png')},body:png}),photo=await upload.json(),endpoint=`/api/rolls/${roll.id}/photos/${photo.id}`;
  assert.equal((await call(`/api/rolls/${roll.id}/red-eye`,'POST',{ids:['missing'],version:'scan'})).status,400);
  const created=await call(`/api/rolls/${roll.id}/red-eye`,'POST',{ids:[photo.id],version:'finished'});assert.equal(created.status,202);let job;
  for(let n=0;n<500;n++){job=(await call(`/api/rolls/${roll.id}/red-eye`)).value;if(job.status==='complete')break;await new Promise(r=>setTimeout(r,25));}
  assert.equal(job.status,'complete');assert.equal(job.items[0].status,'no-face');let rec=(await call(endpoint+'/red-eye')).value;
  assert.equal((await call(endpoint+'/red-eye','PUT',{revision:rec.revision,point:{x:3,y:.4,radius:.08}})).status,400);
  const changed=await call(endpoint+'/red-eye','PUT',{revision:rec.revision,point:{x:60/160,y:.4,radius:.09}});assert.equal(changed.status,200);rec=changed.value;assert.ok(rec.regions[0].enabled);
  const output=await fetch(base+endpoint+'/red-eye-export');assert.equal(output.status,200);assert.equal(output.headers.get('content-type'),'image/tiff');assert.ok(output.headers.get('content-disposition').includes('attachment'));
  const corrected=await sharp(Buffer.from(await output.arrayBuffer())).raw().toBuffer();assert.ok(corrected[(40*160+60)*3]<80);
  const original=await fetch(base+endpoint+'/original');assert.deepEqual(Buffer.from(await original.arrayBuffer()),png);
  for(const before of [0,1]){const eye=await fetch(base+endpoint+`/red-eye-eye?region=${rec.regions[0].id}&before=${before}`);assert.equal(eye.status,200);assert.equal(eye.headers.get('content-type'),'image/jpeg');}
  assert.equal((await call(endpoint+'/red-eye?version=other')).status,404);
  const undo=await call(endpoint+'/red-eye','DELETE',{revision:rec.revision});assert.equal(undo.status,200);assert.equal((await call(endpoint+'/red-eye')).value.regions.length,0);
  assert.equal((await fetch(base+endpoint+'/red-eye-export')).status,400);assert.deepEqual((await call('/api/red-eye/active')).value,[]);
});
