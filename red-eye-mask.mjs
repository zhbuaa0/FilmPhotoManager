// Independent local colour/shape classifier. Coordinates are EXIF-upright, before display rotation.
export {redEyeRenderVersion} from './public/red-eye-version.mjs';
export function redness(r,g,b){return Math.max(0,Math.min(1,(r-Math.max(g,b)-12)/80))*Math.max(0,Math.min(1,(r/(Math.max(g,b)+10)-1.25)/1.2));}
export function findPupil(rgb,width,height,{x,y,radius,faceScore=1,manual=false}){
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
    const queue=[p];seen[p]=1;let n=0,sx=0,sy=0,total=0,minX=w,maxX=0,minY=h,maxY=0;
    for(let k=0;k<queue.length;k++){const q=queue[k],i=q%w,j=Math.floor(q/w),off=((top+j)*width+left+i)*3;n++;sx+=i;sy+=j;total+=redness(rgb[off],rgb[off+1],rgb[off+2]);minX=Math.min(minX,i);maxX=Math.max(maxX,i);minY=Math.min(minY,j);maxY=Math.max(maxY,j);
      for(const [dx,dy] of [[1,0],[-1,0],[0,1],[0,-1],[1,1],[-1,-1],[1,-1],[-1,1]]){const a=i+dx,b=j+dy,index=b*w+a;if(a>=0&&a<w&&b>=0&&b<h&&mask[index]&&!seen[index]){seen[index]=1;queue.push(index);}}
    }
    const cx=left+sx/n,cy=top+sy/n,bw=maxX-minX+1,bh=maxY-minY+1,distance=Math.hypot(cx-x,cy-y)/radius,aspect=Math.min(bw,bh)/Math.max(bw,bh),fill=n/(bw*bh);
    if(n<3||n>w*h*.5||distance>.8||aspect<.3)continue;
    const score=(total/n)*.45+aspect*.2+Math.min(1,fill/.6)*.15+Math.max(0,1-distance)*.1+faceScore*.1;
    const extent=manual ? .95 : .72;
    components.push({x:cx/width,y:cy/height,rx:Math.min(.12,Math.max(2,bw*extent)/width),ry:Math.min(.12,Math.max(2,bh*extent)/height),score,enabled:manual||(score>=.84&&total/n>=.65&&n>=5&&distance<.55&&faceScore>=.85&&bw<radius*1.2&&bh<radius*1.2),strength:1,pixels:n,manual});
  }
  return components.sort((a,b)=>b.score-a.score)[0]||null;
}
export function correctPixels(data,width,height,regions,depth=8){
  const max=depth===16?65535:255,unit=max/255;
  for(const region of regions.filter(r=>r.enabled)){
    const cx=region.x*width,cy=region.y*height,rx=region.rx*width,ry=region.ry*height;
    for(let y=Math.max(0,Math.floor(cy-ry));y<Math.min(height,Math.ceil(cy+ry));y++)for(let x=Math.max(0,Math.floor(cx-rx));x<Math.min(width,Math.ceil(cx+rx));x++){
      const d=Math.hypot((x-cx)/rx,(y-cy)/ry);if(d>=1)continue;
      const p=(y*width+x)*3,r=data[p]/unit,g=data[p+1]/unit,b=data[p+2]/unit;
      // Once an eye is confirmed, include its pale red fringe; detection remains stricter.
      const other=Math.max(g,b),weight=Math.max(0,Math.min(1,(r-other-3)/18))*Math.max(0,Math.min(1,(r/(other+1)-1.03)/.18));if(weight<=0)continue;
      const feather=Math.min(1,(1-d)/.25),alpha=feather*weight*(region.strength??1),target=Math.min(data[p],(data[p+1]+data[p+2])*.5);
      // Neutralise the confirmed red reflection in all channels. Leaving G/B untouched
      // produced green pupils in real film scans with unequal green and blue values.
      for(let c=0;c<3;c++)data[p+c]=Math.round(data[p+c]*(1-alpha)+target*alpha);
    }
  }
  return data;
}
export function validateRegions(regions){
  if(!Array.isArray(regions)||regions.length>200)throw new Error('眼部选区无效或过多。');
  return regions.map(r=>{if(!r||!['x','y','rx','ry'].every(k=>Number.isFinite(r[k]))||r.x<0||r.x>1||r.y<0||r.y>1||r.rx<=0||r.ry<=0||r.rx>.12||r.ry>.12||!Number.isFinite(r.strength??1)||(r.strength??1)<0||(r.strength??1)>1)throw new Error('眼部坐标或修正强度无效。');return {...r,enabled:!!r.enabled,strength:r.strength??1};});
}
