const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

// The illustrated slot is calibrated in the original 1024 × 1536 render.
export const cassetteArt={
  lucky:{file:'lucky-c200.png',width:1024,height:1536,outlet:{x:870,top:350,bottom:1345}},
  label:{file:'label-template.png',width:1024,height:1536,outlet:{x:870,top:350,bottom:1345}},
  default:{file:'default.png',width:1024,height:1536,outlet:{x:870,top:350,bottom:1345}},
  spool:{file:'spool-120.png',width:1024,height:1536,outlet:{x:742,top:215,bottom:1350}}
};

export function reelDimensions({format='135',width=1000,art=cassetteArt.default}={}) {
  const medium=format==='120',filmMM=medium?61:35,frameMM=medium?56:36,windowMM=medium?56:24,pitchMM=medium?62:38,tipMM=8;
  const span=art.outlet.bottom-art.outlet.top;
  const padding=width<500?12:22;
  const filmHeight=Math.min(width<600?220:280,Math.max(72,(width-padding*2-10)/(art.outlet.x/span+(pitchMM+tipMM)/filmMM)));
  const scale=filmHeight/span;
  return {filmMM,filmHeight,padding,scale,artWidth:art.width*scale,artHeight:art.height*scale,portX:padding+art.outlet.x*scale,portY:padding+art.outlet.top*scale,height:art.height*scale+padding*2,pitch:filmHeight*pitchMM/filmMM,frameWidth:filmHeight*frameMM/filmMM,windowHeight:filmHeight*windowMM/filmMM,tip:filmHeight*tipMM/filmMM,perforated:!medium&&format!=='110'};
}

// Exposed frames move right as scrollLeft decreases. Frame 1 is at the free end.
export function reelExposure(scrollLeft,maximum,pitch,count) {
  if(count<2||pitch<=0)return 0;
  const exposure=clamp((maximum-scrollLeft)/pitch,0,count-1),integer=Math.round(exposure);
  // Native scrollers round fractional CSS pixels differently across browsers.
  return Math.abs(exposure-integer)*pitch<=1.01?integer:exposure;
}
export function reelScroll(exposure,maximum,pitch,count) {
  return clamp(maximum-clamp(exposure,0,Math.max(0,count-1))*pitch,0,maximum);
}

export function reelStyles(dimensions) {
  const d=dimensions;
  return {'--film-height':`${d.filmHeight}px`,'--frame-pitch':`${d.pitch}px`,'--frame-width':`${d.frameWidth}px`,'--frame-window-height':`${d.windowHeight}px`,'--film-tip':`${d.tip}px`,'--port-x':`${d.portX}px`,'--port-y':`${d.portY}px`,'--reel-height':`${d.height}px`,'--art-width':`${d.artWidth}px`,'--art-height':`${d.artHeight}px`,'--reel-pad':`${d.padding}px`,'--perforation-pitch':`${d.filmHeight*4.75/d.filmMM}px`,'--film-edge':`${(d.filmHeight-d.windowHeight)/2}px`};
}
