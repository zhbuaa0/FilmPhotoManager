import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {findExactDuplicates} from '../duplicate-files.mjs';
import {inspectFolder} from '../local-import.mjs';

test('完整文件校验保留非副本名称，保留内容不同但采样相同的文件',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-dedup-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const original=path.join(root,'frame.jpg'),copy=path.join(root,'frame(1).jpg'),edited=path.join(root,'edited.jpg');
  const bytes=Buffer.alloc(1024*1024,17),different=Buffer.from(bytes);different[256*1024]=18;
  fs.writeFileSync(original,bytes);fs.writeFileSync(copy,bytes);fs.writeFileSync(edited,different);
  const duplicates=findExactDuplicates([copy,edited,original]);assert.equal(duplicates.length,1);
  assert.equal(duplicates[0].file,copy);assert.equal(duplicates[0].kept,original);
  assert.deepEqual(fs.readFileSync(original),bytes);assert.deepEqual(fs.readFileSync(copy),bytes);assert.deepEqual(fs.readFileSync(edited),different);
});

test('错改后缀的副本保留扫描原片，检查目录时逐卷去重且保留真正成片',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-dedup-roll-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const a=path.join(root,'00001000'),b=path.join(root,'00001001');fs.mkdirSync(a);fs.mkdirSync(b);
  const scan=path.join(a,'frame.tif'),copy=path.join(a,'frame - 副本.jpg'),finished=path.join(a,'frame.jpg');
  fs.writeFileSync(scan,'scan bytes');fs.writeFileSync(copy,'scan bytes');fs.writeFileSync(finished,'edit bytes');fs.writeFileSync(path.join(b,'frame.tif'),'scan bytes');
  assert.equal(findExactDuplicates([copy,scan])[0].kept,scan);
  const plan=inspectFolder(root);assert.equal(plan.rolls.length,2);assert.equal(plan.frames,2);assert.equal(plan.versions,3);assert.equal(plan.duplicates,1);
  assert.equal(plan.rolls[0].frames[0].variants.length,2);assert.match(plan.warnings.join(' '),/SHA-256/);
  assert.ok(fs.existsSync(copy));assert.equal(inspectFolder(root).duplicates,1);
});
