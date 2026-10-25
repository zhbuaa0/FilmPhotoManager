import {findFilmStock,filmKinds} from './film-catalog.mjs';

import {findCanisterPhoto} from './canister-photos.mjs';
import {cassetteArt,reelDimensions,reelStyles} from './film-reel.mjs';

export function filmDefaults(name,previousName='',values={}) {
  const stock=findFilmStock(name);
  if(!stock||stock.id===findFilmStock(previousName)?.id)return {};
  return {iso:String(stock.iso),format:stock.formats.includes(values.format)?values.format:stock.formats.includes('135')?'135':stock.formats[0]};
}

export function filmPresentation(roll={}) {
  const stock=findFilmStock(roll.film);
  const format=roll.format|| (stock?.formats.includes('135')?'135':stock?.formats[0]) || '';
  return {id:stock?.id||'default',brand:stock?.brand||'LIGHTBOX',model:stock?.model||'FILM',name:stock?.name||roll.film||'默认暗盒',kind:filmKinds[stock?.kind]||'光匣 · 胶片档案',iso:roll.iso||stock?.iso||'',format,spool:format==='120',photo:findCanisterPhoto(stock?.id,format),art:format==='120'?cassetteArt.spool:stock?.id==='lucky-c200'?cassetteArt.lucky:stock?cassetteArt.label:cassetteArt.default,monochrome:stock?.kind==='bw'};
}

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const palettes={Kodak:['#edbd42','#271c0c','#b72b21'],Fujifilm:['#dbe8d3','#173e2e','#248157'],Ilford:['#eeeadd','#1b201b','#41844d'],Kentmere:['#d9e5dd','#24413c','#378780'],CineStill:['#e8e2d2','#252b2e','#b43a2f'],Harman:['#ecb777','#30211b','#bb4a31'],Foma:['#dfdfca','#234d39','#367b56'],Rollei:['#e8e4d7','#302922','#ae302b'],Adox:['#e7e1ce','#2e2c26','#a73e33'],Ferrania:['#d8d3bb','#22271e','#a53a2d'],Lomography:['#d9bfd3','#382440','#7e547d'],Lucky:['#f0e4c9','#a12c24','#417f44']};
function labelArtwork(skin) {
  if(!skin.id||skin.id==='default'||skin.art===cassetteArt.lucky)return '';
  const [paper,ink,accent]=palettes[skin.brand]||['#e8e1d0','#252d23','#9e7142'];
  const words=skin.model.split(' '),rows=[];let row='';
  for(const word of words){if((row+' '+word).trim().length>12&&row){rows.push(row);row=word;}else row=(row+' '+word).trim();}if(row)rows.push(row);
  const content=`<rect x="155" y="340" width="660" height="1020" fill="${paper}"/><text x="210" y="510" font-size="100" font-weight="700">${escape(skin.brand)}</text><rect x="205" y="565" width="550" height="18" fill="${accent}"/>${rows.slice(0,3).map((line,i)=>`<text x="210" y="${735+i*110}" font-size="${line.length>10?68:83}" font-weight="600">${escape(line)}</text>`).join('')}<text x="210" y="1190" font-size="170" font-weight="700">${escape(skin.iso||'FILM')}</text><text x="215" y="1290" font-size="39">${escape(skin.format||'135')} / ${escape(skin.kind)}</text>`;
  const transform=skin.spool?'translate(174 -175) scale(.68 1.12)':'';
  return `<g class="reel-label-print" transform="${transform}" fill="${ink}" font-family="Arial, sans-serif" clip-path="url(#reel-label-clip)"><defs><clipPath id="reel-label-clip"><path d="M155 360 Q480 325 815 355 L815 1340 Q490 1375 155 1340Z"/></clipPath></defs>${content}</g>`;
}
export function renderFilmCanister(stage,roll) {
  const skin=filmPresentation(roll),mount=stage.querySelector('.film-canister-mount'),art=skin.art;
  stage.dataset.stock=skin.id;stage.dataset.reelArt=art.file;
  stage.classList.toggle('film-monochrome',skin.monochrome);stage.classList.toggle('film-medium-format',skin.spool);
  mount.innerHTML=`<svg class="reel-art" viewBox="0 0 1024 1536" role="img" aria-label="${escape(skin.name)} 平视${skin.spool?'卷轴':'暗盒'}示意"><image href="/assets/film-reel/${art.file}" width="1024" height="1536"/>${labelArtwork(skin)}</svg>`;
  const title=stage.querySelector('.reel-stock-label');if(title)title.textContent=skin.name;
  return layoutFilmCanister(stage,roll);
}
export function layoutFilmCanister(stage,roll) {
  const skin=filmPresentation(roll),dimensions=reelDimensions({format:skin.format,width:stage.clientWidth||1000,art:skin.art});
  for(const [key,value] of Object.entries(reelStyles(dimensions)))stage.style.setProperty(key,value);
  stage.classList.toggle('film-no-perforations',!dimensions.perforated);
  return dimensions;
}
