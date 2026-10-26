import {test} from 'node:test';
import assert from 'node:assert/strict';
import {cameraMetadata,resolveRollCamera} from '../camera-records.mjs';
import {cameraPresets} from '../public/camera-presets.mjs';
import {cameraPhotos,inferCameraPhoto} from '../public/camera-photos.mjs';

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
test('参考图匹配正确机身与 STM 镜头，变焦 U2 和数码 EOS 300D 不混用',()=>{
  assert.equal(cameraPhotos(cameraPresets[0])[0].key,'olympus-mju-ii');
  assert.deepEqual(cameraPhotos(cameraPresets[1]).map(p=>p.key),['canon-kiss-iii','canon-ef-50-stm']);
  assert.equal(cameraPhotos({...cameraPresets[1],lens:'EF 50mm f/1.8 II'}).length,1);
  assert.equal(inferCameraPhoto({...cameraPresets[0],model:'mju-II Zoom 80'}),'');
  assert.equal(inferCameraPhoto({...cameraPresets[0],model:'mju-III'}),'');
  assert.equal(inferCameraPhoto({model:'EOS 300D'}),'');assert.equal(inferCameraPhoto({model:'EOS Kiss III L'}),'');
  assert.deepEqual(cameraPhotos({...cameraPresets[0],photoChoice:'none'}),[]);
  assert.deepEqual(cameraPhotos({photoChoice:'custom',photo:'../../library.json'}),[]);
  assert.equal(cameraPhotos({photoChoice:'custom',photo:'1234-abcd.jpg'})[0].personal,true);
  assert.throws(()=>cameraMetadata({name:'test',model:'test',photoChoice:'https://unknown.example/photo'},[]),/预览图/);
  const disposable=cameraPresets.filter(c=>c.type==='一次性胶卷机');
  assert.deepEqual(disposable.map(c=>cameraPhotos(c)[0]?.key),['fujifilm-quicksnap','kodak-funsaver']);
  assert.equal(inferCameraPhoto({model:'QuickSnap Waterproof'}),'');
  assert.equal(inferCameraPhoto({model:'QuickSnap Flash 400 Black and White'}),'');
  assert.equal(inferCameraPhoto({model:'QuickSnap Active'}),'');
  assert.equal(inferCameraPhoto({model:'FunSaver TRI-X'}),'');
});
