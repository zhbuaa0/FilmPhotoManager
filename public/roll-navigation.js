const $=selector=>document.querySelector(selector);
const esc=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function setupRollNavigation({getRolls,getCurrent,openRoll,imageUrl,isBusy}) {
  const panel=$('#roll-navigation'),list=$('#roll-navigation-list'),search=$('#roll-navigation-search'),select=$('#roll-navigation-select');
  function render({revealCurrent=false}={}) {
    const current=getCurrent(),rolls=getRolls(),index=rolls.findIndex(r=>r.id===current?.id),busy=isBusy();
    panel.hidden=index<0;
    document.body.classList.toggle('viewing-roll',index>=0);
    $('#all-rolls').classList.toggle('active',index<0);
    if(index<0)return;
    $('#roll-navigation-position').textContent=`${index+1} / ${rolls.length}`;
    $('#previous-roll').disabled=busy||index===0;
    $('#next-roll').disabled=busy||index===rolls.length-1;
    $('#previous-roll').title=index>0?rolls[index-1].title:'已经是第一卷';
    $('#next-roll').title=index<rolls.length-1?rolls[index+1].title:'已经是最后一卷';
    select.disabled=busy;
    select.innerHTML=rolls.map(r=>`<option value="${esc(r.id)}" ${r.id===current.id?'selected':''}>№ ${esc(r.number)} · ${esc(r.title)}</option>`).join('');
    const query=search.value.trim().toLowerCase(),visible=rolls.filter(r=>[r.title,r.number,r.camera,r.film].join(' ').toLowerCase().includes(query));
    const scrollTop=list.scrollTop;
    list.innerHTML=visible.map(r=>`<button class="roll-navigation-item" data-roll-id="${esc(r.id)}" aria-label="切换到胶卷 ${esc(r.title)}" ${r.id===current.id?'aria-current="true"':''} ${busy?'disabled':''}><span class="roll-navigation-cover">${r.photos.length?`<img src="${esc(imageUrl(r.photos[0]))}" alt="" loading="lazy">`:'<span aria-hidden="true">▤</span>'}</span><span class="roll-navigation-description"><strong>№ ${esc(r.number)}</strong><span class="roll-navigation-title">${esc(r.title)}</span><small>${r.photos.length} 帧${r.id===current.id?' · 当前卷':''}</small></span></button>`).join('');
    list.scrollTop=scrollTop;
    $('#roll-navigation-empty').hidden=visible.length>0;
    if(revealCurrent) {
      const active=list.querySelector('[aria-current="true"]');
      if(active)list.scrollTop+=active.getBoundingClientRect().top-list.getBoundingClientRect().top-(list.clientHeight-active.offsetHeight)/2;
    }
  }
  function step(delta) {
    const rolls=getRolls(),index=rolls.findIndex(r=>r.id===getCurrent()?.id),target=index+delta;
    if(index>=0&&target>=0&&target<rolls.length&&!isBusy())openRoll(rolls[target].id);
  }
  $('#previous-roll').onclick=()=>step(-1);
  $('#next-roll').onclick=()=>step(1);
  list.onclick=event=>{const button=event.target.closest('[data-roll-id]');if(button&&!isBusy())openRoll(button.dataset.rollId);};
  select.onchange=()=>{if(!isBusy())openRoll(select.value);};
  search.oninput=()=>render();
  return {render};
}
