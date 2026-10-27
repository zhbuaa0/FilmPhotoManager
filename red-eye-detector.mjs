import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import sharp from 'sharp';
import {readCanonical,eightBit,sourceHash,redEyeEngine} from './red-eye-render.mjs';
import {findPupil} from './red-eye-mask.mjs';
import {fromDisplay} from './public/red-eye-coordinates.mjs';
import {openImage} from './image-preview.mjs';
const modelRoot=new URL('./models/red-eye/',import.meta.url);
let sessionPromise;
async function session(){
  if(!sessionPromise)sessionPromise=(async()=>{
    const manifest=JSON.parse(await fs.readFile(new URL('manifest.json',modelRoot),'utf8')),bytes=await fs.readFile(new URL(manifest.file,modelRoot));
    if(createHash('sha256').update(bytes).digest('hex')!==manifest.sha256)throw new Error('去红眼模型校验失败，请重新安装软件。');
    const ort=await import('onnxruntime-node');
    return {ort,net:await ort.InferenceSession.create(bytes,{executionProviders:['cpu'],intraOpNumThreads:2,interOpNumThreads:1})};
  })().catch(e=>{sessionPromise=null;throw new Error('本机去红眼模型无法加载：'+e.message);});
  return sessionPromise;
}
export function suppressFaces(faces,threshold=.3){
  const sorted=[...faces].sort((a,b)=>b.score-a.score),kept=[];
  for(const face of sorted){if(!kept.some(other=>{const area=Math.max(0,Math.min(face.x+face.w,other.x+other.w)-Math.max(face.x,other.x))*Math.max(0,Math.min(face.y+face.h,other.y+other.h)-Math.max(face.y,other.y));return area/(face.w*face.h+other.w*other.h-area)>threshold;}))kept.push(face);if(kept.length===200)break;}
  return kept;
}
export function decodeYuNet(output,width,height,threshold=.8){
  const faces=[];
  for(const stride of [8,16,32]){
    const cls=output['cls_'+stride].data,obj=output['obj_'+stride].data,boxes=output['bbox_'+stride].data,points=output['kps_'+stride].data,cols=width/stride,rows=height/stride;
    for(let j=0;j<rows;j++)for(let i=0;i<cols;i++){
      const n=j*cols+i,score=Math.sqrt(Math.max(0,Math.min(1,cls[n]))*Math.max(0,Math.min(1,obj[n])));if(score<threshold)continue;
      const w=Math.exp(boxes[n*4+2])*stride,h=Math.exp(boxes[n*4+3])*stride,x=(i+boxes[n*4])*stride-w/2,y=(j+boxes[n*4+1])*stride-h/2;
      const eyes=[0,1].map(k=>({x:(i+points[n*10+k*2])*stride,y:(j+points[n*10+k*2+1])*stride}));
      if([x,y,w,h,...eyes.flatMap(p=>[p.x,p.y])].every(Number.isFinite)&&w>4&&h>4)faces.push({x,y,w,h,score,eyes});
    }
  }
  return suppressFaces(faces);
}
async function detectTile(rgb,width,height){
  const {net,ort}=await session(),w=Math.ceil(width/32)*32,h=Math.ceil(height/32)*32,plane=w*h,input=new Float32Array(plane*3);
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){const p=y*w+x,q=(y*width+x)*3;input[p]=rgb[q+2];input[plane+p]=rgb[q+1];input[2*plane+p]=rgb[q];}
  const outputs=await net.run({[net.inputNames[0]]:new ort.Tensor('float32',input,[1,3,h,w])});return decodeYuNet(outputs,w,h);
}
export async function detectFaces(image,rotation=0){
  // The detector gets a colour-managed sRGB proxy; the master retains source RGB samples.
  const input=image.source?await openImage(image.source):sharp(eightBit(image),{raw:{width:image.width,height:image.height,channels:3}});
  const small=await input.autoOrient().rotate(rotation).resize({width:1600,height:1600,fit:'inside',withoutEnlargement:true}).flatten({background:'#fff'}).removeAlpha().withIccProfile('srgb').toColourspace('srgb').raw().toBuffer({resolveWithObject:true});
  const {width,height}=small.info,faces=[];
  const overview=await sharp(small.data,{raw:{width,height,channels:3}}).resize({width:640,height:640,fit:'inside',withoutEnlargement:true}).raw().toBuffer({resolveWithObject:true}),scale=overview.info.width/width;
  for(const face of await detectTile(overview.data,overview.info.width,overview.info.height))faces.push({...face,x:face.x/scale,y:face.y/scale,w:face.w/scale,h:face.h/scale,eyes:face.eyes.map(p=>({x:p.x/scale,y:p.y/scale}))});
  if(Math.max(width,height)>640){
    const xs=[],ys=[];for(let x=0;;x+=480){const next=Math.min(x,Math.max(0,width-640));if(!xs.includes(next))xs.push(next);if(next+640>=width)break;}for(let y=0;;y+=480){const next=Math.min(y,Math.max(0,height-640));if(!ys.includes(next))ys.push(next);if(next+640>=height)break;}
    for(const y of ys)for(const x of xs){const tile=await sharp(small.data,{raw:{width,height,channels:3}}).extract({left:x,top:y,width:Math.min(640,width-x),height:Math.min(640,height-y)}).raw().toBuffer({resolveWithObject:true});for(const f of await detectTile(tile.data,tile.info.width,tile.info.height))faces.push({...f,x:f.x+x,y:f.y+y,eyes:f.eyes.map(p=>({x:p.x+x,y:p.y+y}))});}
  }
  return suppressFaces(faces).map(f=>({...f,eyes:f.eyes.map(p=>{const point=fromDisplay(p.x/width,p.y/height,rotation);return {x:point.x*image.width,y:point.y*image.height};})}));
}
export async function analyseRedEye(source,{rotation=0}={}){
  const hash=await sourceHash(source),image=await readCanonical(source),faces=await detectFaces(image,rotation),rgb=eightBit(image),regions=[];let tiny=0;
  for(const face of faces){const distance=Math.hypot(face.eyes[0].x-face.eyes[1].x,face.eyes[0].y-face.eyes[1].y);if(distance<8){tiny++;continue;}
    for(const eye of face.eyes){const candidate=findPupil(rgb,image.width,image.height,{...eye,radius:Math.max(4,distance*.24),faceScore:face.score});if(candidate&&!regions.some(r=>Math.hypot((r.x-candidate.x)*image.width,(r.y-candidate.y)*image.height)<Math.max(r.rx*image.width,candidate.rx*image.width)))regions.push(candidate);}
  }
  if(await sourceHash(source)!==hash)throw new Error('检测过程中原文件已改变，请重试。');
  return {sourceHash:hash,width:image.width,height:image.height,depth:image.depth,engine:redEyeEngine,coordinateSystem:'exif-upright-v1',colourInterpretation:image.colourInterpretation,faces:faces.length,regions,status:regions.some(r=>r.enabled)?'corrected':regions.length||tiny?'review':faces.length?'clean':'no-face',note:!faces.length?'未识别人脸，无法确认是否存在红眼，可手动点选。':tiny?'部分眼部像素过少，请放大核对。':regions.some(r=>!r.enabled)?'有疑似红眼，请核对眼部选区。':!regions.length?'未检测到明显红眼。':'已生成可撤销的红眼修正。',checkedAt:new Date().toISOString()};
}
