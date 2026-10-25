import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filmDefaults,filmPresentation} from '../public/film-canister.mjs';
import {canisterPhotos,findCanisterPhoto} from '../public/canister-photos.mjs';
import {filmStocks} from '../public/film-catalog.mjs';
import {ensureFilmImage,ensureReferenceImage} from '../film-images.mjs';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';

test('型号变更自动带入感光度并选择兼容画幅，同一型号别名保留已有曝光记录',()=>{
  assert.deepEqual(filmDefaults('乐凯200','',{format:''}),{iso:'200',format:'135'});
  assert.deepEqual(filmDefaults('Portra400','乐凯200',{format:'120'}),{iso:'400',format:'120'});
  assert.deepEqual(filmDefaults('乐凯200','',{format:'110'}),{iso:'200',format:'135'});
  assert.deepEqual(filmDefaults('乐凯200','Lucky C200',{iso:'800',format:'120'}),{});
  assert.deepEqual(filmDefaults('自定义卷','',{iso:'800'}),{});
  assert.deepEqual(filmDefaults('C200',''),{});
});

test('暗盒随型号变化、缺失及歧义型号回退默认、120 使用卷轴且历史参数优先',()=>{
  const lucky=filmPresentation({film:'乐凯200'});
  assert.equal(lucky.id,'lucky-c200');assert.equal(lucky.brand,'Lucky');assert.equal(lucky.iso,200);assert.equal(lucky.format,'135');
  assert.notEqual(lucky.photo.id,filmPresentation({film:'Portra400'}).photo.id);
  assert.equal(filmPresentation({film:'Ilford HP5 Plus 400'}).monochrome,true);
  const spool=filmPresentation({film:'Portra400',format:'120',iso:'800'});
  assert.equal(spool.spool,true);assert.equal(spool.iso,'800');
  for(const film of ['',undefined,'C200','我的自装卷'])assert.equal(filmPresentation({film}).id,'default');
  assert.equal(filmPresentation({film:'我的自装卷'}).name,'我的自装卷');
});

test('实拍素材按型号和画幅精确匹配，缺失型号使用无品牌暗盒并保留来源',()=>{
  assert.equal(findCanisterPhoto('lucky-c200','135').id,'lucky-c200-135');
  assert.equal(findCanisterPhoto('lucky-c200','120').id,'default-120');
  assert.equal(findCanisterPhoto('kodak-portra-400','120').id,'kodak-portra-400-120');
  assert.equal(findCanisterPhoto('foma-100','135').id,'default-135');
  assert.equal(findCanisterPhoto(null,'135').id,'default-135');
  assert.equal(new Set(canisterPhotos.map(p=>p.id)).size,canisterPhotos.length);
  for(const photo of canisterPhotos){
    assert.equal(new URL(photo.imageUrl).protocol,'https:');assert.equal(new URL(photo.source).protocol,'https:');
    if(photo.stockId)assert.ok(filmStocks.find(s=>s.id===photo.stockId)?.formats.includes(photo.format));
    const [x,y,w,h]=photo.bounds;assert.ok(x>=0&&y>=0&&w>0&&h>0&&x+w<=1.001&&y+h<=1.001);assert.ok(photo.aspect>0);
  }
});

test('暗盒照片与包装照片独立缓存，拒绝未知素材且断网复用缓存',async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-canister-')),originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});});
  const png=await sharp({create:{width:100,height:200,channels:3,background:'#eee'}}).png().toBuffer();let requests=0;
  globalThis.fetch=async()=>{requests++;return new Response(png);};
  const file=await ensureReferenceImage('lucky-c200-135',dir,canisterPhotos,'canister-images');
  assert.equal(requests,1);assert.equal(path.basename(path.dirname(file)),'canister-images');
  const box=await ensureFilmImage('lucky-c200',dir);assert.notEqual(file,box);assert.equal(requests,2);
  globalThis.fetch=()=>{throw new Error('offline');};
  assert.equal(await ensureReferenceImage('lucky-c200-135',dir,canisterPhotos,'canister-images'),file);
  await assert.rejects(ensureReferenceImage('../library',dir,canisterPhotos,'canister-images'),/不存在/);
});
