const clamp=n=>Math.max(0,Math.min(1,n));
const neighbours=[[-1,-1],[0,-1],[1,-1],[-1,0],[1,0],[-1,1],[0,1],[1,1]];

// The user ellipse is a hard safety boundary, not the pupil mask. A local red
// component identifies the flash reflection; the surrounding brown iris stays intact.
function pupilMask(data,width,height,region,unit,redness){
  const cx=region.x*width,cy=region.y*height,rx=region.rx*width,ry=region.ry*height;
  const left=Math.max(0,Math.floor(cx-rx)),top=Math.max(0,Math.floor(cy-ry)),right=Math.min(width,Math.ceil(cx+rx)),bottom=Math.min(height,Math.ceil(cy+ry)),w=right-left,h=bottom-top;
  if(w<=0||h<=0)return null;
  const seed=new Uint8Array(w*h),seen=new Uint8Array(w*h),red=new Float32Array(w*h);
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const p=((top+y)*width+left+x)*3,r=data[p]/unit,g=data[p+1]/unit,b=data[p+2]/unit;
    const d=Math.hypot((left+x-cx)/rx,(top+y-cy)/ry),score=redness(r,g,b);red[y*w+x]=score;
    if(d<1&&r>35&&score>(region.manual?.10:.22))seed[y*w+x]=1;
  }
  let best;
  for(let p=0;p<seed.length;p++)if(seed[p]&&!seen[p]){
    const points=[p];seen[p]=1;let sx=0,sy=0,total=0;
    for(let k=0;k<points.length;k++){
      const q=points[k],x=q%w,y=Math.floor(q/w);sx+=left+x;sy+=top+y;total+=red[q];
      for(const [dx,dy] of neighbours){const a=x+dx,b=y+dy,n=b*w+a;if(a>=0&&a<w&&b>=0&&b<h&&seed[n]&&!seen[n]){seen[n]=1;points.push(n);}}
    }
    const n=points.length,d=Math.hypot((sx/n-cx)/rx,(sy/n-cy)/ry),quality=Math.sqrt(n)*(.5+total/n)/(1+d*3);
    if(n>=3&&(!best||quality>best.quality))best={points,quality};
  }
  if(!best)return null;
  const fringe=Math.max(1.5,Math.min(4,Math.min(rx,ry)*.14)),distance=new Float32Array(w*h).fill(fringe+1),histogram=new Uint32Array(256),shape=new Uint8Array(w*h),dilated=new Uint8Array(w*h),closed=new Uint8Array(w*h);let coreChroma=0;
  for(const q of best.points){shape[q]=1;distance[q]=0;const p=((top+Math.floor(q/w))*width+left+q%w)*3,r=data[p]/unit,g=data[p+1]/unit,b=data[p+2]/unit;histogram[Math.round(.2126*r+.7152*g+.0722*b)]++;coreChroma+=(r-(g+b)*.5)/(r+g+b+20);}
  coreChroma/=best.points.length;
  // Close grain-sized cracks, then fill only enclosed holes. A large coloured
  // flash glint can be wider than the fringe; it still belongs to this pupil.
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let any=false;for(let dy=-1;dy<=1&&!any;dy++)for(let dx=-1;dx<=1;dx++)if(shape[(y+dy)*w+x+dx]){any=true;break;}dilated[y*w+x]=any?1:0;}
  for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){let all=true;for(let dy=-1;dy<=1&&all;dy++)for(let dx=-1;dx<=1;dx++)if(!dilated[(y+dy)*w+x+dx]){all=false;break;}closed[y*w+x]=all?1:0;}
  for(const q of best.points)closed[q]=1;
  const exterior=new Uint8Array(w*h),queue=[];
  for(let q=0;q<w*h;q++)if((q<w||q>=w*(h-1)||q%w===0||q%w===w-1)&&!closed[q]){exterior[q]=1;queue.push(q);}
  for(let k=0;k<queue.length;k++){const q=queue[k],x=q%w,y=Math.floor(q/w);for(const [dx,dy] of [[-1,0],[1,0],[0,-1],[0,1]]){const a=x+dx,b=y+dy,p=b*w+a;if(a>=0&&a<w&&b>=0&&b<h&&!closed[p]&&!exterior[p]){exterior[p]=1;queue.push(p);}}}
  for(let q=0;q<distance.length;q++)if(closed[q]||!exterior[q])distance[q]=0;
  // Two-pass distance propagation is linear in the ROI, including large manual selections.
  const diagonal=Math.SQRT2;
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const q=y*w+x;let d=distance[q];if(x)d=Math.min(d,distance[q-1]+1);if(y){d=Math.min(d,distance[q-w]+1);if(x)d=Math.min(d,distance[q-w-1]+diagonal);if(x+1<w)d=Math.min(d,distance[q-w+1]+diagonal);}distance[q]=d;
  }
  for(let y=h-1;y>=0;y--)for(let x=w-1;x>=0;x--){
    const q=y*w+x;let d=distance[q];if(x+1<w)d=Math.min(d,distance[q+1]+1);if(y+1<h){d=Math.min(d,distance[q+w]+1);if(x)d=Math.min(d,distance[q+w-1]+diagonal);if(x+1<w)d=Math.min(d,distance[q+w+1]+diagonal);}distance[q]=d;
  }
  let count=0,median=0;for(;median<255;median++){count+=histogram[median];if(count>=best.points.length*.5)break;}
  return {left,top,w,h,cx,cy,rx,ry,fringe,distance,median,coreChroma};
}

export function correctPupilPixels(data,width,height,regions,depth,redness){
  const unit=depth===16?257:1;
  // Build every mask before editing so overlapping records cannot change segmentation.
  const masks=regions.filter(r=>r.enabled&&(r.strength??1)>0).map(region=>({region,mask:pupilMask(data,width,height,region,unit,redness)}));
  for(const {region,mask} of masks){
    if(!mask)continue;
    const {left,top,w,h,cx,cy,rx,ry,fringe,distance,median,coreChroma}=mask;
    for(let y=0;y<h;y++)for(let x=0;x<w;x++){
      const q=y*w+x,d=Math.hypot((left+x-cx)/rx,(top+y-cy)/ry);if(d>=1||distance[q]>=fringe+1)continue;
      const p=((top+y)*width+left+x)*3,r=data[p]/unit,g=data[p+1]/unit,b=data[p+2]/unit,light=.2126*r+.7152*g+.0722*b;
      if(Math.max(r,g,b)-Math.min(r,g,b)<=1)continue;
      const chroma=(r-(g+b)*.5)/(r+g+b+20),glint=light>median+24&&(Math.min(r,g,b)>=Math.max(r,g,b)*.55||chroma<coreChroma*.65);
      const colour=clamp((r-Math.max(g,b)-3)/12)*clamp((r/(Math.max(g,b)+1)-1.03)/.14);
      const t=clamp((fringe+1-distance[q])/fringe),edge=t*t*(3-2*t);
      // The confirmed core must not inherit the old ellipse feather's red rim.
      const boundary=distance[q]===0&&!region.manual?1:clamp((1-d)/.08),alpha=edge*(glint&&distance[q]===0?1:colour)*boundary*(region.strength??1);
      // Preserve the brightness of diluted pink/white flash highlights. Outside
      // highlights, neutralise the retinal red while retaining G/B texture.
      const target=(glint?light:Math.min(r,(g+b)*.5))*unit;
      for(let c=0;c<3;c++)data[p+c]=Math.round(data[p+c]*(1-alpha)+target*alpha);
    }
  }
  return data;
}
