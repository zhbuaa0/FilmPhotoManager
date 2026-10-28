// Independent local colour/shape classifier. Coordinates are EXIF-upright, before display rotation.
export {redEyeRenderVersion} from './public/red-eye-version.mjs';
import {correctPupilPixels} from './red-eye-pupil-render.mjs';
export function redness(r,g,b){return Math.max(0,Math.min(1,(r-Math.max(g,b)-12)/80))*Math.max(0,Math.min(1,(r/(Math.max(g,b)+10)-1.25)/1.2));}
const clamp=n=>Math.max(0,Math.min(1,n));
const luminance=(r,g,b)=>.2126*r+.7152*g+.0722*b;
const chroma=(r,g,b)=>(r-(g+b)*.5)/(r+g+b+20);
// Close one-pixel grain gaps and fill enclosed holes only for shape measurement.
// White flash highlights must not make a circular pupil look like a sparse red blob.
function filledCoverage(points,w,minX,minY,bw,bh,rgb,width,left,top,coreLum,coreChroma){
  const sw=bw+4,sh=bh+4,mask=new Uint8Array(sw*sh),dilated=new Uint8Array(sw*sh),closed=new Uint8Array(sw*sh);
  for(const p of points)mask[(Math.floor(p/w)-minY+2)*sw+p%w-minX+2]=1;
  for(let y=1;y<sh-1;y++)for(let x=1;x<sw-1;x++){let any=false;for(let dy=-1;dy<=1&&!any;dy++)for(let dx=-1;dx<=1;dx++)if(mask[(y+dy)*sw+x+dx]){any=true;break;}dilated[y*sw+x]=any?1:0;}
  for(let y=1;y<sh-1;y++)for(let x=1;x<sw-1;x++){let all=true;for(let dy=-1;dy<=1&&all;dy++)for(let dx=-1;dx<=1;dx++)if(!dilated[(y+dy)*sw+x+dx]){all=false;break;}closed[y*sw+x]=all?1:0;}
  const exterior=new Uint8Array(sw*sh),queue=[0];exterior[0]=1;
  for(let k=0;k<queue.length;k++){const p=queue[k],x=p%sw,y=Math.floor(p/sw);for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1]]){const a=x+dx,b=y+dy,q=b*sw+a;if(a>=0&&a<sw&&b>=0&&b<sh&&!closed[q]&&!exterior[q]){exterior[q]=1;queue.push(q);}}}
  let filled=0,enclosedHighlights=0;
  for(let y=2;y<bh+2;y++)for(let x=2;x<bw+2;x++){
    const p=y*sw+x;if(closed[p]||!exterior[p])filled++;
    if(!closed[p]&&!exterior[p]){const q=((top+minY+y-2)*width+left+minX+x-2)*3,r=rgb[q],g=rgb[q+1],b=rgb[q+2];if(luminance(r,g,b)>coreLum+24&&(Math.min(r,g,b)>=Math.max(r,g,b)*.55||chroma(r,g,b)<coreChroma*.65))enclosedHighlights++;}
  }
  return {coverage:filled/(bw*bh),enclosedHighlights};
}
function surroundings(rgb,width,height,cx,cy,bw,bh,coreLum,coreChroma,eyeAxis){
  const rx=Math.max(2,bw*.55),ry=Math.max(2,bh*.55),ring=[],sides=[],vertical=[];let highlights=0,centralPixels=0,centralRedOrGlint=0,innerPixels=0,darkCentre=0;
  for(let y=Math.max(0,Math.floor(cy-ry*2.4));y<Math.min(height,Math.ceil(cy+ry*2.4));y++)for(let x=Math.max(0,Math.floor(cx-rx*2.4));x<Math.min(width,Math.ceil(cx+rx*2.4));x++){
    const d=Math.hypot((x-cx)/rx,(y-cy)/ry),p=(y*width+x)*3,r=rgb[p],g=rgb[p+1],b=rgb[p+2],lum=luminance(r,g,b);
    const colour=chroma(r,g,b);
    if(d>=1.45&&d<=2.4){ring.push({lum,chroma:colour});if(eyeAxis){const size=(rx+ry)*.5,along=((x-cx)*eyeAxis.x+(y-cy)*eyeAxis.y)/size,across=((x-cx)*-eyeAxis.y+(y-cy)*eyeAxis.x)/size;if(Math.abs(across)<.6&&Math.abs(along)>1.4)sides.push({lum,chroma:colour});if(Math.abs(along)<.6&&Math.abs(across)>1.4)vertical.push({lum,chroma:colour});}}
    // Film/flash highlights can be pink, not RGB-neutral white. A bright diluted
    // reflection counts as support; a dark central pupil is checked separately.
    const neutralGlint=lum>coreLum+24&&(Math.min(r,g,b)>=Math.max(r,g,b)*.55||chroma(r,g,b)<coreChroma*.65);
    if(d<.85&&neutralGlint)highlights++;
    if(d<.45){centralPixels++;if(redness(r,g,b)>.1||neutralGlint)centralRedOrGlint++;}
    if(d<.6){innerPixels++;if(lum<coreLum*.65&&chroma(r,g,b)<coreChroma*.55)darkCentre++;}
  }
  ring.sort((a,b)=>a.lum-b.lum);const bright=ring.slice(Math.floor(ring.length*.5)),colour=bright.map(p=>p.chroma).sort((a,b)=>a-b);
  const median=(list,key)=>list.map(p=>p[key]).sort((a,b)=>a-b)[Math.floor(list.length*.5)]||0;
  const ocularLightness=(median(sides,'lum')-median(vertical,'lum'))/((ring[Math.floor(ring.length*.75)]?.lum||0)+20),ocularNeutrality=median(vertical,'chroma')-median(sides,'chroma');
  return {count:ring.length,lum:ring[Math.floor(ring.length*.75)]?.lum||0,chroma:colour[Math.floor(colour.length*.5)]||0,highlights,centralSupport:centralRedOrGlint/Math.max(1,centralPixels),darkCentre:darkCentre/Math.max(1,innerPixels),eyeStructure:sides.length>=4&&vertical.length>=4&&(ocularLightness>.04||ocularNeutrality>.035)};
}
export function findPupil(rgb,width,height,{x,y,radius,faceScore=1,manual=false,eyeAxis=null}){
  const left=Math.max(0,Math.floor(x-radius)),top=Math.max(0,Math.floor(y-radius*.8)),right=Math.min(width,Math.ceil(x+radius)),bottom=Math.min(height,Math.ceil(y+radius*.8));
  const w=right-left,h=bottom-top;if(w<3||h<3)return null;
  const mask=new Uint8Array(w*h);let count=0;
  for(let j=0;j<h;j++)for(let i=0;i<w;i++){
    const offset=((top+j)*width+left+i)*3,r=rgb[offset],g=rgb[offset+1],b=rgb[offset+2];
    if(r>45&&redness(r,g,b)>(manual ? .1 : .3)){mask[j*w+i]=1;count++;}
  }
  if(count<3)return null;
  const seen=new Uint8Array(w*h),components=[];
  for(let p=0;p<mask.length;p++)if(mask[p]&&!seen[p]){
    const queue=[p];seen[p]=1;let n=0,sx=0,sy=0,total=0,totalLum=0,totalChroma=0,minX=w,maxX=0,minY=h,maxY=0;
    for(let k=0;k<queue.length;k++){const q=queue[k],i=q%w,j=Math.floor(q/w),off=((top+j)*width+left+i)*3,r=rgb[off],g=rgb[off+1],b=rgb[off+2];n++;sx+=i;sy+=j;total+=redness(r,g,b);totalLum+=luminance(r,g,b);totalChroma+=chroma(r,g,b);minX=Math.min(minX,i);maxX=Math.max(maxX,i);minY=Math.min(minY,j);maxY=Math.max(maxY,j);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const a=i+dx,b=j+dy,index=b*w+a;if(a>=0&&a<w&&b>=0&&b<h&&mask[index]&&!seen[index]){seen[index]=1;queue.push(index);}}
    }
    const cx=left+sx/n,cy=top+sy/n,bw=maxX-minX+1,bh=maxY-minY+1,distance=Math.hypot(cx-x,cy-y)/radius,aspect=Math.min(bw,bh)/Math.max(bw,bh),fill=n/(bw*bh);
    if(n<3||n>w*h*.5||distance>.8||aspect<.3)continue;
    if(!manual&&(n<5||Math.min(bw,bh)<3))continue;
    const morphology=filledCoverage(queue,w,minX,minY,bw,bh,rgb,width,left,top,totalLum/n,totalChroma/n),coverage=morphology.coverage,context=surroundings(rgb,width,height,cx,cy,bw,bh,totalLum/n,totalChroma/n,eyeAxis);
    const redContrast=totalChroma/n-context.chroma,darkContrast=(context.lum-totalLum/n)/(context.lum+20),perpendicular=eyeAxis?Math.abs((cx-x)*-eyeAxis.y+(cy-y)*eyeAxis.x)/radius:0;
    const sizeOK=n>=12&&Math.min(bw,bh)>=Math.max(6,radius*.12)&&Math.max(bw,bh)<=radius*1.1;
    const shape=(clamp((aspect-.45)/.45)+clamp((coverage-.3)/.35))*.5;
    const score=clamp((redContrast-.02)/.18)*.30+shape*.24+clamp((darkContrast-.04)/.26)*.22+faceScore*.14+(distance<=.65?1:clamp((.9-distance)/.25))*.10;
    const eligible=sizeOK&&aspect>=.60&&coverage>=.45&&distance<=.7&&perpendicular<=.48&&faceScore>=.85&&context.count>=12&&redContrast>=.075&&darkContrast>=.10&&context.centralSupport>=.50&&context.darkCentre<=.20;
    const hasHighlight=context.highlights>=Math.max(1,Math.ceil(n*.005));
    const enclosedHighlight=morphology.enclosedHighlights>=Math.max(3,Math.ceil(n*.01));
    const plausible=n>=5&&Math.min(bw,bh)>=Math.max(3,radius*.08)&&Math.max(bw,bh)<=radius*1.4&&aspect>=.45&&coverage>=.30&&perpendicular<=.65&&context.count>=12&&redContrast>=.04&&darkContrast>=.055&&context.centralSupport>=.40&&context.darkCentre<.35&&(hasHighlight||context.eyeStructure);
    if(!manual&&!plausible)continue;
    const extent=manual ? .95 : .72;
    const previousScore=(total/n)*.45+aspect*.2+Math.min(1,fill/.6)*.15+Math.max(0,1-distance)*.1+faceScore*.1;
    const establishedStrong=previousScore>=.84&&total/n>=.65&&distance<.55&&bw<radius*1.2&&bh<radius*1.2;
    const pairedEligible=eligible&&n>=60&&Math.min(bw,bh)>=12&&aspect>=.75&&coverage>=.55&&faceScore>=.90&&enclosedHighlight&&redContrast>=.14&&darkContrast>=.20;
    const singleEligible=pairedEligible&&distance<=.55&&redContrast>=.20;
    components.push({x:cx/width,y:cy/height,rx:Math.min(.12,Math.max(2,bw*extent)/width),ry:Math.min(.12,Math.max(2,bh*extent)/height),score,enabled:manual||(eligible&&establishedStrong)||(singleEligible&&score>=.90),strength:1,pixels:n,manual,evidence:{redContrast,darkContrast,coverage,aspect,distance,perpendicular,faceScore,hasHighlight,enclosedHighlight,eligible,pairedEligible,singleEligible,eyeStructure:context.eyeStructure,centralSupport:context.centralSupport,darkCentre:context.darkCentre},reason:manual?'manual':'local-pupil'});
  }
  return components.sort((a,b)=>manual?(b.score-.2*b.evidence.distance)-(a.score-.2*a.evidence.distance):Number(b.enabled)-Number(a.enabled)||Number(b.evidence.pairedEligible)-Number(a.evidence.pairedEligible)||b.score-a.score)[0]||null;
}
export function confirmEyePair(candidates,eyes,width,height){
  const [a,b]=candidates;if(!a||!b||!a.evidence.pairedEligible||!b.evidence.pairedEligible||a.score<.82||b.score<.82)return candidates;
  const dx=eyes[1].x-eyes[0].x,dy=eyes[1].y-eyes[0].y,distance=Math.hypot(dx,dy),ax=dx/distance,ay=dy/distance;
  const px=(b.x-a.x)*width,py=(b.y-a.y)*height,separation=Math.hypot(px,py)/distance,drift=Math.abs(px*-ay+py*ax)/distance;
  const size=Math.min(a.rx*width,a.ry*height,b.rx*width,b.ry*height)/Math.max(a.rx*width,a.ry*height,b.rx*width,b.ry*height);
  if(separation>=.75&&separation<=1.25&&drift<=.12&&size>=.5)for(const c of candidates){c.enabled=true;c.reason='paired-pupils';}
  return candidates;
}
export function correctPixels(data,width,height,regions,depth=8){
  return correctPupilPixels(data,width,height,regions,depth,redness);
}
export function validateRegions(regions){
  if(!Array.isArray(regions)||regions.length>200)throw new Error('眼部选区无效或过多。');
  return regions.map(r=>{if(!r||!['x','y','rx','ry'].every(k=>Number.isFinite(r[k]))||r.x<0||r.x>1||r.y<0||r.y>1||r.rx<=0||r.ry<=0||r.rx>.12||r.ry>.12||!Number.isFinite(r.strength??1)||(r.strength??1)<0||(r.strength??1)>1)throw new Error('眼部坐标或修正强度无效。');return {...r,enabled:!!r.enabled,strength:r.strength??1};});
}
