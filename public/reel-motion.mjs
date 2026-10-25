const clamp=(value,min,max)=>Math.max(min,Math.min(max,value));

export function coastStep(position,velocity,elapsed,tau=225) {
  const decay=Math.exp(-elapsed/tau);
  return {position:position+velocity*tau*(1-decay),velocity:velocity*decay};
}
export function glideStep(position,velocity,target,elapsed,frequency=.017) {
  const error=position-target,b=velocity+frequency*error,decay=Math.exp(-frequency*elapsed);
  return {position:target+(error+b*elapsed)*decay,velocity:(velocity-frequency*b*elapsed)*decay};
}
export function wheelPixels(delta,mode,pageSize) {
  return delta*(mode===1?18:mode===2?pageSize:1);
}

// One animation owns all mouse/keyboard/wheel motion. Touch keeps native momentum.
export function createReelMotion({read,write,maximum,onActive=()=>{},
  request=callback=>requestAnimationFrame(callback),cancelRequest=id=>cancelAnimationFrame(id),
  now=()=>performance.now(),reduced=()=>matchMedia('(prefers-reduced-motion: reduce)').matches}) {
  let mode='idle',source='',position=0,target=0,velocity=0,frame=null,last=0,history=[],status='';
  function announce() {
    const key=mode+'|'+source;if(key===status)return;status=key;
    onActive({active:mode!=='idle',mode,source});
  }
  function schedule() {if(frame===null){last=now();frame=request(tick);}}
  function stop() {if(frame!==null)cancelRequest(frame);frame=null;mode='idle';velocity=0;history=[];announce();}
  function emit(value) {position=clamp(value,0,Math.max(0,maximum()));write(position);}
  function tick(time) {
    frame=null;const elapsed=clamp(time-last,0,64);last=time;
    if(mode==='drag'){emit(target);return;}
    const next=mode==='inertia'?coastStep(position,velocity,elapsed):glideStep(position,velocity,target,elapsed);
    velocity=next.velocity;emit(next.position);
    const edge=(position<=0&&velocity<0)||(position>=maximum()&&velocity>0);
    const settled=mode==='inertia'?Math.abs(velocity)<.012:Math.abs(position-target)<.2&&Math.abs(velocity)<.012;
    if(edge||settled){if(mode==='spring'&&!edge)emit(target);stop();return;}
    frame=request(tick);
  }
  function to(value,{immediate=false,origin='step'}={}) {
    if(mode==='idle'){position=read();velocity=0;}
    target=clamp(value,0,Math.max(0,maximum()));source=origin;
    if(immediate||reduced()){emit(target);stop();return;}
    mode='spring';announce();schedule();
  }
  return {
    get mode(){return mode;},get source(){return source;},get target(){return target;},
    cancel(){source='';stop();position=target=read();},
    to,
    wheel(delta){const base=mode!=='idle'&&source==='wheel'?target:read();to(base+delta,{origin:'wheel'});},
    beginDrag(time=now()){stop();position=target=read();source='drag';mode='drag';history=[{position,time}];announce();},
    dragTo(value,time=now()) {
      if(mode!=='drag')return;target=clamp(value,0,Math.max(0,maximum()));
      history.push({position:target,time});history=history.filter(sample=>time-sample.time<=90);
      if(history.length>128)history.shift();schedule();
    },
    release(time=now(),{inertia=true}={}) {
      if(mode!=='drag')return;emit(target);
      if(frame!==null)cancelRequest(frame);frame=null;
      const first=history[0],end=history.at(-1),span=end&&first?end.time-first.time:0;
      velocity=inertia&&!reduced()&&end&&time-end.time<85&&span>8?clamp((end.position-first.position)/span,-2.8,2.8):0;
      history=[];
      if(Math.abs(velocity)<.04){stop();return;}
      mode='inertia';source='inertia';announce();schedule();
    }
  };
}
