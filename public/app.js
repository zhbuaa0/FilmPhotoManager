import { setupInlineArchive } from './inline-archive.js';
import { setupOrientation } from './orientation-ui.js';
import { setupRollNavigation } from './roll-navigation.js';
import { setupCameras } from './cameras.js';
import {setupFilms} from './films.js';
import {filmStocks,findFilmStock} from './film-catalog.mjs';
import {renderFilmCanister,layoutFilmCanister,filmPresentation} from './film-canister.mjs';
import {reelExposure,reelScroll} from './film-reel.mjs';
import {createReelMotion,wheelPixels} from './reel-motion.mjs';
import { sheetLayout, framePosition } from './sheet-layout.mjs';
import {collectionRolls,rollDate,selectPhotoRange} from './collection.mjs';
import {recentFilmNames,rememberFilm,sortByRecentFilms} from './film-recents.mjs';
const $ = s => document.querySelector(s);
let automaticOrientation=true;
let selectedPhotos=new Set(),selectionAnchor=null,selectionMode=false,copyBusy=false,fileClipboard=false;
let filmPull=0,filmDimensions=null,filmRenderKey='',filmLayoutPending=false,filmLayoutRAF=0;
let filmMaximum=0,filmViewPhotos=[],filmOrdinals=[],filmCounterKey='',filmPositionRAF=0,filmPendingSeek=null;
const filmMotion=createReelMotion({read:()=>$('#film-strip').scrollLeft,write:left=>{$('#film-strip').scrollLeft=left;},maximum:()=>filmMaximum,onActive:({active,mode,source})=>{const stage=$('.film-stage');stage.classList.toggle('is-pulling',active);stage.classList.toggle('is-moving',active);stage.dataset.motion=mode;stage.dataset.motionSource=source;}});
let cameraReturnId=null,cameraReturnForm=false;
let library = { rolls: [] }, currentId = null, view = 'grid', viewerIndex = 0, editingId = null, uploadBusy = false, filmTimer = null, sheetCanvas = null, sheetGeneration = 0, viewerVersion = null, folderBusy=false, checkedFolder=null;
const esc = v => String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const current = () => library.rolls.find(r => r.id === currentId);
const photoVersions = p => p.versions?.length ? p.versions : [{id:p.id,name:p.name,mime:p.mime,bytes:p.bytes,thumbnail:p.thumbnail,file:p.file,kind:['image/tiff','image/bmp'].includes(p.mime)?'scan':'image'}];
const preferredVersion = p => photoVersions(p).find(v=>v.kind===($('#version-view')?.value||'finished'))||photoVersions(p)[0];
const imageUrl = p => p.rotation ? `/api/rolls/${library.rolls.find(r=>r.photos.some(f=>f.id===p.id))?.id}/photos/${p.id}/thumbnail?version=${preferredVersion(p).id}&rotation=${p.rotation}` : '/photos/' + (preferredVersion(p).thumbnail || p.thumbnail || p.file);
const rollNavigation=setupRollNavigation({getRolls:()=>collectionRolls(library.rolls,{sort:$('#roll-sort').value}),getCurrent:current,openRoll,imageUrl,isBusy:()=>uploadBusy});
const date = d => d ? d.replaceAll('-', '.') : '未记录';
const period = r => r.shotStart || r.shotEnd ? `${date(r.shotStart)} — ${date(r.shotEnd)}` : '拍摄时间未记录';
let toastTimer;
function toast(message) { $('#toast').textContent = message; $('#toast').classList.add('visible'); clearTimeout(toastTimer); toastTimer = setTimeout(() => $('#toast').classList.remove('visible'), 3800); }
async function api(url, options = {}) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || '操作失败');
  return data;
}
const send = (url, method, value) => api(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(value) });
async function refresh() { library = await api('/api/library'); renderLibrary(); if (current()) renderDetail(); }
function renderLibrary() {
  $('#stat-rolls').textContent = String(library.rolls.length).padStart(2, '0');
  $('#stat-photos').textContent = String(library.rolls.reduce((n, r) => n + r.photos.length, 0)).padStart(3, '0');
  $('#stat-cameras').textContent = String(new Set(library.rolls.map(r => r.camera).filter(Boolean)).size).padStart(2, '0');
  $('#count-all').textContent = library.rolls.length;
  updateCollectionFilters();
  const rolls=collectionRolls(library.rolls.map(r=>({...r,collectionFormat:filmPresentation(r).format})),{query:$('#search').value,sort:$('#roll-sort').value,camera:$('#filter-camera').value,film:$('#filter-film').value,format:$('#filter-format').value,year:$('#filter-year').value});
  $('#collection-title').textContent = '全部胶卷';
  $('#visible-count').textContent = rolls.length + ' / '+library.rolls.length+' 卷';
  $('#roll-grid').innerHTML = rolls.map(r => {const filmInfo=filmPresentation(r);return `<button class="roll-card" data-roll="${r.id}" aria-label="打开胶卷 ${esc(r.title)}"><div class="roll-cover">${r.photos.length ? `<img src="${imageUrl(r.photos[0])}" alt="${esc(r.title)}的封面" loading="lazy">` : `<span class="cover-empty">${esc(filmInfo.format || 'ROLL')}</span>`}<span class="cover-count">${String(r.photos.length).padStart(2,'0')} FRAMES</span></div><div class="card-body"><div class="card-top"><span class="serial">№ ${esc(r.number)}</span></div><h3>${esc(r.title)}</h3><p class="card-description">${esc(r.camera || '相机待补全')}<br>${esc(r.film || '胶卷型号待补全')}${filmInfo.iso ? ` / ISO ${esc(filmInfo.iso)}` : ''}</p><div class="card-date"><span>${esc(period(r))}</span><span>${esc(filmInfo.format || '规格待补全')}</span></div></div></button>`;}).join('');
  $('#library-empty').hidden = library.rolls.length > 0;
  if (library.rolls.length && !rolls.length) $('#roll-grid').innerHTML = '<p class="muted">没有匹配的胶卷。试试其他关键词或分类。</p>';
  renderFilmOptions();
  cameraUI.render();
  rollNavigation.render();
  if(!$('#cameras-view').hidden)$('#all-rolls').classList.remove('active');
}
function showLibrary() { stopFilm(); currentId = null; resetPhotoSelection(); $('#cameras-view').hidden=true;$('#my-cameras').classList.remove('active');if(location.hash==='#cameras')history.replaceState(null,'',location.pathname+location.search);$('#detail-view').hidden = true; $('#library-view').hidden = false; $('#breadcrumb').textContent = '全部胶卷'; rollNavigation.render(); }
function openRoll(id) { if(!library.rolls.some(r=>r.id===id))return;if(uploadBusy&&id!==currentId)return toast('照片正在导入，完成后即可切换胶卷。');$('#cameras-view').hidden=true;$('#my-cameras').classList.remove('active');if(location.hash==='#cameras')history.replaceState(null,'',location.pathname+location.search);if(currentId!==id)resetPhotoSelection();currentId = id; $('#library-view').hidden = true; $('#detail-view').hidden = false; $('#star-filter').checked = false; if(!uploadBusy)$('#import-progress').hidden=true; setView('grid'); renderDetail(); rollNavigation.render({revealCurrent:true}); window.scrollTo({ top: 0, behavior: 'smooth' }); }
function showCameras() {
  if(uploadBusy)return toast('照片正在导入，完成后即可管理相机。');
  stopFilm();cameraReturnId=currentId;cameraReturnForm=$('#roll-dialog').open;if(cameraReturnForm)$('#roll-dialog').close();currentId=null;
  $('#library-view').hidden=true;$('#detail-view').hidden=true;$('#cameras-view').hidden=false;rollNavigation.render();$('#all-rolls').classList.remove('active');$('#my-cameras').classList.add('active');$('#breadcrumb').textContent='我的相机';
  $('#camera-back').textContent=cameraReturnForm?'‹ 返回新建胶卷':cameraReturnId?'‹ 返回胶卷详情':'‹ 返回胶卷库';cameraUI.render();history.replaceState(null,'','#cameras');window.scrollTo({top:0,behavior:'instant'});
}
function visiblePhotos() { return current()?.photos.filter(p => !$('#star-filter').checked || p.starred) || []; }
function renderFilmOptions(){
  const recent=recentFilmNames(library),names=[...new Set([...recent,...filmStocks.map(f=>f.name),...library.rolls.map(r=>r.film).filter(Boolean)].map(name=>findFilmStock(name)?.name||name))];
  $('#film-options').innerHTML=sortByRecentFilms(names,recent,name=>name).map(name=>`<option value="${esc(name)}"></option>`).join('');
}
function updateCollectionFilters(){
  const options=(selector,values,label,missing=false)=>{const el=$(selector),old=el.value,names=[...new Set(values.filter(Boolean))].sort((a,b)=>a.localeCompare(b,'zh-CN',{numeric:true})),ordered=selector==='#filter-film'?sortByRecentFilms(names,recentFilmNames(library),name=>name):names;el.innerHTML=`<option value="">${label}</option>`+ordered.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join('')+(missing?'<option value="__missing__">未记录</option>':'');if([...el.options].some(o=>o.value===old))el.value=old;};
  options('#filter-camera',library.rolls.map(r=>r.camera),'全部相机',true);options('#filter-film',library.rolls.map(r=>r.film),'全部型号',true);options('#filter-format',library.rolls.map(r=>filmPresentation(r).format),'全部规格');options('#filter-year',library.rolls.map(r=>rollDate(r).slice(0,4)),'全部年份',true);
}
function resetPhotoSelection(){selectedPhotos.clear();selectionAnchor=null;selectionMode=false;}
function selectionButton(p){return `<button type="button" class="photo-select" data-select-photo="${esc(p.id)}" aria-label="选择照片 ${esc(p.name)}" aria-pressed="${selectedPhotos.has(p.id)}">${selectedPhotos.has(p.id)?'✓':'＋'}</button>`;}
function updatePhotoSelection(){
  const r=current();if(!r)return;
  const valid=new Set(visiblePhotos().map(p=>p.id));selectedPhotos=new Set([...selectedPhotos].filter(id=>valid.has(id)));
  $('#current-roll-context').textContent=`№ ${r.number} · ${r.title}`;
  $('#selected-count').textContent=`${visiblePhotos().length} / ${r.photos.length} 帧 · 已选 ${selectedPhotos.size} 张`;
  $('#selection-mode').setAttribute('aria-pressed',selectionMode);$('#selection-mode').textContent=selectionMode?'完成选择':'选择照片';
  $('#select-all-photos').disabled=!valid.size;$('#clear-photo-selection').disabled=!selectedPhotos.size;
  $('#copy-originals').disabled=!selectedPhotos.size||copyBusy||!fileClipboard;$('#copy-originals').textContent=copyBusy?'正在复制…':`复制原图${selectedPhotos.size?' ('+selectedPhotos.size+')':''}`;
  $('#copy-originals').title=fileClipboard?'复制当前显示版本对应的原文件，原始方向与画质保持不变':'此功能需要 Windows 本机服务';
  $('#detail-view').classList.toggle('selecting-photos',selectionMode);
  document.querySelectorAll('[data-select-photo]').forEach(button=>{const selected=selectedPhotos.has(button.dataset.selectPhoto);button.setAttribute('aria-pressed',selected);button.textContent=selected?'✓':'＋';button.closest('.photo-card,.film-frame')?.classList.toggle('photo-is-selected',selected);});
  document.querySelectorAll('#photo-grid .photo-card').forEach(card=>{card.draggable=!uploadBusy&&!selectionMode&&!selectedPhotos.size;});
}
function choosePhoto(id,event){event.preventDefault();selectionMode=true;selectedPhotos=selectPhotoRange(selectedPhotos,visiblePhotos().map(p=>p.id),selectionAnchor,id,{range:event.shiftKey,additive:event.ctrlKey||event.metaKey});if(!event.shiftKey||!selectionAnchor)selectionAnchor=id;updatePhotoSelection();}
async function copySelectedOriginals(){
  const r=current();if(!r||!selectedPhotos.size||copyBusy||!fileClipboard)return;
  const ids=r.photos.filter(p=>selectedPhotos.has(p.id)).map(p=>p.id);copyBusy=true;updatePhotoSelection();
  try{const result=await send(`/api/rolls/${r.id}/copy-originals`,'POST',{ids,version:$('#version-view').value});toast(`已复制 ${result.count} 个原图文件，可在 Windows 文件夹按 Ctrl+V 粘贴`);}catch(e){toast(e.message);}finally{copyBusy=false;updatePhotoSelection();}
}
function renderArchiveLabels(r) {
  const filmInfo=filmPresentation(r);
  $('#breadcrumb').textContent=r.title;$('#roll-number').textContent=`ROLL № ${r.number} / ${filmInfo.format||'规格待补全'}`;
  $('#roll-title').setAttribute('aria-label',r.title);
  $('#roll-summary').innerHTML=`<span>${esc(r.camera||'相机未记录')}</span><span>·</span><span>${esc(r.film||'胶卷未记录')}${filmInfo.iso?' / ISO '+esc(filmInfo.iso):''}</span><span>·</span><span>${r.photos.length} 张照片</span>`;
  updatePhotoSelection();
}
function renderDetail() {
  const r = current(); if (!r) return;
  renderArchiveLabels(r);inlineArchive.render(r);filmUI.renderPreviews();
  rollNavigation.render();
  $('#roll-meta').textContent=r.sourceFolder?`${r.storageMode==='reference'?'引用原目录，请保留原文件夹':'原图已复制到光匣'} · ${r.sourceFolder}`:'';
  renderPhotos(); $('#export-sheet').disabled = !r.photos.length || uploadBusy; $('#orientation-check').disabled = !r.photos.length || uploadBusy; $('#orientation-check').textContent=automaticOrientation?'自动方向识别':'方向核对';
}
function renderPhotos() {
  const r = current(); if (!r) return;
  if(!filmLayoutPending&&filmDimensions)filmPull=reelExposure($('#film-strip').scrollLeft,filmMaximum,filmDimensions.pitch,filmViewPhotos.length);
  const ongoing=filmMotion.mode==='spring'&&filmDimensions?{index:reelExposure(filmMotion.target,filmMaximum,filmDimensions.pitch,filmViewPhotos.length),manual:false,animate:true,origin:filmMotion.source}:null;
  filmMotion.cancel();
  const photos = visiblePhotos(),filmInfo=filmPresentation(r);
  filmViewPhotos=photos;filmOrdinals=photos.map(photo=>r.photos.indexOf(photo)+1);filmCounterKey='';
  const reelKey=r.id+'|'+filmInfo.format+'|'+photos.map(p=>p.id).join(',');
  if(reelKey!==filmRenderKey){filmPull=0;filmPendingSeek=null;filmRenderKey=reelKey;}else if(ongoing)filmPendingSeek=ongoing;
  filmLayoutPending=true;
  renderFilmCanister($('.film-stage'),r);
  $('#photo-empty').hidden = r.photos.length > 0;
  $('#photo-hint').hidden = !r.photos.length || view !== 'grid';
  $('#photo-grid').hidden = view !== 'grid' || !r.photos.length;
  $('#film-view').hidden = view !== 'film' || !r.photos.length;
  $('#photo-grid').innerHTML = photos.map((p, i) => `<article class="photo-card" draggable="${!uploadBusy&&!selectionMode&&!selectedPhotos.size}" data-photo="${p.id}" style="animation-delay:${Math.min(i,10)*25}ms">${selectionButton(p)}<button class="photo-open" data-open="${p.id}" aria-label="查看第 ${r.photos.indexOf(p)+1} 帧 ${esc(p.name)}"><img src="${imageUrl(p)}" alt="${esc(p.name)}" loading="lazy"></button><div class="photo-caption"><span>${String(r.photos.indexOf(p)+1).padStart(2,'0')} / ${esc(p.name)}</span><button class="star-button ${p.starred ? 'selected' : ''}" data-star="${p.id}" aria-label="${p.starred ? '取消' : '设为'}精选 ${esc(p.name)}" aria-pressed="${p.starred}">${p.starred ? '★' : '☆'}</button></div></article>`).join('');
  $('#film-strip').innerHTML = `<div class="reel-content"><div class="film-ribbon">${[...photos].reverse().map(p => `<div class="film-frame" data-frame="${r.photos.indexOf(p)+1}">${selectionButton(p)}<span class="film-edge-label">${esc(filmInfo.brand)} ${esc(filmInfo.iso)} <b>${String(r.photos.indexOf(p)+1).padStart(2,'0')}</b></span><button data-open="${p.id}" aria-label="放大第 ${r.photos.indexOf(p)+1} 帧 ${esc(p.name)}"><img src="${imageUrl(p)}" alt="${esc(p.name)}" loading="lazy" draggable="false"></button><span class="film-frame-caption">${String(r.photos.indexOf(p)+1).padStart(2,'0')} ◁ ${esc(p.name)}</span></div>`).join('')}<div class="reel-tip" aria-hidden="true"><span>${esc(r.number)}</span><small>卷头 →</small></div></div><div class="reel-end-space" aria-hidden="true"></div></div>`;
  updatePhotoSelection();
  $('#film-seek').max = Math.max(0, photos.length - 1); $('#film-seek').disabled = !photos.length;
  requestFilmLayout();
  if (!photos.length && r.photos.length) { $('#photo-grid').innerHTML = '<p class="muted">还没有精选照片，点击照片下方的星标来添加。</p>'; $('#film-strip').innerHTML = '<p class="muted">这一卷还没有精选照片。</p>'; }
}
function setView(value) { stopFilm(); view = value; $('#grid-tab').setAttribute('aria-selected', value === 'grid'); $('#film-tab').setAttribute('aria-selected', value === 'film'); renderPhotos(); }
function stopFilm(stopMotion=true) { clearInterval(filmTimer); filmTimer = null; $('#play-film').textContent = '▷ 自动走片';if(stopMotion){filmPendingSeek=null;filmMotion.cancel();requestFilmPosition();} }
function filmFrames() { return [...$('#film-strip').querySelectorAll('.film-frame')]; }
function requestFilmLayout() {
  if(filmMotion.mode==='spring'&&filmDimensions&&!filmPendingSeek)filmPendingSeek={index:reelExposure(filmMotion.target,filmMaximum,filmDimensions.pitch,filmViewPhotos.length),manual:false,animate:true,origin:filmMotion.source};
  filmMotion.cancel();filmLayoutPending=true;cancelAnimationFrame(filmLayoutRAF);
  filmLayoutRAF=requestAnimationFrame(()=>{
    const r=current(),strip=$('#film-strip');if(!r||view!=='film'||!strip.clientWidth)return;
    filmDimensions=layoutFilmCanister($('.film-stage'),r);
    const spacer=strip.querySelector('.reel-end-space');
    if(spacer)spacer.style.width=Math.max(0,strip.clientWidth-filmDimensions.pitch-filmDimensions.tip)+'px';
    const maximum=Math.max(0,strip.scrollWidth-strip.clientWidth);filmMaximum=maximum;
    strip.scrollTo({left:reelScroll(filmPull,maximum,filmDimensions.pitch,filmFrames().length),behavior:'instant'});
    filmLayoutPending=false;updateFilmPosition();
    if(filmPendingSeek){const pending=filmPendingSeek;filmPendingSeek=null;scrollFilmTo(pending.index,pending.manual,pending.animate,pending.origin);if(pending.origin==='seek')$('#film-seek').value=Math.max(0,Math.min(filmViewPhotos.length-1,pending.index));}
  });
}
function nearestFilmIndex() {return Math.max(0,Math.min(filmViewPhotos.length-1,Math.round(filmPull)));}
function requestFilmPosition() {if(!filmPositionRAF)filmPositionRAF=requestAnimationFrame(()=>{filmPositionRAF=0;updateFilmPosition();});}
function updateFilmPosition() {
  if(filmLayoutPending||!filmDimensions)return;
  const count=filmViewPhotos.length,r=current(),strip=$('#film-strip');if(!r)return;
  filmPull=reelExposure(strip.scrollLeft,filmMaximum,filmDimensions.pitch,count);
  const index=nearestFilmIndex(),frame=filmOrdinals[index]||0,seek=$('#film-seek'),key=r.id+'|'+frame+'|'+count;
  if(filmCounterKey!==key){
    filmCounterKey=key;$('#film-position').textContent=count?`${String(frame).padStart(2,'0')} / ${String(r.photos.length).padStart(2,'0')}`:'无精选照片';
    seek.setAttribute('aria-valuetext',count?`第 ${frame} 帧`:'无照片');
    $('#film-prev').disabled=!count||index===0;$('#film-next').disabled=!count||index===count-1;$('#play-film').disabled=count<2;
  }
  if(!(document.activeElement===seek&&filmMotion.source==='seek'))seek.value=index;
  $('.film-stage').dataset.exposedFrames=String(count?Number((1+filmPull).toFixed(4)):0);
  if(filmTimer&&index===count-1)stopFilm(false);
}
function scrollFilmTo(index,manual=true,animate=true,origin='step') {
  if(manual)stopFilm(false);const count=filmViewPhotos.length;if(!count)return;
  if(filmLayoutPending||!filmDimensions){filmPendingSeek={index,manual,animate,origin};return;}
  const exposure=Math.max(0,Math.min(count-1,index));
  filmMotion.to(reelScroll(exposure,filmMaximum,filmDimensions.pitch,count),{immediate:!animate,origin});
}
function playFilm() {
  if (filmTimer) return stopFilm();
  const frames = filmFrames(); if (frames.length < 2) return;
  if (nearestFilmIndex() === frames.length - 1) scrollFilmTo(0, false, false);
  $('#play-film').textContent = 'Ⅱ 暂停走片';
  filmTimer = setInterval(() => { const index = nearestFilmIndex(); if (index >= filmFrames().length - 1) return stopFilm(false); scrollFilmTo(index + 1, false, true, 'auto'); }, 1700);
}
function openForm(roll = null) {
  editingId = roll?.id || null; const form = $('#roll-form'); form.reset(); $('#form-error').textContent = '';
  cameraUI.options();
  $('#form-title').textContent = roll ? '编辑胶卷档案' : '新建胶卷档案';
  if (roll) { for (const element of form.elements) if (element.name && roll[element.name] != null) element.value = roll[element.name]; }
  else { const year = new Date().getFullYear(); let n = library.rolls.length + 1; while (library.rolls.some(r => r.number === `${year}-${String(n).padStart(3,'0')}`)) n++; form.elements.number.value = `${year}-${String(n).padStart(3,'0')}`; }
  $('#roll-dialog').showModal();
  filmUI.renderPreviews();
}
async function saveRoll(event) {
  event.preventDefault(); const button = $('#save-roll'); button.disabled = true; $('#form-error').textContent = '';
  try { const metadata = Object.fromEntries(new FormData($('#roll-form'))); const roll = await send(editingId ? '/api/rolls/' + editingId : '/api/rolls', editingId ? 'PUT' : 'POST', metadata); await refresh(); $('#roll-dialog').close(); openRoll(roll.id); toast('胶卷档案已保存'); }
  catch (e) { $('#form-error').textContent = e.message; } finally { button.disabled = false; }
}
async function thumbnail(file) {
  const bitmap = await createImageBitmap(file); const scale = Math.min(1, 1400 / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas'); canvas.width = Math.round(bitmap.width * scale); canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.drawImage(bitmap,0,0,canvas.width,canvas.height); bitmap.close();
  return new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', .88));
}
async function importPhotos(files) {
  if (uploadBusy || !current() || !files.length) return;
  const rollId = currentId; const ignored=[...files].filter(f=>f.name.startsWith('.')||/\.thm$/i.test(f.name)).length;const sorted = [...files].filter(f=>!f.name.startsWith('.')&&!/\.thm$/i.test(f.name)).sort((a,b) => a.name.localeCompare(b.name, 'zh-CN', { numeric: true }));
  if(!sorted.length)return toast('没有可导入的照片，THM 和隐藏文件已忽略。');
  uploadBusy = true; $('#import-progress').hidden = false; $('#progress-bar').value = 0;
  rollNavigation.render();
  $('#import-photos').disabled = true; $('#empty-import').disabled = true; $('#export-sheet').disabled = true; $('#delete-roll').disabled = true;
  let completed = 0; const errors = []; let thumbsFailed = 0;
  for (let i=0; i<sorted.length; i++) {
    const file = sorted[i]; $('#progress-label').textContent = `正在导入 ${i+1} / ${sorted.length} · ${file.name}`;
    try {
      if (!/\.(tiff?|bmp|jpe?g|png|webp|gif)$/i.test(file.name)) throw new Error('文件格式不支持');
      if (file.size > 80*1024*1024) throw new Error('文件超过 80 MB');
      const thumb = /\.(tiff?|bmp)$/i.test(file.name)?null:await thumbnail(file); // TIFF / BMP 由本机服务生成预览。
      const photo = await api(`/api/rolls/${rollId}/photos`, { method: 'POST', headers: { 'Content-Type': file.type || 'application/octet-stream', 'X-File-Name': encodeURIComponent(file.name) }, body: file });
      completed++;
      if (thumb) try { await api(`/api/rolls/${rollId}/photos/${photo.id}/thumbnail`, { method: 'POST', body: thumb }); } catch { thumbsFailed++; }
    } catch (e) { errors.push(`${file.name}：${e.message}`); }
    $('#progress-bar').value = ((i+1)/sorted.length)*100;
  }
  uploadBusy = false; $('#import-photos').disabled = false; $('#empty-import').disabled = false; $('#delete-roll').disabled = false;
  rollNavigation.render();
  try { await refresh(); } catch (e) { toast(e.message); }
  $('#import-progress').hidden = true; $('#photo-input').value = '';
  if (errors.length) { $('#progress-label').textContent = `已导入 ${completed} 张；${errors.length} 张未导入。${errors.slice(0,4).join('；')}`; $('#import-progress').hidden = false; }
  toast(`已导入 ${completed} 张照片${errors.length ? `，${errors.length} 张未导入` : ''}${ignored?`，忽略 ${ignored} 个辅助文件`:''}${thumbsFailed ? '，部分照片使用原图预览' : ''}`);
}
function openViewer(id) { stopFilm(); viewerVersion=null;viewerIndex = visiblePhotos().findIndex(p => p.id === id); if (viewerIndex < 0) return; renderViewer(); $('#viewer-dialog').showModal(); }
function renderViewer() {
  const photos = visiblePhotos(), p = photos[viewerIndex]; if (!p) { $('#viewer-dialog').close(); return; }
  const r = current(), index = r.photos.indexOf(p)+1, variants=photoVersions(p),version=variants.find(v=>v.id===viewerVersion)||preferredVersion(p);viewerVersion=version.id;
  $('#viewer-version').innerHTML=variants.map(v=>`<option value="${v.id}">${v.kind==='finished'?'成片':v.kind==='scan'?'扫描原片':'照片'} · ${esc(v.mime?.split('/')[1]?.toUpperCase()||'IMAGE')} · ${esc(v.name)}</option>`).join('');$('#viewer-version').value=viewerVersion;
  $('#viewer-img').src=`/api/rolls/${r.id}/photos/${p.id}/display?version=${version.id}&rotation=${p.rotation||0}&preview=2`;$('#viewer-img').alt=version.name;$('#viewer-img').style.opacity='.45';$('#viewer-error').textContent='正在载入照片…';
  $('#viewer-label').textContent = `${r.title} / FRAME ${String(index).padStart(2,'0')}`;
  $('#viewer-info').textContent = `${version.name} · ${(version.bytes/1024/1024).toFixed(1)} MB · ${viewerIndex+1} / ${photos.length}`;
  $('#viewer-star').textContent = p.starred ? '★ 已精选' : '☆ 精选';
  $('#download-original').href=`/api/rolls/${r.id}/photos/${p.id}/original?version=${version.id}`;$('#download-original').download=version.name;$('#download-original').textContent=version.mime==='image/tiff'?'下载原始 TIFF':'下载当前原图';
  $('#viewer-prev').disabled = viewerIndex === 0; $('#viewer-next').disabled = viewerIndex === photos.length-1;
}
function stepViewer(step) { const next = viewerIndex + step; if (next >= 0 && next < visiblePhotos().length) { viewerIndex = next;viewerVersion=null; renderViewer(); } }
async function toggleStar(id) { const r = current(), p = r?.photos.find(p => p.id === id); if (!p) return; try { const result = await send(`/api/rolls/${r.id}/photos/${id}`, 'PUT', { starred: !p.starred }); Object.assign(p,result); renderPhotos(); if ($('#viewer-dialog').open) { viewerIndex = Math.min(viewerIndex, visiblePhotos().length-1); renderViewer(); } } catch (e) { toast(e.message); } }
function confirmAction(title, description) {
  $('#confirm-title').textContent = title; $('#confirm-description').textContent = description; const dialog = $('#confirm-dialog'); dialog.showModal();
  return new Promise(resolve => { const finish = () => { dialog.removeEventListener('close',finish); resolve(dialog.returnValue === 'yes'); }; dialog.addEventListener('close',finish); });
}
function loadImage(src) { return new Promise((resolve,reject) => { const img = new Image(); img.onload = () => resolve(img); img.onerror = () => reject(new Error('照片读取失败，请重新载入后再导出。')); img.src = src; }); }
function fitText(ctx, text, max) { let t = text; while (ctx.measureText(t).width > max && t.length) t = t.slice(0,-1); return t === text ? t : t + '…'; }
async function buildSheet() {
  const token = ++sheetGeneration, r = current(); if (!r) return; const filmInfo=filmPresentation(r);
  const format = $('#sheet-format').value, light = $('#sheet-theme').value === 'light';
  $('#sheet-preview').classList.toggle('print-format', format !== 'free');
  $('#sheet-format-hint').textContent = format === '3:2' ? '3:2 横向，适合常规照片打印；照片完整显示，留出四周边距。' : format === '16:9' ? '16:9 横向，适合宽幅画面；打印时请选择同样比例或保留白边。' : '高度随照片数量调整，适合查阅整卷接触印样。';
  $('#download-sheet').disabled = true; $('#sheet-info').textContent = '正在生成全部照片的预览…'; sheetCanvas = null;
  try {
    const layout = sheetLayout(r.photos.length, format, $('#sheet-columns').value);
    const { width, height, outputWidth, outputHeight, margin, cellW, cellH, fixed, cols } = layout;
    const canvas = document.createElement('canvas'); canvas.width = outputWidth; canvas.height = outputHeight; const ctx = canvas.getContext('2d');
    ctx.scale(outputWidth / width, outputHeight / height);
    const bg = light ? '#f3f2ec' : '#101310', fg = light ? '#252b23' : '#e5e9dc', muted = light ? '#687260' : '#a4b392', gold = light ? '#78663e' : '#c3ab6d';
    ctx.fillStyle = bg; ctx.fillRect(0,0,width,height); ctx.fillStyle = gold; ctx.font = '22px monospace'; ctx.fillText('LIGHTBOX / CONTACT SHEET',margin,65); ctx.textAlign = 'right'; ctx.fillText(`ROLL № ${r.number} / ${r.photos.length} FRAMES`,width-margin,65); ctx.textAlign='left';
    ctx.fillStyle = fg; ctx.font = `bold ${fixed ? 48 : 58}px sans-serif`; ctx.fillText(fitText(ctx,r.title,width-margin*2),margin,fixed ? 122 : 150);
    ctx.fillStyle = muted; ctx.font = `${fixed ? 23 : 27}px sans-serif`; ctx.fillText(fitText(ctx,`${r.camera || '相机未记录'}  /  ${r.film || '胶卷未记录'}${filmInfo.iso ? '  /  ISO ' + filmInfo.iso : ''}  /  ${filmInfo.format || '规格待补全'}`,width-margin*2),margin,fixed ? 165 : 204);
    ctx.font = '22px sans-serif'; ctx.fillText(fitText(ctx,`${r.shotStart || r.shotEnd ? '拍摄 ' : ''}${period(r)}    上卷 ${date(r.loadedAt)}    冲洗 ${date(r.developedAt)}${r.lab ? '    '+r.lab : ''}`,width-margin*2),margin,fixed ? 201 : 251);
    for (let i=0;i<r.photos.length;i++) {
      if (token !== sheetGeneration) return;
      const photo = r.photos[i], img = await loadImage(imageUrl(photo)); const { x, y } = framePosition(layout, i, r.photos.length);
      ctx.fillStyle = light ? '#dddcd1' : '#272c21'; ctx.fillRect(x,y,cellW,cellH);
      const scale = Math.min(cellW/img.naturalWidth,cellH/img.naturalHeight), dw = img.naturalWidth*scale, dh = img.naturalHeight*scale;
      ctx.drawImage(img,x+(cellW-dw)/2,y+(cellH-dh)/2,dw,dh);
      ctx.fillStyle = gold; for (let px=x;px<x+cellW-14;px+=28) ctx.fillRect(px,y-15,13,7);
      ctx.font = '20px monospace'; ctx.fillText(fitText(ctx,`${String(i+1).padStart(2,'0')}  ${photo.starred?'★ ':''}${photo.name}`,cellW-20),x,y+cellH+31);
    }
    ctx.fillStyle = muted; ctx.font='18px monospace'; ctx.fillText('KEEP THE GRAIN. KEEP THE MEMORY.',margin,height-40); ctx.textAlign='right'; ctx.fillText('光匣 / LIGHTBOX',width-margin,height-40);
    if (token !== sheetGeneration) return;
    canvas.dataset.format = format.replace(':', 'x'); sheetCanvas = canvas; $('#sheet-preview').replaceChildren(canvas); $('#sheet-info').textContent = `${outputWidth} × ${outputHeight} 像素 · ${format === 'free' ? '按内容适配' : format + ' 横向'} · ${cols} 帧 / 行 · ${r.photos.length} 张照片 · PNG 格式`; $('#download-sheet').disabled = false;
  } catch(e) { if(token===sheetGeneration) { $('#sheet-preview').replaceChildren(); $('#sheet-info').textContent=e.message; } }
}
function pickPhotos() { if(!uploadBusy) $('#photo-input').click(); }
$('#new-roll').onclick = $('#empty-new').onclick = () => openForm();
const inlineArchive=setupInlineArchive({getCurrent:current,save:(id,input)=>send('/api/rolls/'+id,'PUT',input),onSaved:updated=>{
  const roll=library.rolls.find(r=>r.id===updated.id);if(!roll)return;
  if(updated.film!==roll.film&&updated.film)library.recentFilms=rememberFilm(recentFilmNames(library),updated.film);
  for(const key of ['title','number','camera','cameraId','film','iso','format','loadedAt','shotStart','shotEnd','developedAt','lab','notes'])roll[key]=updated[key];
  renderLibrary();filmUI.renderPreviews();if(currentId===updated.id){renderArchiveLabels(roll);if(view==='film'){const left=$('#film-strip').scrollLeft;renderPhotos();$('#film-strip').scrollLeft=left;}}
}});
$('#roll-form').onsubmit = saveRoll;
$('#roll-grid').onclick = e => { const card = e.target.closest('[data-roll]'); if(card) openRoll(card.dataset.roll); };
$('#all-rolls').onclick = showLibrary;
$('#my-cameras').onclick=showCameras;
$('#camera-back').onclick=()=>{const id=cameraReturnId,form=cameraReturnForm;if(form){showLibrary();$('#roll-dialog').showModal();}else if(id&&library.rolls.some(r=>r.id===id))openRoll(id);else showLibrary();};
$('#search').oninput = renderLibrary; $('#back-library').onclick = showLibrary;
for(const id of ['roll-sort','filter-camera','filter-film','filter-format','filter-year'])$('#'+id).onchange=renderLibrary;
$('#reset-roll-filters').onclick=()=>{for(const id of ['search','filter-camera','filter-film','filter-format','filter-year'])$('#'+id).value='';renderLibrary();};
$('#selection-mode').onclick=()=>{selectionMode=!selectionMode;if(!selectionMode)resetPhotoSelection();updatePhotoSelection();};
$('#select-all-photos').onclick=()=>{selectionMode=true;selectedPhotos=new Set(visiblePhotos().map(p=>p.id));selectionAnchor=visiblePhotos()[0]?.id;updatePhotoSelection();};
$('#clear-photo-selection').onclick=()=>{selectedPhotos.clear();selectionAnchor=null;updatePhotoSelection();};
$('#copy-originals').onclick=copySelectedOriginals;
document.addEventListener('keydown',e=>{
  if(!current()||$('#detail-view').hidden||document.querySelector('dialog[open]')||e.target.closest('input,textarea,select,[contenteditable="true"]'))return;
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='a'){e.preventDefault();$('#select-all-photos').click();}
  if((e.ctrlKey||e.metaKey)&&!e.altKey&&e.key.toLowerCase()==='c'&&selectedPhotos.size&&!window.getSelection()?.toString()){e.preventDefault();copySelectedOriginals();}
  if(e.key==='Escape'&&(selectionMode||selectedPhotos.size)){resetPhotoSelection();updatePhotoSelection();}
});
const updateSelectionOffset=()=>document.documentElement.style.setProperty('--selection-top',matchMedia('(max-width:760px)').matches?$('.sidebar').getBoundingClientRect().height+'px':'0px');
new ResizeObserver(updateSelectionOffset).observe($('.sidebar'));window.addEventListener('resize',updateSelectionOffset);
$('#import-photos').onclick = $('#empty-import').onclick = pickPhotos; $('#photo-input').onchange = e => importPhotos(e.target.files);
$('#grid-tab').onclick = () => setView('grid'); $('#film-tab').onclick = () => setView('film'); $('#star-filter').onchange = () => { stopFilm(); renderPhotos(); };
$('#film-prev').onclick = () => scrollFilmTo(nearestFilmIndex() - 1);
$('#film-next').onclick = () => scrollFilmTo(nearestFilmIndex() + 1);
$('#film-seek').oninput = e => scrollFilmTo(Number(e.target.value),true,true,'seek');
$('#film-strip').addEventListener('scroll', requestFilmPosition, {passive:true});
let lastReelWidth=0;new ResizeObserver(entries=>{const width=entries[0].contentRect.width;if(view==='film'&&width>0&&Math.abs(width-lastReelWidth)>1){lastReelWidth=width;requestFilmLayout();}}).observe($('.film-stage'));
$('#film-strip').addEventListener('keydown', e => { if(e.target!==e.currentTarget)return; if(['ArrowLeft','ArrowRight','Home','End'].includes(e.key)){e.preventDefault();scrollFilmTo(e.key==='Home'?0:e.key==='End'?filmFrames().length-1:nearestFilmIndex()+(e.key==='ArrowRight'?1:-1),true,e.key.startsWith('Arrow'));} });
$('#play-film').onclick = playFilm;
$('#film-strip').addEventListener('wheel',e=>{
  if(e.ctrlKey||filmViewPhotos.length<2||filmLayoutPending)return;
  e.preventDefault();stopFilm(false);
  const strip=$('#film-strip'),delta=Math.abs(e.deltaY)>Math.abs(e.deltaX)?-e.deltaY:e.deltaX;
  filmMotion.wheel(wheelPixels(delta,e.deltaMode,strip.clientWidth));
},{passive:false});
let filmDrag=null,suppressFilmClick=false;
$('#film-strip').addEventListener('pointerdown',e=>{
  if(e.pointerType==='touch'){stopFilm();return;}
  if(e.button!==0)return;stopFilm();filmMotion.beginDrag(e.timeStamp);
  filmDrag={x:e.clientX,left:$('#film-strip').scrollLeft,moved:false,id:e.pointerId};
});
$('#film-strip').addEventListener('pointermove',e=>{
  if(!filmDrag||filmDrag.id!==e.pointerId)return;
  const strip=$('#film-strip'),distance=e.clientX-filmDrag.x;
  if(Math.abs(distance)>4&&!filmDrag.moved){filmDrag.moved=true;strip.setPointerCapture(e.pointerId);strip.classList.add('is-dragging');}
  if(!filmDrag.moved)return;
  const samples=e.getCoalescedEvents?.()||[];
  for(const sample of samples.length?samples:[e])filmMotion.dragTo(filmDrag.left-(sample.clientX-filmDrag.x),sample.timeStamp);
});
function endFilmDrag(e) {
  if(!filmDrag)return;
  const moved=filmDrag.moved;filmMotion.release(e.timeStamp,{inertia:moved&&e.type==='pointerup'});
  if(moved){suppressFilmClick=true;setTimeout(()=>suppressFilmClick=false,220);}
  filmDrag=null;$('#film-strip').classList.remove('is-dragging');
}
$('#film-strip').addEventListener('pointerup',endFilmDrag);$('#film-strip').addEventListener('pointercancel',endFilmDrag);$('#film-strip').addEventListener('lostpointercapture',endFilmDrag);
$('#film-strip').addEventListener('pointerleave',e=>{if(filmDrag&&!filmDrag.moved)endFilmDrag(e);});
$('#film-strip').addEventListener('dragstart',e=>e.preventDefault());
$('#film-strip').addEventListener('click',e=>{if(suppressFilmClick){e.preventDefault();e.stopPropagation();suppressFilmClick=false;}},true);
document.querySelector('.view-tabs').addEventListener('keydown',e=>{if(['ArrowLeft','ArrowRight'].includes(e.key)){e.preventDefault();const value=view==='grid'?'film':'grid';setView(value);$('#'+value+'-tab').focus();}});
document.addEventListener('visibilitychange', () => { if(document.hidden) stopFilm(); });
$('#detail-view').onclick = e => { const pick=e.target.closest('[data-select-photo]'),open=e.target.closest('[data-open]'),star=e.target.closest('[data-star]');if(pick){choosePhoto(pick.dataset.selectPhoto,e);return;}if(open){if(selectionMode||e.shiftKey||e.ctrlKey||e.metaKey)choosePhoto(open.dataset.open,e);else openViewer(open.dataset.open);}if(star)toggleStar(star.dataset.star); };
$('#viewer-close').onclick = () => $('#viewer-dialog').close(); $('#viewer-prev').onclick = () => stepViewer(-1); $('#viewer-next').onclick = () => stepViewer(1); $('#viewer-star').onclick = () => { const p=visiblePhotos()[viewerIndex]; if(p) toggleStar(p.id); };
$('#viewer-dialog').onkeydown = e => { if(e.key==='ArrowLeft') { e.preventDefault(); stepViewer(-1); } if(e.key==='ArrowRight') { e.preventDefault(); stepViewer(1); } };
$('#delete-photo').onclick = async () => { const r=current(), p=visiblePhotos()[viewerIndex]; if(!p) return; if(await confirmAction('删除这张照片？',`${p.name} 将从光匣档案中删除。导入前的源文件不受影响。`)) try { await api(`/api/rolls/${r.id}/photos/${p.id}`,{method:'DELETE'}); await refresh(); viewerIndex=Math.min(viewerIndex,visiblePhotos().length-1); renderViewer(); toast('照片已删除'); } catch(e) { toast(e.message); } };
$('#delete-roll').onclick = async () => { if(uploadBusy)return; const r=current(); if(await confirmAction('删除这一卷？',`“${r.title}”的档案和 ${r.photos.length} 张已导入照片将从光匣中删除。此操作无法撤销；导入前的源文件不受影响。`)) try { await api('/api/rolls/'+r.id,{method:'DELETE'}); showLibrary(); await refresh(); toast('胶卷已删除'); } catch(e) { toast(e.message); } };
$('#confirm-cancel').onclick = () => $('#confirm-dialog').close('no'); $('#confirm-yes').onclick = () => $('#confirm-dialog').close('yes'); $('#confirm-dialog').addEventListener('cancel',()=>$('#confirm-dialog').returnValue='no');
document.querySelectorAll('.close-dialog').forEach(b=>b.onclick=()=>b.closest('dialog').close());
$('#storage-help').onclick=()=>$('#help-dialog').showModal();
$('#version-view').onchange=()=>{stopFilm();renderPhotos();};
$('#viewer-version').onchange=e=>{viewerVersion=e.target.value;renderViewer();};
$('#viewer-img').onload=()=>{$('#viewer-img').style.opacity='1';$('#viewer-error').textContent=visiblePhotos()[viewerIndex]?.rotation?'已按档案方向旋转预览，原文件不改写。':'';};
$('#viewer-img').onerror=()=>{$('#viewer-img').style.opacity='0';$('#viewer-error').textContent='无法读取原图。引用的照片请检查原文件夹是否移动；浏览缩略图仍然保留。';};
$('#viewer-rotate').onclick=async()=>{const r=current(),p=visiblePhotos()[viewerIndex];if(!p)return;$('#viewer-rotate').disabled=true;try{const result=await send(`/api/rolls/${r.id}/photos/${p.id}`,'PUT',{rotation:((p.rotation||0)+90)%360});Object.assign(p,result);renderPhotos();renderViewer();}catch(e){toast(e.message);}finally{$('#viewer-rotate').disabled=false;}};
$('#import-folder').onclick=()=>$('#folder-dialog').showModal();
$('#folder-path').oninput=()=>{checkedFolder=null;$('#start-folder-import').disabled=true;$('#folder-summary').replaceChildren();$('#folder-error').textContent='';};
$('#include-aggregates').onchange=()=>$('#folder-path').oninput();
$('#inspect-folder').onclick=async()=>{
  $('#inspect-folder').disabled=true;$('#folder-error').textContent='';
  try {
    const plan=await send('/api/folder/inspect','POST',{path:$('#folder-path').value,includeAggregates:$('#include-aggregates').checked});checkedFolder=plan.root;
    $('#folder-summary').innerHTML=`<p><strong>${plan.rolls.length} 卷 · ${plan.frames} 帧</strong><br>${plan.versions} 个原图 / 成片文件 · ${(plan.bytes/1024**3).toFixed(2)} GB · 忽略 ${plan.ignored} 个辅助文件</p><table><thead><tr><th>胶卷目录</th><th>编号</th><th>帧数</th><th>已关联成片</th></tr></thead><tbody>${plan.rolls.map(r=>`<tr><td>${esc(r.label)}</td><td>${esc(r.number)}</td><td>${r.frames}</td><td>${r.paired}</td></tr>`).join('')}</tbody></table>${(plan.warnings||[]).map(w=>`<p class="muted">${esc(w)}</p>`).join('')}<p class="muted">重复导入同一目录会跳过已收录的文件。相机、胶卷型号与拍摄日期待你补全。</p>`;
    $('#start-folder-import').disabled=false;
  }catch(e){checkedFolder=null;$('#start-folder-import').disabled=true;$('#folder-error').textContent=e.message;}finally{$('#inspect-folder').disabled=false;}
};
async function followImport(id) {
  folderBusy=true;$('#import-folder').disabled=true;$('#inspect-folder').disabled=true;$('#start-folder-import').disabled=true;$('#folder-progress').hidden=false;
  try {
    while(true) {
      const job=await api('/api/imports/'+id);$('#folder-progress-label').textContent=`${job.processed} / ${job.total} 帧 · ${job.current||'整理档案'}`;$('#folder-progress-bar').value=job.total?job.processed/job.total*100:100;
      if(job.status!=='running') {
        await refresh();$('#folder-progress-label').textContent=`${job.status==='failed'?'导入中断':'导入完成'}：新增 ${job.importedFrames} 帧、${job.importedVersions} 个版本，跳过 ${job.skipped} 个已收录文件。${job.copiedFiles?`已将 ${job.copiedFiles} 个引用原图转为独立副本。`:''}`;
        $('#folder-error').textContent=job.errors.slice(0,6).join('\n');toast(job.errors.length?`导入完成，有 ${job.errors.length} 项需检查`:`已整理 ${job.rollIds.length} 卷胶片`);break;
      }
      await new Promise(resolve=>setTimeout(resolve,600));
    }
  }catch(e){$('#folder-error').textContent=e.message;}finally{folderBusy=false;$('#import-folder').disabled=false;$('#inspect-folder').disabled=false;$('#start-folder-import').disabled=!checkedFolder;}
}
$('#start-folder-import').onclick=async()=>{
  if(!checkedFolder||folderBusy)return;$('#start-folder-import').disabled=true;$('#folder-error').textContent='';
  try { const job=await send('/api/folder/import','POST',{path:checkedFolder,mode:$('#folder-mode').value,includeAggregates:$('#include-aggregates').checked});await followImport(job.id); }catch(e){$('#folder-error').textContent=e.message;$('#start-folder-import').disabled=false;}
};
$('#export-sheet').onclick=()=>{ $('#sheet-preview').replaceChildren(); $('#export-dialog').showModal(); buildSheet(); };
$('#sheet-format').onchange=$('#sheet-columns').onchange=$('#sheet-theme').onchange=buildSheet;
$('#export-dialog').addEventListener('close',()=>{sheetGeneration++;});
$('#download-sheet').onclick=async()=>{
  if(!sheetCanvas)return; const r=current(), canvas=sheetCanvas, format=canvas.dataset.format; $('#download-sheet').disabled=true;
  try {
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png')); if(!blob)throw new Error('图片生成失败，请减少尺寸。');
    const result=await api(`/api/rolls/${r.id}/preview?format=${format}`,{method:'POST',headers:{'Content-Type':'image/png'},body:blob});
    const a=document.createElement('a');a.href=result.url;a.download=`${r.number.replace(/[\\/:*?"<>|]/g,'-')}-接触印样-${format}.png`;document.body.append(a);a.click();a.remove();
    $('#sheet-info').textContent='预览图已保存到软件目录的 data / previews 文件夹，也可以从浏览器下载。';
    toast('预览图已保存到本机');
  }catch(e){toast(e.message);}finally{$('#download-sheet').disabled=!sheetCanvas;}
};
let draggedId;
$('#photo-grid').addEventListener('dragstart',e=>{const card=e.target.closest('[data-photo]');if(!card||uploadBusy||selectionMode||selectedPhotos.size){e.preventDefault();return;}e.dataTransfer.setData('text/plain',card.dataset.photo);draggedId=card.dataset.photo;card.classList.add('dragging');});
$('#photo-grid').addEventListener('dragover',e=>{if(!draggedId)return;const card=e.target.closest('[data-photo]');if(card){e.preventDefault();card.classList.add('drag-over');}});
$('#photo-grid').addEventListener('dragleave',e=>e.target.closest('[data-photo]')?.classList.remove('drag-over'));
$('#photo-grid').addEventListener('dragend',()=>{draggedId=null;document.querySelectorAll('.dragging,.drag-over').forEach(c=>c.classList.remove('dragging','drag-over'));});
$('#photo-grid').addEventListener('drop',async e=>{if(!draggedId)return;e.preventDefault();const target=e.target.closest('[data-photo]');if(!target||target.dataset.photo===draggedId)return;const r=current(), ids=r.photos.map(p=>p.id),from=ids.indexOf(draggedId),to=ids.indexOf(target.dataset.photo);ids.splice(from,1);ids.splice(to,0,draggedId);draggedId=null;try{await send(`/api/rolls/${r.id}/order`,'PUT',{ids});await refresh();toast('帧序已保存');}catch(err){toast(err.message);}});
$('#detail-view').addEventListener('dragover',e=>{if(e.dataTransfer.types.includes('Files')){e.preventDefault();$('#detail-view').classList.add('drop-active');}});
$('#detail-view').addEventListener('dragleave',e=>{if(!$('#detail-view').contains(e.relatedTarget))$('#detail-view').classList.remove('drop-active');});
$('#detail-view').addEventListener('drop',e=>{if(e.dataTransfer.files.length){e.preventDefault();$('#detail-view').classList.remove('drop-active');importPhotos(e.dataTransfer.files);}});
window.addEventListener('beforeunload',e=>{if(uploadBusy){e.preventDefault();e.returnValue='';}});
api('/api/imports/active').then(job=>{if(job){$('#folder-dialog').showModal();followImport(job.id);}}).catch(()=>{});
setupOrientation({getCurrent:current,getVersions:photoVersions,refresh,toast,stopFilm});
const cameraUI=setupCameras({getLibrary:()=>library,send,refresh,toast,confirmAction,showCameras,showCameraRolls:camera=>{showLibrary();$('#search').value=camera.name;renderLibrary();window.scrollTo({top:0,behavior:'instant'});}});
const filmUI=setupFilms({getLibrary:()=>library,recordUse:async film=>{library.recentFilms=await send('/api/film-recents','POST',{film});renderFilmOptions();updateCollectionFilters();},getCurrent:current,applyInline:values=>inlineArchive.applyFields(values),openNew:values=>{openForm();for(const [key,value] of Object.entries(values))$('#roll-form').elements[key].value=value;},toast});
window.addEventListener('hashchange',()=>{if(location.hash==='#cameras'&&$('#cameras-view').hidden)showCameras();else if(location.hash!=='#cameras'&&!$('#cameras-view').hidden)showLibrary();});
api('/api/capabilities').then(c=>{fileClipboard=!!c.fileClipboard;automaticOrientation=c.automaticOrientation;if(!automaticOrientation){$('#orientation-dialog h2').textContent='方向核对';$('#orientation-dialog>p.muted').textContent='当前平台采用手动方向核对。对照预览选择旋转角度，应用后可以撤销；原片不会改写。';$('#orientation-rescan').textContent='重新核对';}if(current())renderDetail();}).catch(()=>{});
refresh().then(()=>{if(location.hash==='#cameras')showCameras();}).catch(e=>{ $('#library-empty').innerHTML='<h2>暂时无法连接本机档案</h2><p>请确认光匣已启动，再刷新页面。</p>'; toast(e.message); });
