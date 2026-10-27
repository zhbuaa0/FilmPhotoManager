import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import bmp from 'bmp-js';
import {findPupil,correctPixels,validateRegions} from '../red-eye-mask.mjs';
import {fromDisplay,toDisplay} from '../public/red-eye-coordinates.mjs';
import {readCanonical,sourceHash,renderCorrection,manualPupil} from '../red-eye-render.mjs';
import {createRedEyeService} from '../red-eye-service.mjs';
import {decodeYuNet} from '../red-eye-detector.mjs';
function pixels(depth=8){const a=depth===16?new Uint16Array(160*100*3):Buffer.alloc(160*100*3),unit=depth===16?257:1;for(let y=0;y<100;y++)for(let x=0;x<160;x++){const p=(y*160+x)*3;a[p]=100*unit;a[p+1]=100*unit;a[p+2]=100*unit;if(Math.hypot(x-60,y-40)<=5){a[p]=230*unit;a[p+1]=18*unit;a[p+2]=25*unit;}if(Math.hypot(x-120,y-80)<=8){a[p]=230*unit;a[p+1]=18*unit;a[p+2]=25*unit;}}const glint=(39*160+59)*3;a[glint]=a[glint+1]=a[glint+2]=depth===16?65535:255;return a;}
test('局部瞳孔分割保留高光，未选区域与红色背景逐像素不变',()=>{
  const rgb=pixels(),pupil=findPupil(rgb,160,100,{x:60,y:40,radius:14,faceScore:.99});assert.ok(pupil?.enabled);pupil.enabled=true;
  const pale=(41*160+60)*3;rgb.set([180,124,135],pale);const before=Buffer.from(rgb);correctPixels(rgb,160,100,[pupil]);assert.ok(rgb[(40*160+60)*3]<50);assert.ok(rgb[pale]<145);
  for(let y=0;y<100;y++)for(let x=0;x<160;x++){const p=(y*160+x)*3;if(Math.hypot((x-pupil.x*160)/(pupil.rx*160),(y-pupil.y*100)/(pupil.ry*100))>=1)assert.deepEqual(rgb.subarray(p,p+3),before.subarray(p,p+3));}
  const glint=(39*160+59)*3;assert.deepEqual(rgb.subarray(glint,glint+3),Buffer.from([255,255,255]));
  assert.equal(findPupil(Buffer.alloc(160*100*3,100),160,100,{x:60,y:40,radius:14}),null);
  assert.throws(()=>validateRegions([{x:2,y:0,rx:.01,ry:.01}]),/坐标/);
});
test('四个显示方向的点选往返与 YuNet 输出坐标解码',()=>{
  for(const rotation of [0,90,180,270]){const p=toDisplay(.23,.61,rotation),q=fromDisplay(p.x,p.y,rotation);assert.ok(Math.abs(q.x-.23)<1e-9&&Math.abs(q.y-.61)<1e-9);}
  const outputs={};for(const stride of [8,16,32]){const n=(32/stride)**2;for(const [prefix,size] of [['cls',1],['obj',1],['bbox',4],['kps',10]])outputs[prefix+'_'+stride]={data:new Float32Array(n*size)};}
  outputs.cls_8.data[5]=.99;outputs.obj_8.data[5]=.99;outputs.bbox_8.data[20]=.5;outputs.bbox_8.data[21]=.5;outputs.bbox_8.data[22]=Math.log(2);outputs.bbox_8.data[23]=Math.log(2);const f=decodeYuNet(outputs,32,32)[0];assert.ok(Math.abs(f.x-4)<1e-5&&Math.abs(f.y-4)<1e-5);assert.ok(Math.abs(f.w-16)<1e-5);
});
test('真实扫描偏色回归：中和红瞳孔不残留绿眼，保留高光和未选区域',()=>{
  for(const depth of [8,16]){
    const unit=depth===16?257:1,raw=depth===16?new Uint16Array(9*9*3):Buffer.alloc(9*9*3);
    for(let p=0;p<81;p++)raw.set([230*unit,100*unit,20*unit],p*3);
    const white=(4*9+5)*3;raw.set([255*unit,255*unit,255*unit],white);const original=raw.slice();
    correctPixels(raw,9,9,[{x:4/9,y:4/9,rx:3/9,ry:3/9,enabled:true,strength:1}],depth);
    const centre=(4*9+4)*3;assert.deepEqual([...raw.slice(centre,centre+3)],[60*unit,60*unit,60*unit]);assert.deepEqual([...raw.slice(white,white+3)],[255*unit,255*unit,255*unit]);assert.deepEqual([...raw.slice(0,3)],[...original.slice(0,3)]);
    const zero=original.slice();correctPixels(zero,9,9,[{x:4/9,y:4/9,rx:3/9,ry:3/9,enabled:true,strength:0}],depth);assert.deepEqual(zero,original);
  }
});
test('16-bit TIFF 无损修正版保留位深、原尺寸和选区外像素，原文件不改写',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'red-eye16-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));const source=path.join(root,'中文原片.tif'),target=path.join(root,'修正版.tif');
  await sharp(pixels(16),{raw:{width:160,height:100,channels:3}}).toColourspace('rgb16').tiff({compression:'deflate'}).toFile(source);
  const original=await sourceHash(source),image=await readCanonical(source),region={x:60/160,y:.4,rx:.05,ry:.07,enabled:true,strength:1};const record={sourceHash:original,width:160,height:100,regions:[region]};await renderCorrection(source,record,target);const corrected=await readCanonical(target);
  assert.equal(corrected.depth,16);assert.equal(corrected.width,160);assert.equal(corrected.height,100);assert.ok(corrected.pixels[(40*160+60)*3]<10000);assert.equal(await sourceHash(source),original);
  for(let y=0;y<100;y++)for(let x=0;x<160;x++)if(Math.hypot((x-60)/8,(y-40)/7)>=1){const p=(y*160+x)*3;assert.deepEqual(corrected.pixels.slice(p,p+3),image.pixels.slice(p,p+3));}
  await renderCorrection(source,record,path.join(root,'rotated.tif'),{rotation:90});const rotated=await sharp(path.join(root,'rotated.tif')).metadata();assert.equal(rotated.width,100);assert.equal(rotated.height,160);assert.equal(rotated.orientation,1);
  fs.appendFileSync(source,'changed');await assert.rejects(renderCorrection(source,record,target),/原文件已改变/);
});
test('真实本机模型、后台任务、手动补点、版本隔离、缓存、撤销与重启恢复',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'red-eye-service-'));let service;t.after(async()=>{await service?.close();fs.rmSync(root,{recursive:true,force:true});});
  fs.mkdirSync(path.join(root,'photos'));const source=path.join(root,'原图 & 空格.png');await sharp(pixels(),{raw:{width:160,height:100,channels:3}}).png().toFile(source);const hash=await sourceHash(source);
  const library={rolls:[{id:'roll',photos:[{id:'photo',name:'one',versions:[{id:'scan',source,name:'原图.png',kind:'scan'},{id:'finished',source,name:'成片.png',kind:'finished'}]}]}]},roll=library.rolls[0],photo=roll.photos[0];let saves=0;
  const options={getLibrary:()=>library,save:()=>saves++,dataDir:root,versionsOf:p=>p.versions};service=createRedEyeService(options);
  const job=service.start(roll,{ids:['photo'],version:'scan'});assert.throws(()=>service.start(roll,{ids:['other'],version:'scan'}),/有效/);
  async function wait(id){for(let n=0;n<400;n++){const j=service.getJob(roll,id);if(['complete','cancelled'].includes(j.status))return j;await new Promise(r=>setTimeout(r,25));}throw new Error('job timeout');}
  const done=await wait(job.id);assert.equal(done.items[0].status,'no-face');assert.equal(photo.redEye.finished,undefined);assert.ok(saves>0);
  let rec=photo.redEye.scan;await service.edit(roll,photo,photo.versions[0],{revision:rec.revision,point:{x:60/160,y:.4,radius:.09}});rec=photo.redEye.scan;assert.ok(rec.regions[0].enabled);
  const regionId=rec.regions[0].id;await service.edit(roll,photo,photo.versions[0],{revision:rec.revision,point:{x:60/160,y:.4,radius:.09}});rec=photo.redEye.scan;assert.equal(rec.regions.length,1);assert.equal(rec.regions[0].id,regionId);
  await assert.rejects(service.edit(roll,photo,photo.versions[0],{revision:'stale',regions:[]}),/选区已变更/);
  const result=await service.rendered(photo,photo.versions[0]),rendered=await readCanonical(result);assert.ok(rendered.pixels[(40*160+60)*3]<50);assert.equal(await service.rendered(photo,photo.versions[0]),result);
  assert.equal(service.undo(roll,job.id).skipped,1);assert.ok(photo.redEye.scan.regions.length);service.undoPhoto(photo,photo.versions[0],{revision:rec.revision});assert.equal(photo.redEye.scan.regions.length,0);
  const cancelled=service.start(roll,{ids:['photo'],version:'finished'});service.cancel(roll,cancelled.id);assert.equal((await wait(cancelled.id)).status,'cancelled');assert.equal(photo.redEye.finished,undefined);
  await service.close();const jobs=JSON.parse(fs.readFileSync(path.join(root,'red-eye','jobs.json')));jobs.push({id:'resume',rollId:'roll',status:'running',processed:0,total:1,items:[{photoId:'photo',versionId:'finished',name:'resume',done:false}]});fs.writeFileSync(path.join(root,'red-eye','jobs.json'),JSON.stringify(jobs));service=createRedEyeService(options);assert.equal((await wait('resume')).items[0].status,'no-face');assert.ok(photo.redEye.finished);
  assert.equal(await sourceHash(source),hash);
});

test('P3 ICC、EXIF 归正与四向点选、BMP 和源文件覆盖保护',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'red-eye-colour-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'P3 扫描.tif'),target=path.join(root,'P3 修正.tif');
  await sharp(pixels(16),{raw:{width:160,height:100,channels:3}}).toColourspace('rgb16').withIccProfile('p3').tiff({compression:'deflate'}).toFile(source);
  const image=await readCanonical(source),record={sourceHash:await sourceHash(source),width:image.width,height:image.height,regions:[{x:.375,y:.4,rx:.05,ry:.07,enabled:true,strength:1}]};
  await renderCorrection(source,record,target);assert.deepEqual((await sharp(target).metadata()).icc,(await sharp(source).metadata()).icc);
  const output=await readCanonical(target);assert.equal(output.depth,16);for(let y=0;y<100;y++)for(let x=0;x<160;x++)if(Math.hypot((x-60)/8,(y-40)/7)>=1){const p=(y*160+x)*3;assert.deepEqual(output.pixels.slice(p,p+3),image.pixels.slice(p,p+3));}
  await assert.rejects(renderCorrection(source,record,source),/独立文件/);
  const exif=path.join(root,'EXIF.jpg');await sharp(pixels(),{raw:{width:160,height:100,channels:3}}).withMetadata({orientation:6}).jpeg({quality:100,chromaSubsampling:'4:4:4'}).toFile(exif);
  const upright=await readCanonical(exif);assert.equal(upright.width,100);assert.equal(upright.height,160);
  for(const rotation of [0,90,180,270]){const shown=toDisplay(.6,.375,rotation),point=fromDisplay(shown.x,shown.y,rotation),pupil=manualPupil(upright,{...point,radius:.09});assert.ok(Math.abs(pupil.x-.6)<.03&&Math.abs(pupil.y-.375)<.03);}
  const bmpFile=path.join(root,'BMP 原片.bmp'),abgr=Buffer.alloc(160*100*4),rgb=pixels();for(let p=0;p<160*100;p++){abgr[p*4]=255;abgr[p*4+1]=rgb[p*3+2];abgr[p*4+2]=rgb[p*3+1];abgr[p*4+3]=rgb[p*3];}fs.writeFileSync(bmpFile,bmp.encode({data:abgr,width:160,height:100}).data);
  const bmpImage=await readCanonical(bmpFile);assert.equal(bmpImage.depth,8);assert.ok(manualPupil(bmpImage,{x:.375,y:.4,radius:.09}).enabled);
});
