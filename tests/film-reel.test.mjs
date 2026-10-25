import {test} from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import sharp from 'sharp';
import {cassetteArt,reelDimensions,reelExposure,reelScroll} from '../public/film-reel.mjs';
import {filmPresentation} from '../public/film-canister.mjs';

test('按同一物理比例对齐出片口两端，135 窗口为 36×24，窄屏仍能展开完整首帧',()=>{
  for(const width of [280,320,390,720,1000,1600])for(const art of Object.values(cassetteArt)){
    const format=art===cassetteArt.spool?'120':'135',d=reelDimensions({width,art,format});
    assert.ok(Math.abs(d.portY+d.filmHeight-(d.padding+art.outlet.bottom*d.scale))<1e-8);
    assert.ok(d.portX+d.pitch+d.tip<=width-d.padding);
    assert.ok(d.portY>=d.padding&&d.portY+d.filmHeight<=d.artHeight+d.padding);
    if(format==='135'){assert.ok(Math.abs(d.frameWidth/d.windowHeight-1.5)<1e-9);assert.ok(Math.abs(d.pitch/d.filmHeight-38/35)<1e-9);assert.equal(d.perforated,true);}
    else assert.equal(d.perforated,false);
  }
});

test('拉出向右移动、回卷反向收回，首尾钳制且窗口变化保留展开进度',()=>{
  for(const count of [0,1,2,36])for(const width of [320,1400]){
    const d=reelDimensions({width}),viewport=width-d.portX,spacer=Math.max(0,viewport-d.pitch-d.tip),maximum=Math.max(0,count*d.pitch+d.tip+spacer-viewport);
    for(const progress of [0,.25,1,3.5,35,100]){
      const left=reelScroll(progress,maximum,d.pitch,count),expected=Math.max(0,Math.min(Math.max(0,count-1),progress));
      assert.ok(Math.abs(reelExposure(left,maximum,d.pitch,count)-expected)<1e-8);
    }
    assert.ok(reelScroll(1,maximum,d.pitch,count)<=reelScroll(0,maximum,d.pitch,count));
  }
});

test('生成素材带真实 alpha，换型号复用统一平视结构，未设型号显示无标识黑暗盒',async()=>{
  for(const art of Object.values(cassetteArt)){
    const bytes=fs.readFileSync(new URL('../public/assets/film-reel/'+art.file,import.meta.url)),metadata=await sharp(bytes).metadata();
    assert.equal(metadata.width,art.width);assert.equal(metadata.height,art.height);assert.equal(metadata.hasAlpha,true);
    const {data,info}=await sharp(bytes).ensureAlpha().raw().toBuffer({resolveWithObject:true});
    const alpha=(x,y)=>data[(y*info.width+x)*4+3];
    assert.equal(alpha(0,0),0);assert.ok(alpha(Math.round(art.outlet.x),(art.outlet.top+art.outlet.bottom)>>1)>100);
  }
  assert.equal(filmPresentation({film:'乐凯200'}).art,cassetteArt.lucky);
  assert.equal(filmPresentation({film:'Portra400'}).art,cassetteArt.label);
  assert.equal(filmPresentation({film:'自装卷'}).art,cassetteArt.default);
  assert.equal(filmPresentation({}).art,cassetteArt.default);
  assert.equal(filmPresentation({film:'Portra400',format:'120'}).art,cassetteArt.spool);
});
