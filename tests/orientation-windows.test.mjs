import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {createTextDetector,summarizeText} from '../orientation-text.mjs';
import {classifyLocalOrientation,windowsFaceCapabilities,detectWindowsFaces} from '../orientation-windows.mjs';
import {createOrientationDetector,getOrientationCapabilities} from '../orientation.mjs';
const empty=()=>[0,90,180,270].map(angle=>({angle,faces:0,faceWeight:0,textScore:0,textLines:0,textChars:0,textConfidence:0}));
test('Windows 方向判断只采用明确的人脸或文字证据，冲突留待确认',()=>{
  let c=empty();assert.equal(classifyLocalOrientation(c).angle,null);
  c[3]={...c[3],faces:3,faceWeight:0.05};assert.equal(classifyLocalOrientation(c,{faceAvailable:true}).angle,270);
  assert.equal(classifyLocalOrientation(c,{faceAvailable:false}).angle,null);
  c[1]={...c[1],faces:2,faceWeight:0.03};assert.equal(classifyLocalOrientation(c,{faceAvailable:true}).angle,null);
  c=empty();c[0]={...c[0],faces:1,faceWeight:0.003};assert.equal(classifyLocalOrientation(c,{faceAvailable:true}).angle,null);
  c=empty();c[1]={...c[1],textScore:20,textLines:2,textChars:24,textConfidence:94};assert.equal(classifyLocalOrientation(c).angle,90);
  c[0]={...c[0],faces:2,faceWeight:0.05};assert.match(classifyLocalOrientation(c,{faceAvailable:true}).reason,/不一致/);
  c=empty();c[2]={...c[2],textScore:20,textLines:1,textChars:24,textConfidence:94};assert.equal(classifyLocalOrientation(c).angle,null);
  c[2].textLines=2;c[2].textConfidence=79;assert.equal(classifyLocalOrientation(c).angle,null);
  c[2].textConfidence=94;c[0]={...c[2],angle:0,textScore:18};assert.equal(classifyLocalOrientation(c).angle,null);
  assert.equal(classifyLocalOrientation([c[0],c[0],c[2],c[3]]).angle,null);
});
test('OCR 忽略低置信度、单字母噪点与倾斜基线',()=>{
  const word=(text,confidence,baseline)=>({text,confidence,baseline});
  const blocks=[{paragraphs:[{lines:[{words:[word('ARCHIVE',96),word('noise',50),word('X',99),word('TILTED',99,{x0:0,x1:10,y0:0,y1:20})]},{words:[word('胶片档案',90)]}]}]}];
  const result=summarizeText(blocks);assert.equal(result.textLines,2);assert.equal(result.textChars,11);assert.ok(result.textConfidence>90);
});
test('离线 OCR 实际识别四个旋转方向、空白图与 EXIF，原文件保持不变',{timeout:120000},async t=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'lightbox-ocr-'));
  const detector=createTextDetector(dir);t.after(async()=>{await detector.close();fs.rmSync(dir,{recursive:true,force:true});});
  const lines=['LIGHTBOX FILM ARCHIVE','WINDOWS ORIENTATION CHECK','PLEASE KEEP THIS TEXT UPRIGHT','AUTOMATIC LOCAL PHOTO REVIEW'];
  const svg=Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="560"><rect width="1000" height="560" fill="white"/><g fill="black" font-family="Arial,DejaVu Sans,sans-serif" font-size="46">${lines.map((line,i)=>`<text x="45" y="${100+i*110}">${line}</text>`).join('')}</g></svg>`);
  const upright=await sharp(svg).png().toBuffer();
  for(const angle of [0,90,180,270]) {
    const file=path.join(dir,`方向-${angle}.png`);await sharp(upright).rotate(angle).png().toFile(file);
    const before=fs.readFileSync(file),c=await detector.analyze(file),result=classifyLocalOrientation(c);
    assert.equal(result.angle,(360-angle)%360,JSON.stringify(c));assert.equal(result.method,'text');assert.deepEqual(fs.readFileSync(file),before);
  }
  const blank=path.join(dir,'blank.png');await sharp({create:{width:400,height:300,channels:3,background:'white'}}).png().toFile(blank);
  assert.equal(classifyLocalOrientation(await detector.analyze(blank)).angle,null);
  const exif=path.join(dir,'exif.jpg');await sharp(upright).rotate(270).withMetadata({orientation:6}).jpeg().toFile(exif);
  assert.equal(classifyLocalOrientation(await detector.analyze(exif)).angle,0);
  if(process.platform==='win32') {
    const capabilities=await getOrientationCapabilities();assert.equal(capabilities.automaticOrientation,true);assert.match(capabilities.engineId,/windows/);
    const native=await windowsFaceCapabilities();assert.equal(typeof native.face,'boolean');
    const faceResult=await detectWindowsFaces(blank);assert.equal(faceResult.faceAvailable,native.face);
    if(native.face){assert.equal(faceResult.candidates.length,4);assert.ok(faceResult.candidates.every(c=>c.faces===0));}
    const full=createOrientationDetector(dir);try {
      const before=createHash('sha256').update(fs.readFileSync(exif)).digest('hex');
      assert.equal((await full.detect(exif)).angle,0);
      assert.equal(createHash('sha256').update(fs.readFileSync(exif)).digest('hex'),before);
    } finally {await full.close();}
    assert.equal(fs.readdirSync(path.join(dir,'tools')).some(name=>/^orientation-.*\.png$/.test(name)),false);
  }
});
