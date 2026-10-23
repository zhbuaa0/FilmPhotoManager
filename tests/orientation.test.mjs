import { test } from 'node:test';
import assert from 'node:assert/strict';
import { classifyOrientation, applyOrientationDecisions, undoOrientationDecisions } from '../orientation.mjs';
const candidates=()=>[0,90,180,270].map(angle=>({angle,faceScore:0,faces:0,faceWeight:0,textScore:0,textLines:0,textChars:0}));
test('只有明确证据给出方向，冲突与弱证据保留人工确认',()=>{
  let c=candidates();assert.equal(classifyOrientation(c).angle,null);
  c[3]={...c[3],faceScore:0.8,faceWeight:0.02,faces:1};assert.equal(classifyOrientation(c).angle,270);
  c[1]={...c[1],faceScore:0.7,faceWeight:0.02,faces:1};assert.equal(classifyOrientation(c).reliable,false);
  c=candidates();c[1]={...c[1],textScore:16,textLines:2,textChars:18};assert.equal(classifyOrientation(c).angle,90);
  c[0]={...c[0],faceScore:0.6,faces:1,faceWeight:0.02};assert.match(classifyOrientation(c).reason,/不一致/);
  c=candidates();c[2]={...c[2],textScore:5,textLines:1,textChars:5};assert.equal(classifyOrientation(c).angle,null);
});
test('整批校验后应用、撤销恢复，保留之后的手动修改',()=>{
  const roll={photos:[{id:'a',starred:true,orientationCheck:{scanId:'s',angle:270,reliable:true}},{id:'b',rotation:90,rotationSource:'manual',rotationRevision:2,orientationCheck:{scanId:'s',angle:180,reliable:true}}]};
  const a={photoId:'a',rotation:270,expectedRotation:0,expectedRevision:0},b={photoId:'b',rotation:180,expectedRotation:90,expectedRevision:2};
  assert.throws(()=>applyOrientationDecisions(roll,[a,{...b,expectedRevision:1}],'s'),/已被调整/);assert.equal(roll.photos[0].rotation,undefined);
  assert.equal(applyOrientationDecisions(roll,[a,b],'s'),2);assert.equal(roll.photos[0].starred,true);
  roll.photos[1].rotation=180;roll.photos[1].rotationRevision++;roll.photos[1].rotationSource='manual';
  assert.deepEqual(undoOrientationDecisions(roll),{restored:1,skipped:1});assert.equal(roll.photos[0].rotation,0);assert.equal(roll.photos[1].rotation,180);assert.equal(roll.photos[1].rotationSource,'manual');
  assert.throws(()=>applyOrientationDecisions(roll,[a,a],'s'),/重复/);
});
