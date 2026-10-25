import {findFilmStock,filmKinds} from './film-catalog.mjs';

// Printed labels are drawn locally; these are illustrative colours, not product photographs.
const palettes={Kodak:['#e9b73e','#32210c','#b43123'],Fujifilm:['#1f7650','#f4f0df','#d9bb54'],Ilford:['#e9e7df','#181b1a','#b62c2f'],Kentmere:['#e1ddd1','#242724','#487a57'],CineStill:['#262b31','#f6e9cb','#bc463a'],Harman:['#db663a','#211b16','#e9bb70'],Foma:['#c1c1ac','#202b23','#27684e'],Rollei:['#e5ddd0','#24201c','#b12c27'],Adox:['#ece9e0','#242323','#ad2d2a'],Ferrania:['#242721','#e9e3c9','#bd352b'],Lomography:['#75537c','#f7e9da','#d3a954'],Lucky:['#b62d28','#fff0cd','#dfb839']};

export function filmDefaults(name,previousName='',values={}) {
  const stock=findFilmStock(name);
  if(!stock||stock.id===findFilmStock(previousName)?.id)return {};
  return {iso:String(stock.iso),format:stock.formats.includes(values.format)?values.format:stock.formats.includes('135')?'135':stock.formats[0]};
}

export function filmPresentation(roll={}) {
  const stock=findFilmStock(roll.film),[colour,ink,accent]=palettes[stock?.brand]||['#343d38','#e8e4d3','#b8a072'];
  const format=roll.format|| (stock?.formats.includes('135')?'135':stock?.formats[0]) || '';
  return {id:stock?.id||'default',brand:stock?.brand||'LIGHTBOX',model:stock?.model||'FILM',name:stock?.name||roll.film||'默认暗盒',kind:filmKinds[stock?.kind]||'光匣 · 胶片档案',iso:roll.iso||stock?.iso||'',format,spool:format==='120',colour,ink,accent,monochrome:stock?.kind==='bw'};
}

const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export function renderFilmCanister(stage,roll) {
  const skin=filmPresentation(roll);
  stage.dataset.stock=skin.id;stage.classList.toggle('film-monochrome',skin.monochrome);
  stage.classList.toggle('film-medium-format',skin.spool);
  for(const [key,value] of Object.entries({colour:skin.colour,ink:skin.ink,accent:skin.accent}))stage.style.setProperty('--canister-'+key,value);
  stage.querySelector('.film-canister-mount').innerHTML=`<div class="film-canister ${skin.spool?'is-spool':''}" role="img" aria-label="${escape(skin.name)} ${skin.spool?'卷轴':'暗盒'}示意"><div class="canister-spindle" aria-hidden="true"></div><div class="canister-cap" aria-hidden="true"></div><div class="canister-body"><span class="canister-brand">${escape(skin.brand)}</span><strong class="canister-model">${escape(skin.model)}</strong><span class="canister-kind">${escape(skin.kind)}</span><div class="canister-rating"><strong>${escape(skin.iso||'—')}</strong><span>${escape(skin.format||'FILM')}</span></div><div class="canister-barcode" aria-hidden="true"></div></div><div class="canister-bottom" aria-hidden="true"></div><div class="canister-mouth" aria-hidden="true"></div></div><span class="canister-description">${escape(skin.name)}<small>${skin.spool?'卷轴':'暗盒'}示意 · 向右展开 →</small></span>`;
}
