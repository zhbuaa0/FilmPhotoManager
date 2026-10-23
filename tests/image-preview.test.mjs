import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import sharp from 'sharp';
import {makePreview} from '../local-import.mjs';

// Handwritten 24-bit BMP with row padding and distinct top/bottom colours.
export function bitmap() {
  const width=31,height=20,stride=Math.ceil(width*3/4)*4,b=Buffer.alloc(54+stride*height);
  b.write('BM');b.writeUInt32LE(b.length,2);b.writeUInt32LE(54,10);b.writeUInt32LE(40,14);
  b.writeInt32LE(width,18);b.writeInt32LE(height,22);b.writeUInt16LE(1,26);b.writeUInt16LE(24,28);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const at=54+y*stride+x*3;b[at]=y<10?240:10;b[at+1]=30;b[at+2]=y<10?10:240;
  }
  return b;
}
test('BMP 转 JPEG 保留颜色、上下方向和原图；缩放不放大，旋转可在 Windows 运行',async t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-bmp-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const source=path.join(root,'中文扫描.BMP'),target=path.join(root,'preview.jpg'),original=bitmap();fs.writeFileSync(source,original);
  await makePreview(source,target);
  const meta=await sharp(target).metadata();assert.equal(meta.width,31);assert.equal(meta.height,20);
  const {data,info}=await sharp(target).raw().toBuffer({resolveWithObject:true});
  const top=3*info.width*info.channels,bottom=16*info.width*info.channels;
  assert.ok(data[top]>200&&data[top+2]<50);assert.ok(data[bottom]<50&&data[bottom+2]>200);
  await makePreview(source,target,1600,90);const rotated=await sharp(target).metadata();assert.equal(rotated.width,20);assert.equal(rotated.height,31);
  await makePreview(source,target,10);const small=await sharp(target).metadata();assert.equal(small.width,10);assert.ok(small.height<=10);
  assert.deepEqual(fs.readFileSync(source),original);
  await assert.rejects(makePreview(source,source),/独立文件/);assert.deepEqual(fs.readFileSync(source),original);
  fs.writeFileSync(source,'broken BMP');await assert.rejects(makePreview(source,target),/无法解码/);assert.equal(fs.existsSync(target),false);
});
