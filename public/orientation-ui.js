const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={0:'扫描原方向',90:'顺时针 90°',180:'旋转 180°',270:'逆时针 90°'};
export function setupOrientation({getCurrent,getVersions,refresh,toast,stopFilm}) {
  let rollId=null,scan=null,poll=null,choices=new Map();
  const dialog=$('#orientation-dialog');
  const endpoint=suffix=>`/api/rolls/${rollId}/orientation${suffix||''}`;
  async function request(url,method='GET',input) {
    const res=await fetch(url,{method,...(input?{headers:{'Content-Type':'application/json'},body:JSON.stringify(input)}:{})});
    const value=await res.json();if(!res.ok)throw new Error(value.error||'方向检查失败。');return value;
  }
  function initializeChoices() {
    choices.clear();
    for(const p of getCurrent()?.photos||[]) {
      const c=p.orientationCheck;if(c?.scanId!==scan?.id)continue;
      const base=p.rotation||0,revision=p.rotationRevision||0,protectedManual=p.rotationSource==='manual'||(base!==0&&!p.rotationSource);
      choices.set(p.id,{rotation:c.reliable&&!protectedManual?c.angle:base,selected:!!(c.reliable&&c.angle!==base&&!protectedManual),base,revision,protectedManual});
    }
  }
  function updateSelection() {
    const count=[...choices.values()].filter(c=>c.selected&&c.rotation!==c.base).length;
    $('#orientation-selected').textContent=`已选 ${count} 张照片`;
    $('#orientation-apply').disabled=!count||scan?.status!=='complete';
    $('#orientation-apply').textContent=count?`应用选中方向（${count}）`:'应用选中方向';
  }
  function renderResults() {
    const r=getCurrent();if(!r||r.id!==rollId)return;
    const mode=$('#orientation-filter').value;
    const all=r.photos.filter(p=>p.orientationCheck?.scanId===scan?.id);
    const changes=all.filter(p=>p.orientationCheck.reliable&&p.orientationCheck.angle!==(p.rotation||0));
    const pending=all.filter(p=>!p.orientationCheck.reliable);
    $('#orientation-status').textContent=`检查完成：${all.length} 张 · 建议调整 ${changes.length} 张 · 待确认 ${pending.length} 张${scan.errors?.length?` · ${scan.errors.length} 张识别失败`:''}`;
    const photos=all.filter(p=>mode==='all'||mode==='pending'&&!p.orientationCheck.reliable||mode==='attention'&&(!p.orientationCheck.reliable||p.orientationCheck.angle!==(p.rotation||0)));
    $('#orientation-results').innerHTML=photos.length?photos.map(p=>{
      const i=r.photos.indexOf(p)+1,c=p.orientationCheck,choice=choices.get(p.id),v=getVersions(p).find(v=>v.id===c.versionId)||getVersions(p)[0];
      const src='/photos/'+(v.thumbnail||p.thumbnail||v.file);
      const tag=choice.protectedManual?'已保留手动方向':c.reliable?(c.angle===choice.base?'方向一致':'建议调整'):'待确认';
      return `<article class="orientation-card" data-orientation-photo="${p.id}"><div class="orientation-card-heading"><strong>第 ${String(i).padStart(2,'0')} 帧</strong><span class="orientation-tag ${c.reliable?'clear':'uncertain'}">${tag}</span></div><div class="orientation-pair"><figure><div><img src="${src}" alt="第 ${i} 帧当前方向" style="transform:rotate(${choice.base}deg)"></div><figcaption>当前</figcaption></figure><span aria-hidden="true">→</span><figure><div><img class="orientation-proposed" src="${src}" alt="第 ${i} 帧调整后的方向" style="transform:rotate(${choice.rotation}deg)"></div><figcaption>调整后</figcaption></figure></div><p class="orientation-filename">${esc(p.name)}</p><p class="orientation-reason">${choice.protectedManual?'你已手动调整过，默认保持；可以在下方重新选择。':esc(c.reason)}</p><div class="orientation-card-controls"><label><input type="checkbox" data-orientation-select="${p.id}" aria-label="调整第 ${i} 帧" ${choice.selected?'checked':''}>调整</label><select data-orientation-angle="${p.id}" aria-label="第 ${i} 帧方向">${[0,90,180,270].map(a=>`<option value="${a}" ${a===choice.rotation?'selected':''}>${labels[a]}</option>`).join('')}</select></div></article>`;
    }).join(''):'<p class="muted">这个筛选下没有照片。可切换“全部照片”查看完整结果。</p>';
    $('#orientation-review').hidden=false;$('#orientation-progress').hidden=true;
    $('#orientation-rescan').disabled=false;$('#orientation-undo').disabled=!r.orientationUndo;
    updateSelection();
  }
  async function followScan() {
    clearTimeout(poll);
    try {
      scan=await request(endpoint());if(!dialog.open)return;
      if(scan?.status==='running') {
        $('#orientation-progress').hidden=false;$('#orientation-review').hidden=true;
        $('#orientation-status').textContent='正在本机判断方向，照片不会上传。';
        $('#orientation-progress-label').textContent=`${scan.processed} / ${scan.total} · ${scan.current}`;
        $('#orientation-progress-bar').value=scan.total?scan.processed/scan.total*100:0;
        $('#orientation-rescan').disabled=true;$('#orientation-apply').disabled=true;$('#orientation-undo').disabled=true;
        poll=setTimeout(followScan,700);
      } else if(scan?.status==='complete') {await refresh();initializeChoices();renderResults();}
      else {$('#orientation-progress').hidden=true;$('#orientation-status').textContent='上次识别中断，点击“重新识别”继续。';$('#orientation-rescan').disabled=false;}
    } catch(e){$('#orientation-error').textContent=e.message;$('#orientation-rescan').disabled=false;}
  }
  async function startScan() {
    $('#orientation-error').textContent='';$('#orientation-results').replaceChildren();$('#orientation-review').hidden=true;
    choices.clear();updateSelection();
    $('#orientation-rescan').disabled=true;$('#orientation-apply').disabled=true;
    try {scan=await request(endpoint(),'POST',{version:$('#version-view').value});choices.clear();await followScan();}
    catch(e){$('#orientation-error').textContent=e.message;$('#orientation-rescan').disabled=false;}
  }
  $('#orientation-check').onclick=async()=>{
    const r=getCurrent();if(!r?.photos.length)return;stopFilm();rollId=r.id;choices.clear();scan=null;
    updateSelection();
    $('#orientation-filter').value='attention';$('#orientation-error').textContent='';$('#orientation-results').replaceChildren();$('#orientation-review').hidden=true;
    $('#orientation-status').textContent='准备方向检查…';$('#orientation-apply').disabled=true;$('#orientation-undo').disabled=!r.orientationUndo;dialog.showModal();
    try {scan=await request(endpoint());if(!dialog.open)return;const cached=scan?.status==='complete'&&scan.version===$('#version-view').value&&r.photos.every(p=>p.orientationCheck?.scanId===scan.id);if(cached||scan?.status==='running')await followScan();else await startScan();}
    catch(e){$('#orientation-error').textContent=e.message;}
  };
  $('#orientation-filter').onchange=renderResults;
  $('#orientation-rescan').onclick=startScan;
  $('#orientation-results').onchange=e=>{
    const id=e.target.dataset.orientationSelect||e.target.dataset.orientationAngle,c=choices.get(id);if(!c)return;
    if(e.target.dataset.orientationSelect)c.selected=e.target.checked;
    else {c.rotation=Number(e.target.value);c.selected=c.rotation!==c.base;const card=e.target.closest('.orientation-card');card.querySelector('input').checked=c.selected;card.querySelector('.orientation-proposed').style.transform=`rotate(${c.rotation}deg)`;}
    updateSelection();
  };
  $('#orientation-select-recommended').onclick=()=>{for(const p of getCurrent().photos){const c=choices.get(p.id),check=p.orientationCheck;if(c){c.selected=!!(check.reliable&&check.angle!==c.base&&!c.protectedManual);c.rotation=c.selected?check.angle:c.base;}}renderResults();};
  $('#orientation-apply').onclick=async()=>{
    $('#orientation-apply').disabled=true;$('#orientation-error').textContent='';
    try {const decisions=[...choices].filter(([,c])=>c.selected&&c.rotation!==c.base).map(([photoId,c])=>({photoId,rotation:c.rotation,expectedRotation:c.base,expectedRevision:c.revision}));const result=await request(endpoint('/apply'),'POST',{scanId:scan.id,decisions});await refresh();initializeChoices();renderResults();toast(`已调整 ${result.changed} 张照片，可以撤销本次调整。`);}
    catch(e){$('#orientation-error').textContent=e.message;updateSelection();}
  };
  $('#orientation-undo').onclick=async()=>{
    $('#orientation-undo').disabled=true;$('#orientation-error').textContent='';
    try{const result=await request(endpoint('/undo'),'POST');await refresh();initializeChoices();renderResults();toast(`已恢复 ${result.restored} 张照片${result.skipped?`，保留后来单独调整的 ${result.skipped} 张`:''}。`);}
    catch(e){$('#orientation-error').textContent=e.message;$('#orientation-undo').disabled=!getCurrent()?.orientationUndo;}
  };
  dialog.addEventListener('close',()=>clearTimeout(poll));
}
