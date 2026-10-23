import fs from 'node:fs';
import path from 'node:path';
import sharp from 'sharp';
import bmp from 'bmp-js';

export async function makePreview(source,target,maxSize=1600,rotation=0) {
  if(!Number.isInteger(maxSize)||maxSize<1||![0,90,180,270].includes(rotation))throw new Error('预览尺寸或旋转角度无效。');
  if(path.resolve(source)===path.resolve(target))throw new Error('预览图必须保存到独立文件，原文件未改动。');
  try {
    let image;
    if(path.extname(source).toLowerCase()==='.bmp') {
      const buffer=await fs.promises.readFile(source);
      if(buffer.length<54||buffer.toString('ascii',0,2)!=='BM')throw new Error('Invalid BMP');
      const width=buffer.readInt32LE(18),height=Math.abs(buffer.readInt32LE(22));
      if(width<=0||height<=0||width*height>100_000_000)throw new Error('BMP dimensions exceed limit');
      const decoded=bmp.decode(buffer),rgb=Buffer.alloc(decoded.width*decoded.height*3);
      // bmp-js returns ABGR, including an unused alpha byte for 24-bit scans.
      for(let src=0,dst=0;src<decoded.data.length;src+=4){rgb[dst++]=decoded.data[src+3];rgb[dst++]=decoded.data[src+2];rgb[dst++]=decoded.data[src+1];}
      image=sharp(rgb,{raw:{width:decoded.width,height:decoded.height,channels:3}});
    } else image=sharp(source,{limitInputPixels:100_000_000});
    await image.autoOrient().rotate(rotation).resize({width:maxSize,height:maxSize,fit:'inside',withoutEnlargement:true}).flatten({background:'#ffffff'}).toColourspace('srgb').jpeg({quality:88}).toFile(target);
  } catch {
    fs.rmSync(target,{force:true});
    throw new Error('照片无法解码或超出尺寸限制，原文件未改动。');
  }
}
