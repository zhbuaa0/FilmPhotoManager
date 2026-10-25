import {test} from 'node:test';
import assert from 'node:assert/strict';
import {coastStep,glideStep,wheelPixels,createReelMotion} from '../public/reel-motion.mjs';

function harness({reduced=false}={}) {
  let position=1200,time=0,id=0;const frames=new Map(),writes=[],states=[];
  const motion=createReelMotion({read:()=>position,write:value=>{position=value;writes.push(value);},maximum:()=>2000,
    now:()=>time,request:callback=>{frames.set(++id,callback);return id;},cancelRequest:key=>frames.delete(key),
    reduced:()=>reduced,onActive:state=>states.push(state)});
  const advance=elapsed=>{time+=elapsed;const pending=[...frames.values()];frames.clear();for(const callback of pending)callback(time);};
  const settle=()=>{for(let i=0;i<200&&frames.size;i++)advance(1000/60);assert.equal(frames.size,0);};
  return {motion,advance,settle,writes,states,frames,get position(){return position;},get time(){return time;}};
}

test('惯性和缓动按时间积分，60/120Hz 结果一致，非逐帧固定衰减',()=>{
  for(const step of [coastStep,(x,v,dt)=>glideStep(x,v,200,dt)]){
    let a={position:1000,velocity:-1},b={...a};
    for(let i=0;i<60;i++)a=step(a.position,a.velocity,1000/60);
    for(let i=0;i<120;i++)b=step(b.position,b.velocity,1000/120);
    assert.ok(Math.abs(a.position-b.position)<1e-8);assert.ok(Math.abs(a.velocity-b.velocity)<1e-8);
  }
});

test('连续滚轮累积目标且只调度一条动画，逐帧收敛并精确停在目标',()=>{
  const h=harness();for(let i=0;i<12;i++)h.motion.wheel(-30);
  assert.equal(h.frames.size,1);assert.equal(h.writes.length,0);assert.equal(h.motion.target,840);
  h.settle();assert.equal(h.position,840);assert.equal(h.motion.mode,'idle');
  for(let i=1;i<h.writes.length;i++)assert.ok(h.writes[i]<=h.writes[i-1]);
  assert.equal(wheelPixels(3,1,600),54);assert.equal(wheelPixels(1,2,600),600);assert.equal(wheelPixels(120,0,600),120);
});

test('松手后连续滑行，重新按住立即打断惯性，停顿松手不误甩动',()=>{
  const h=harness();h.motion.beginDrag(0);h.motion.dragTo(1120,20);h.advance(20);h.motion.dragTo(1040,40);h.advance(20);
  h.motion.release(42);assert.equal(h.motion.mode,'inertia');const released=h.position;h.advance(16);assert.ok(h.position<released);
  h.motion.beginDrag(60);const held=h.position;h.advance(30);assert.equal(h.position,held);
  h.motion.dragTo(held+80,90);h.advance(30);assert.equal(h.position,held+80);
  h.motion.release(300);assert.equal(h.motion.mode,'idle');assert.equal(h.frames.size,0);
});

test('动画可连续改向、取消、限制首尾；减少动态效果时立即定位且不惯性滑动',()=>{
  const h=harness();h.motion.to(200);h.advance(48);const before=h.position;h.motion.to(1800);
  assert.equal(h.position,before);assert.equal(h.frames.size,1);h.settle();assert.equal(h.position,1800);
  h.motion.to(-500);h.settle();assert.equal(h.position,0);h.motion.to(900);h.advance(16);h.motion.cancel();
  const stopped=h.position;h.advance(100);assert.equal(h.position,stopped);assert.equal(h.frames.size,0);
  h.motion.to(1500,{origin:'seek'});h.advance(16);h.motion.cancel();assert.equal(h.motion.source,'');
  assert.ok(h.writes.every(value=>value>=0&&value<=2000));
  const quiet=harness({reduced:true});quiet.motion.to(800);assert.equal(quiet.position,800);assert.equal(quiet.frames.size,0);
  quiet.motion.beginDrag(0);quiet.motion.dragTo(600,30);quiet.motion.release(32);assert.equal(quiet.motion.mode,'idle');assert.equal(quiet.position,600);
});
