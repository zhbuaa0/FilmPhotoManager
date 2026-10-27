export function fromDisplay(x,y,rotation=0){
  if(rotation===90)return {x:y,y:1-x};if(rotation===180)return {x:1-x,y:1-y};if(rotation===270)return {x:1-y,y:x};return {x,y};
}
export function toDisplay(x,y,rotation=0){return fromDisplay(x,y,(360-rotation)%360);}
