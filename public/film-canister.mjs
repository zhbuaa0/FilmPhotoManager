import {findFilmStock,filmKinds} from './film-catalog.mjs';

import {findCanisterPhoto} from './canister-photos.mjs';

export function filmDefaults(name,previousName='',values={}) {
  const stock=findFilmStock(name);
  if(!stock||stock.id===findFilmStock(previousName)?.id)return {};
  return {iso:String(stock.iso),format:stock.formats.includes(values.format)?values.format:stock.formats.includes('135')?'135':stock.formats[0]};
}

export function filmPresentation(roll={}) {
  const stock=findFilmStock(roll.film);
  const format=roll.format|| (stock?.formats.includes('135')?'135':stock?.formats[0]) || '';
  return {id:stock?.id||'default',brand:stock?.brand||'LIGHTBOX',model:stock?.model||'FILM',name:stock?.name||roll.film||'默认暗盒',kind:filmKinds[stock?.kind]||'光匣 · 胶片档案',iso:roll.iso||stock?.iso||'',format,spool:format==='120',photo:findCanisterPhoto(stock?.id,format),monochrome:stock?.kind==='bw'};
}

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderFilmCanister(stage,roll) {
  const skin=filmPresentation(roll),mount=stage.querySelector('.film-canister-mount');
  stage.dataset.stock=skin.id;stage.classList.toggle('film-monochrome',skin.monochrome);
  stage.classList.toggle('film-medium-format',skin.spool);
  function showPhoto(photo,failed=false) {
    const [x,y,width,height]=photo.bounds;
    stage.dataset.canisterPhoto=photo.id;
    mount.innerHTML=`<div class="film-canister"><div class="canister-photo" style="--photo-aspect:${photo.aspect}"><img src="/canister-images/${photo.id}.jpg?v=${photo.imageVersion}" alt="${escape(photo.stockId?skin.name:skin.spool?'通用 120 空卷轴':'通用黑色空暗盒')} 实拍参考" draggable="false" style="width:${100/width}%;height:${100/height}%;left:${-100*x/width}%;top:${-100*y/height}%"></div><div class="canister-unavailable" hidden><span>暗盒照片暂未载入</span><button type="button">重新载入</button></div></div><div class="canister-description"><strong>${escape(skin.name)}</strong><small>${photo.stockId?'暗盒实拍参考':failed?'型号图暂不可用 · 通用实拍':skin.spool?'通用空卷轴 · 实拍参考':'通用空暗盒 · 实拍参考'}</small><a href="${escape(photo.source)}" target="_blank" rel="noopener noreferrer" title="${escape(photo.credit)}">${escape(photo.sourceLabel)} ↗</a></div>`;
    const image=mount.querySelector('img'),unavailable=mount.querySelector('.canister-unavailable');
    image.addEventListener('error',()=>{
      if(!image.isConnected)return;
      if(photo.stockId)return showPhoto(findCanisterPhoto(null,skin.format),true);
      image.parentElement.hidden=true;unavailable.hidden=false;
    });
    unavailable.querySelector('button').onclick=()=>{image.parentElement.hidden=false;unavailable.hidden=true;image.src=`/canister-images/${photo.id}.jpg?v=${photo.imageVersion}&retry=${Date.now()}`;};
  }
  showPhoto(skin.photo);
}
