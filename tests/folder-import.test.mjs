import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {inspectFolder} from '../local-import.mjs';

test('按日期编号拆卷，忽略根目录拼图和汇总副本，保留索引备注与前导零',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-archive-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const name of ['2026.04.25_0013_00939','2026.05.12_0014_a01225','汇总文件夹','.claude'])fs.mkdirSync(path.join(root,name));
  const write=(file,value='scan')=>fs.writeFileSync(path.join(root,file),value);
  write('2026.04.25_0013_00939/scan.BMP');write('2026.05.12_0014_a01225/scan.TIF');
  write('2026.05.12_0014_a01225/scan.THM');write('collage.jpg');write('汇总文件夹/duplicate.BMP');write('.claude/private.jpg');
  write('film_index.csv','\uFEFF日期,一级ID,二级ID,备注\r\n2026.04.25,0013,00939,"有漏光, 需核对"\r\n2026.05.10,0014,a01225,"两行\n备注"\r\n');
  const plan=inspectFolder(`"${root}"`);
  assert.equal(plan.frames,2);assert.equal(plan.versions,2);assert.equal(plan.rolls.length,2);
  assert.deepEqual(plan.rolls.map(r=>r.number),['0013','0014']);
  assert.match(plan.rolls[0].notes,/有漏光, 需核对/);assert.match(plan.rolls[0].notes,/00939/);
  assert.match(plan.rolls[1].notes,/目录日期：2026.05.12/);assert.match(plan.rolls[1].notes,/索引日期：2026.05.10/);
  assert.match(plan.rolls[1].notes,/两行\n备注/);assert.equal(plan.warnings.length,2);
  assert.equal(inspectFolder(root,{includeAggregates:true}).frames,3);
  assert.equal(inspectFolder(path.join(root,'2026.04.25_0013_00939')).frames,1);
});

test('跨后期目录按唯一 XMP 关联重命名原片，歧义文件保持独立',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-xmp-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  const scan='2026.01.06_00000999',edits='2025.06.23_后期';
  for(const name of [scan,edits])fs.mkdirSync(path.join(root,name));
  fs.writeFileSync(path.join(root,scan,scan+'_000009990001.TIF'),'scan');
  fs.writeFileSync(path.join(root,edits,'edit.jpg'),'<x:xmpmeta xmpMM:PreservedFileName="000009990001.tif"/>');
  let plan=inspectFolder(root);
  assert.equal(plan.rolls.length,1);assert.equal(plan.rolls[0].number,'00000999');assert.equal(plan.frames,1);assert.equal(plan.versions,2);
  assert.equal(plan.rolls[0].frames[0].variants[1].kind,'finished');assert.equal(plan.rolls[0].paired,1);
  assert.equal(plan.bytes,plan.rolls[0].frames[0].variants.reduce((n,v)=>n+fs.statSync(v.path).size,0));
  const other='2026.01.07_00001000';fs.mkdirSync(path.join(root,other));
  fs.writeFileSync(path.join(root,other,other+'_000009990001.TIF'),'scan');
  plan=inspectFolder(root);assert.equal(plan.frames,3);assert.equal(plan.rolls.find(r=>r.number==='后期').paired,0);
});

test('同编号多目录在检查阶段提示冲突',t=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-conflict-'));
  t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
  for(const name of ['2026.01.01_0013','2026.01.02_0013']){fs.mkdirSync(path.join(root,name));fs.writeFileSync(path.join(root,name,'scan.bmp'),'scan');}
  assert.throws(()=>inspectFolder(root),/同一胶卷编号 0013/);
});
