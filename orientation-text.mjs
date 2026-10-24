import fs from 'node:fs';
import path from 'node:path';
import {createRequire} from 'node:module';
import {randomUUID} from 'node:crypto';
import sharp from 'sharp';
import {createWorker,PSM} from 'tesseract.js';
const require=createRequire(import.meta.url);

export function summarizeText(blocks) {
  let textScore=0,textChars=0,textLines=0,weightedConfidence=0;
  for(const block of blocks||[])for(const paragraph of block.paragraphs||[])for(const line of paragraph.lines||[]) {
    let chars=0,score=0,confidenceWeight=0;
    for(const word of line.words||[]) {
      const confidence=Number(word.confidence),text=String(word.text||''),length=(text.match(/[\p{L}\p{N}]/gu)||[]).length;
      if(!Number.isFinite(confidence)||confidence<80||!length||(!/[\p{Script=Han}]/u.test(text)&&length<2))continue;
      const baseline=word.baseline||line.baseline;
      if(baseline&&Math.abs(baseline.y1-baseline.y0)>Math.abs(baseline.x1-baseline.x0)*0.45)continue;
      chars+=length;score+=length*(confidence/100)**2;confidenceWeight+=length*confidence;
    }
    if(chars>=3){textLines++;textChars+=chars;textScore+=score*Math.min(1,30/chars);weightedConfidence+=confidenceWeight;}
  }
  return {textScore,textChars,textLines,textConfidence:textChars?weightedConfidence/textChars:0};
}

function prepareLanguages(dataDir) {
  const langPath=path.join(dataDir,'tools','ocr','languages'),cachePath=path.join(dataDir,'tools','ocr','cache');
  fs.mkdirSync(langPath,{recursive:true});fs.mkdirSync(cachePath,{recursive:true});
  for(const language of ['eng','chi_sim']) {
    const source=path.join(path.dirname(require.resolve(`@tesseract.js-data/${language}/package.json`)),'4.0.0_best_int',`${language}.traineddata.gz`),target=path.join(langPath,`${language}.traineddata.gz`);
    if(!fs.existsSync(target)||fs.statSync(target).size!==fs.statSync(source).size){const temporary=target+'.'+randomUUID()+'.tmp';try{fs.copyFileSync(source,temporary);fs.renameSync(temporary,target);}finally{fs.rmSync(temporary,{force:true});}}
  }
  return {langPath,cachePath};
}

export function createTextDetector(dataDir) {
  let pending=null,worker=null,closed=false,failure=null;
  async function getWorker() {
    if(closed)throw new Error('本机识别引擎已关闭。');
    if(!pending)pending=(async()=>{
      worker=await createWorker(['eng','chi_sim'],1,{...prepareLanguages(dataDir),logger:()=>{},errorHandler:()=>{}});
      await worker.setParameters({tessedit_pageseg_mode:PSM.SPARSE_TEXT,preserve_interword_spaces:'1'});
      return worker;
    })();
    return pending;
  }
  return {
    async analyze(file) {
      if(failure)throw failure;
      try {
      // Buffer input avoids libvips file-cache locks on Windows (notably EXIF JPEGs).
      const input=await fs.promises.readFile(file),meta=await sharp(input).metadata();
      if(!meta.width||!meta.height)throw new Error('无法读取照片尺寸。');
      const candidates=[0,90,180,270].map(angle=>({angle,textScore:0,textChars:0,textLines:0,textConfidence:0}));
      if(Math.min(meta.width,meta.height)<48)return candidates;
      const engine=await getWorker();
      for(const candidate of candidates) {
        const bytes=await sharp(input).autoOrient().rotate(candidate.angle).resize({width:1200,height:1200,fit:'inside',withoutEnlargement:true}).greyscale().png().toBuffer();
        let timer;
        try {
          const result=await Promise.race([engine.recognize(bytes,{rotateAuto:false},{blocks:true,text:false}),new Promise((_,reject)=>{timer=setTimeout(()=>{void engine.terminate();reject(new Error('本机文字识别超时，请重新识别这一卷。'));},45000);})]);
          Object.assign(candidate,summarizeText(result.data.blocks));
        } finally {clearTimeout(timer);}
      }
      return candidates;
      } catch(error) {
        failure=new Error(error?.message||'本机文字识别失败，请检查依赖并重新识别。');
        throw failure;
      }
    },
    async close(){closed=true;if(pending)try{await pending;await worker?.terminate();}catch{}}
  };
}
