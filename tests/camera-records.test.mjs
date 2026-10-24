import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraMetadata,resolveRollCamera} from '../camera-records.mjs';
import {cameraPresets} from '../public/camera-presets.mjs';

test('相机登记验证、资料链接和用户确认的 STM 模板',()=>{
  for(const preset of cameraPresets){const record=cameraMetadata(preset,[]);assert.equal(record.format,'135');assert.ok(record.sources.length);}
  assert.match(cameraPresets[1].lens,/STM/);assert.equal(cameraPresets[0].power,'CR123A / DL123A × 1');
  assert.throws(()=>cameraMetadata({name:'',model:'test'},[]),/显示名称/);
  assert.throws(()=>cameraMetadata({name:'test',model:'test',sources:'javascript:alert(1)'},[]),/HTTP/);
  assert.throws(()=>cameraMetadata({name:'test',model:'test',sources:'https://user:secret@example.com'},[]),/账号密码/);
  assert.throws(()=>cameraMetadata({name:'test',model:'test',purchasedAt:'2025-02-30'},[]),/购入日期/);
  assert.throws(()=>cameraMetadata({name:'test',model:'test',releaseYear:'199'},[]),/四位/);
  const cameras=[{id:'camera',name:'My Camera'}];
  assert.throws(()=>cameraMetadata({name:'my camera',model:'test'},cameras),/已登记/);
  assert.deepEqual(resolveRollCamera({camera:'历史相机'},cameras),{camera:'历史相机',cameraId:''});
  assert.deepEqual(resolveRollCamera({camera:'My Camera'},cameras),{camera:'My Camera',cameraId:'camera'});
  assert.deepEqual(resolveRollCamera({cameraId:'camera',camera:'旧名称'},cameras),{camera:'My Camera',cameraId:'camera'});
  assert.throws(()=>resolveRollCamera({cameraId:'missing'},cameras),/重新选择/);
});
