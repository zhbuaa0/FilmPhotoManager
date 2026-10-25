import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import {execFile} from 'node:child_process';
import {promisify} from 'node:util';
import {fileURLToPath} from 'node:url';
import {copyOriginalFiles,planFileCopy,prepareFileDrop} from '../file-clipboard.mjs';
test('文件复制使用真实原图与版本，缺失文件或越权照片会阻止整批复制',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'clipboard-test-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  await fs.mkdir(path.join(root,'photos'));const original=path.join(root,'原片 &(1).tif'),finished=path.join(root,'成片.jpg');await fs.writeFile(original,'scan bytes');await fs.writeFile(finished,'finished bytes');
  const roll={photos:[{id:'p',name:'一帧',versions:[{id:'s',kind:'scan',source:original,name:'原片.tif'},{id:'f',kind:'finished',source:finished,name:'成片.jpg'}]}]};
  assert.equal((await planFileCopy(roll,['p'],'scan',root))[0].source,original);
  assert.equal((await planFileCopy(roll,['p'],'finished',root))[0].source,finished);
  await assert.rejects(planFileCopy(roll,['other'],'scan',root),/已变更/);
  await assert.rejects(planFileCopy(roll,['p','p'],'scan',root),/请选择/);
  await assert.rejects(planFileCopy(roll,['p'],'invalid',root),/显示版本/);
  let calls=0;
  await copyOriginalFiles(roll,['p'],'scan',root,{platform:'win32',execute:async(command,args,opts)=>{calls++;assert.equal(command,'powershell.exe');assert.ok(args.includes('-STA'));assert.equal(opts.windowsHide,true);const manifest=args.at(-1);assert.deepEqual(JSON.parse(await fs.readFile(manifest,'utf8')),[original]);}});
  await fs.unlink(original);
  await assert.rejects(copyOriginalFiles(roll,['p'],'scan',root,{platform:'win32',execute:async()=>calls++}),/原文件不可用/);assert.equal(calls,1);
  await assert.rejects(copyOriginalFiles(roll,['p'],'scan',root,{platform:'linux'}),/Windows/);
});
test('UUID 保存的原图以原文件名提供，重名和 Windows 非法文件名安全处理',async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'clipboard-names-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const source=path.join(root,'uuid.jpg');await fs.writeFile(source,'original untouched bytes');
  const result=await prepareFileDrop([{source,name:'../原图.jpg',owned:true},{source,name:'原图.jpg',owned:true},{source,name:'CON.jpg',owned:true}],root);
  assert.deepEqual(result.map(p=>path.basename(p)),['原图.jpg','原图 (2).jpg','_CON.jpg']);
  for(const file of result)assert.equal(await fs.readFile(file,'utf8'),'original untouched bytes');
  assert.equal(await fs.readFile(source,'utf8'),'original untouched bytes');
});
test('Windows STA helper preserves separate Unicode file entries for one or several originals',{skip:process.platform!=='win32'},async t=>{
  const root=await fs.mkdtemp(path.join(os.tmpdir(),'clipboard-native-'));t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const files=['胶片 &(1).jpg','第二帧.tif'].map(name=>path.join(root,name));for(const file of files)await fs.writeFile(file,'test');
  const manifest=path.join(root,'files.json'),script=fileURLToPath(new URL('../native/copy-files.ps1',import.meta.url));
  for(const subset of [files,files.slice(0,1)]){
    await fs.writeFile(manifest,JSON.stringify(subset),'utf8');
    const {stdout}=await promisify(execFile)('powershell.exe',['-NoProfile','-NonInteractive','-STA','-ExecutionPolicy','Bypass','-File',script,'-Manifest',manifest,'-ValidateOnly'],{windowsHide:true});
    assert.equal(Number(stdout.trim()),subset.length);
  }
});
