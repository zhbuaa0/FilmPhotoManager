import {filmStocks,filmKinds,filmBrands,filterFilmStocks,findFilmStock,filmSelection} from './film-catalog.mjs';
import {filmDefaults,filmPresentation} from './film-canister.mjs';
const $=s=>document.querySelector(s);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const image=stock=>`/film-images/${stock.id}.jpg?v=${stock.imageVersion||1}`;
const credit=stock=>stock.imageLicense?`${stock.imageAuthor} · ${stock.imageLicense}`:stock.imageSourceLabel||stock.sourceLabel;
export function setupFilms({getLibrary,getCurrent,applyInline,openNew,toast}) {
  const dialog=$('#film-picker'),newForm=$('#roll-form'),inlineForm=$('#roll-inline-form');
  let context=null,selected=null,busy=false;
  $('#count-film-stocks').textContent=filmStocks.length;
  $('#film-brand-filter').innerHTML='<option value="">全部品牌</option>'+[...new Set(filmStocks.map(f=>f.brand))].map(b=>`<option value="${b}">${b}${filmBrands[b]&&filmBrands[b]!==b?' / '+filmBrands[b]:''}</option>`).join('');
  $('#film-kind-filter').innerHTML='<option value="">全部类型</option>'+Object.entries(filmKinds).map(([key,label])=>`<option value="${key}">${label}</option>`).join('');
  $('#film-iso-filter').innerHTML='<option value="">全部 ISO / EI</option>'+[...new Set(filmStocks.flatMap(f=>f.isoChoices||[f.iso]))].sort((a,b)=>a-b).map(iso=>`<option value="${iso}">${iso}</option>`).join('');
  document.addEventListener('error',event=>{const img=event.target;if(img instanceof HTMLImageElement&&img.dataset.filmImage!==undefined&&!img.src.endsWith('/film-placeholder.svg')){img.src='/film-placeholder.svg';img.alt='参考图暂不可用，型号仍可选用';}},true);
  function values() {return context?.kind==='inline'?Object.fromEntries(new FormData(inlineForm)):context?.kind==='new'?Object.fromEntries(new FormData(newForm)):{};}
  function renderGrid() {
    const stocks=filterFilmStocks({query:$('#film-stock-search').value,brand:$('#film-brand-filter').value,kind:$('#film-kind-filter').value,format:$('#film-format-filter').value,iso:$('#film-iso-filter').value});
    $('#film-result-count').textContent=`${stocks.length} / ${filmStocks.length} 款型号`;
    $('#film-stock-grid').innerHTML=stocks.map(stock=>{
      const used=getLibrary().rolls.filter(r=>findFilmStock(r.film)?.id===stock.id).length;
      return `<article class="film-stock-card ${selected?.id===stock.id?'selected':''}"><button type="button" data-select-film="${stock.id}" aria-label="选择 ${esc(stock.name)}" aria-pressed="${selected?.id===stock.id}"><div class="film-stock-image"><img src="${image(stock)}" data-film-image alt="${esc(stock.name)} 包装参考图" loading="lazy"></div><div class="film-stock-info"><span>${esc(stock.brand)} · ${filmKinds[stock.kind]}</span><h3>${esc(stock.model)}</h3><p>ISO / EI ${stock.isoChoices?.join(' / ')||stock.iso} · ${stock.formats.join(' / ')}</p><small>${esc(stock.process)}${stock.legacy?' · 历史常用':''}${used?` · 已记录 ${used} 卷`:''}</small></div></button><a class="film-stock-credit" href="${esc(stock.imageSource||stock.source)}" target="_blank" rel="noopener noreferrer">${esc(credit(stock))} ↗</a></article>`;
    }).join('');
    $('#film-stock-empty').hidden=stocks.length>0;
  }
  function renderSelection() {
    $('#film-apply').disabled=!selected||busy;
    $('#film-selected-name').textContent=selected?.name||'先选择一款胶卷';
    $('#film-selected-empty').hidden=!!selected;$('#film-selected-detail').hidden=!selected;
    if(!selected)return;
    const current=values(),f=selected;
    $('#film-selected-image').src=image(f);$('#film-selected-image').alt=f.name+' 包装参考图';
    $('#film-selected-title').textContent=f.name;
    $('#film-selected-facts').textContent=`${filmKinds[f.kind]} · ${f.process} · ${f.formats.join(' / ')}`;
    $('#film-selected-note').textContent=f.note||'型号和包装用于核对记录；包装会因地区、年份与规格不同而变化。';
    $('#film-selected-source').href=f.source;$('#film-selected-source').textContent=f.sourceLabel+' · 查看资料 ↗';
    const imageSource=$('#film-selected-image-source');imageSource.href=f.imageSource||f.source;imageSource.textContent=credit(f)+' · 图片来源 ↗';
    const license=$('#film-selected-license');license.hidden=!f.imageLicense;if(f.imageLicense){license.href=f.imageLicenseUrl;license.textContent=f.imageLicense+' · 已缩放';}
    const format=$('#film-selected-format');format.innerHTML=f.formats.map(value=>`<option>${value}</option>`).join('');format.value=f.formats.includes(current.format)?current.format:f.formats.includes($('#film-format-filter').value)?$('#film-format-filter').value:f.formats.includes('135')?'135':f.formats[0];
    $('#film-selected-iso').innerHTML=(f.isoChoices||[f.iso]).map(value=>`<option value="${value}">${value}</option>`).join('');$('#film-selected-iso').value=String(f.iso);
    $('#film-fill-iso').checked=!current.iso||findFilmStock(current.film)?.id!==f.id||String(current.iso)===String(f.iso);
    $('#film-selected-iso').disabled=!$('#film-fill-iso').checked;
    $('#film-iso-existing').textContent=current.iso?`当前已填 ${current.iso}；不勾选则保留。`:'当前未填，选用时可一并带入。';
    $('#film-apply').textContent=context.kind==='inline'?'用于当前胶卷':context.kind==='new'?'填入胶卷档案':'用此型号新建胶卷';
  }
  function open(kind) {
    const roll=getCurrent();context={kind,...(kind==='inline'?{rollId:roll?.id}:{})};selected=findFilmStock(values().film);
    $('#film-picker-error').textContent='';$('#film-stock-search').value='';for(const id of ['film-brand-filter','film-kind-filter','film-format-filter','film-iso-filter'])$('#'+id).value='';
    $('#film-target').textContent=kind==='inline'?`选用后保存到：${roll?.title||'当前胶卷'}`:kind==='new'?'选用后填入当前表单，保存档案后生效。':'浏览常见型号，选用后可建立一卷新档案。';
    renderGrid();renderSelection();dialog.showModal();
  }
  $('#film-stock-library').onclick=()=>open('browse');
  for(const button of document.querySelectorAll('[data-choose-film]'))button.onclick=()=>open(button.dataset.chooseFilm);
  $('#film-stock-search').oninput=renderGrid;
  for(const id of ['film-brand-filter','film-kind-filter','film-format-filter','film-iso-filter'])$('#'+id).onchange=renderGrid;
  $('#film-reset-filters').onclick=()=>{$('#film-stock-search').value='';for(const id of ['film-brand-filter','film-kind-filter','film-format-filter','film-iso-filter'])$('#'+id).value='';renderGrid();};
  $('#film-stock-grid').onclick=event=>{const button=event.target.closest('[data-select-film]');if(!button)return;selected=filmStocks.find(f=>f.id===button.dataset.selectFilm);$('#film-picker-error').textContent='';renderGrid();renderSelection();if(matchMedia('(max-width:760px)').matches)$('#film-selected-panel').scrollIntoView({block:'nearest'});};
  $('#film-fill-iso').onchange=()=>{$('#film-selected-iso').disabled=!$('#film-fill-iso').checked;};
  $('#film-apply').onclick=async()=>{
    if(!selected||busy)return;busy=true;$('#film-apply').disabled=true;$('#film-picker-error').textContent='';
    try {
      const fields=filmSelection(selected.id,{format:$('#film-selected-format').value,iso:$('#film-selected-iso').value,fillIso:$('#film-fill-iso').checked});
      if(context.kind==='inline'){
        if(getCurrent()?.id!==context.rollId)throw new Error('当前胶卷已变化，请重新选择。');
        await applyInline(fields);dialog.close();toast('胶卷型号已保存');
      } else if(context.kind==='new') {for(const [key,value] of Object.entries(fields))newForm.elements[key].value=value;previousNewFilm=fields.film;dialog.close();renderPreviews();}
      else {dialog.close();openNew(fields);previousNewFilm=fields.film;renderPreviews();}
    } catch(error){$('#film-picker-error').textContent=error.message;}
    finally{busy=false;$('#film-apply').disabled=!selected;}
  };
  function renderPreviews() {
    for(const [kind,form] of [['inline',inlineForm],['new',newForm]]) {
      const target=document.querySelector(`[data-film-preview="${kind}"]`),name=form.elements.film.value,stock=findFilmStock(name),filmInfo=filmPresentation(Object.fromEntries(new FormData(form)));
      target.hidden=!name;
      target.innerHTML=stock?`<img src="${image(stock)}" data-film-image alt="${esc(stock.name)} 包装参考图"><span><strong>${esc(stock.name)}</strong><small>${filmKinds[stock.kind]} · ${esc(stock.process)} · ${esc(filmInfo.iso)} · ${esc(filmInfo.format)}</small></span>`:'<span><small>自定义型号 · 保留你的原始填写，可随时从型号库选择。</small></span>';
    }
  }
  let previousNewFilm='';
  newForm.addEventListener('input',event=>{if(event.target.name==='film'){for(const [key,value] of Object.entries(filmDefaults(event.target.value,previousNewFilm,Object.fromEntries(new FormData(newForm)))))newForm.elements[key].value=value;previousNewFilm=event.target.value;renderPreviews();}});
  newForm.addEventListener('reset',()=>{previousNewFilm='';});
  for(const form of [newForm,inlineForm])form.addEventListener('input',event=>{if(['film','iso','format'].includes(event.target.name))renderPreviews();});
  return {renderPreviews,open};
}
