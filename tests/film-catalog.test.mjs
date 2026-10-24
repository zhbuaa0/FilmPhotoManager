import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {filmStocks,findFilmStock,filterFilmStocks,filmSelection} from '../public/film-catalog.mjs';
import {ensureFilmImage} from '../film-images.mjs';
test('胶卷型号库区分同感光度产品、中文别名、XP2 工艺、规格与范围感光度',()=>{
  assert.ok(filmStocks.length>=50);assert.equal(new Set(filmStocks.map(f=>f.id)).size,filmStocks.length);
  for(const f of filmStocks){assert.match(f.id,/^[a-z0-9-]+$/);assert.ok(f.formats.length);assert.ok(f.iso>0);assert.equal(new URL(f.imageUrl).protocol,'https:');assert.equal(new URL(f.source).protocol,'https:');}
  assert.equal(findFilmStock('柯达金200').id,'kodak-gold-200');assert.equal(findFilmStock('Portra400').id,'kodak-portra-400');
  assert.notEqual(findFilmStock('Fujicolor C200').id,findFilmStock('Fujifilm 200').id);
  assert.equal(findFilmStock('Ilford XP2 Super 400').process,'C-41');assert.equal(findFilmStock('乐凯200').id,'lucky-c200');
  assert.equal(findFilmStock('乐凯C200').id,'lucky-c200');assert.equal(findFilmStock('C200'),null);
  assert.equal(findFilmStock('Fujicolor C200').id,'fuji-c200');assert.equal(findFilmStock('Lucky C200').process,'C-41');
  assert.deepEqual(filterFilmStocks({brand:'Lucky',kind:'color',iso:'200'}).map(f=>f.id),['lucky-c200']);
  assert.equal(findFilmStock('柯达400'),null);assert.equal(findFilmStock('富士业务400'),null);assert.equal(findFilmStock('5222'),null);
  assert.equal(filterFilmStocks({query:'富士 400',kind:'color'}).some(f=>f.brand==='Fujifilm'),true);
  assert.ok(filterFilmStocks({kind:'slide'}).every(f=>f.process==='E-6'));
  assert.ok(filterFilmStocks({format:'110'}).every(f=>f.formats.includes('110')));
  assert.ok(filterFilmStocks({brand:'Lomography',iso:'100'}).some(f=>f.id==='lomo-purple'));
  assert.equal(filterFilmStocks({query:'not-a-film-stock'}).length,0);
});
test('选用只修改型号、规格与用户同意的 ISO，支持保留迫冲等手填感光度',()=>{
  assert.deepEqual(filmSelection('kodak-portra-400',{format:'135',iso:'400'}),{film:'Kodak Portra 400',format:'135',iso:'400'});
  assert.deepEqual(filmSelection('lucky-c200',{format:'135',iso:'200'}),{film:'Lucky C200',format:'135',iso:'200'});
  assert.deepEqual(filmSelection('kodak-portra-400',{format:'120',fillIso:false}),{film:'Kodak Portra 400',format:'120'});
  assert.deepEqual(filmSelection('lomo-purple',{format:'110',iso:'200'}),{film:'Lomography LomoChrome Purple',format:'110',iso:'200'});
  assert.throws(()=>filmSelection('kodak-gold-200',{format:'110',iso:200}),/规格/);
  assert.throws(()=>filmSelection('kodak-gold-200',{format:'135',iso:800}),/ISO/);
  assert.throws(()=>filmSelection('missing',{format:'135',iso:100}),/不存在/);
});
test('参考图下载并发有上限、同图复用、本机缓存支持离线且不接受任意路径',{timeout:15000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-film-images-')),originalFetch=globalThis.fetch;
  t.after(()=>{globalThis.fetch=originalFetch;fs.rmSync(dir,{recursive:true,force:true});});
  const png=await sharp({create:{width:90,height:60,channels:3,background:'#d5b46c'}}).png().toBuffer();let requests=0,active=0,peak=0;
  globalThis.fetch=async()=>{requests++;active++;peak=Math.max(peak,active);await new Promise(r=>setTimeout(r,20));active--;return new Response(png);};
  const ids=filmStocks.slice(0,8).map(f=>f.id),paths=await Promise.all([...ids,ids[0],ids[0]].map(id=>ensureFilmImage(id,dir)));
  assert.equal(requests,8);assert.ok(peak<=4);assert.equal(paths[0],paths[8]);
  assert.equal((await sharp(fs.readFileSync(paths[0])).metadata()).format,'jpeg');
  globalThis.fetch=()=>{throw new Error('offline');};assert.equal(await ensureFilmImage(ids[0],dir),paths[0]);
  await assert.rejects(ensureFilmImage('../library',dir),/不存在/);
  let attempts=0;globalThis.fetch=async()=>{attempts++;if(attempts===1)throw new TypeError('transient connection reset');return new Response(png);};
  assert.ok(await ensureFilmImage(filmStocks[8].id,dir));assert.equal(attempts,2);
  assert.ok(fs.readdirSync(path.join(dir,'film-images')).every(name=>name.endsWith('.jpg')));
});
