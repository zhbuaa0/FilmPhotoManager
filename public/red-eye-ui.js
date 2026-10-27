import {fromDisplay,toDisplay} from './red-eye-coordinates.mjs';
const $=s=>document.querySelector(s),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels={corrected:'已修正',review:'待核对',clean:'未检出明显红眼','no-face':'未识别人脸',error:'处理失败'};
export function setupRedEye({getLibrary,getCurrent,getSelection,getVersion,getViewer,refresh,onChange,send,toast}){
  const dialog=$('#red-eye-dialog');let rollId=null,job=null,photoId=null,versionId=null,poll=null,busy=false,manual=false,canvasToken=0;
  const roll=()=>getLibrary().rolls.find(r=>r.id===rollId),photo=()=>roll()?.photos.find(p=>p.id===photoId),record=()=>photo()?.redEye?.[versionId];
  const endpoint=(id=photoId,vid=versionId)=>`/api/rolls/${rollId}/photos/${id}/red-eye?version=${encodeURIComponent(vid)}`;
  const imageURL=(before=false)=>`/api/rolls/${rollId}/photos/${photoId}/display?version=${encodeURIComponent(versionId)}&rotation=${photo()?.rotation||0}&redEye=${before?0:1}&edit=${record()?.revision||''}`;
  async function request(url){const response=await fetch(url),result=await response.json();if(!response.ok)throw new Error(result.error||'去红眼请求失败');return result;}
  function open(){if(!dialog.open)dialog.showModal();$('#red-eye-error').textContent='';}
  function active(){return job&&['queued','running'].includes(job.status);}
  function renderJob(){
    const running=active();$('#red-eye-cancel').hidden=!running;$('#red-eye-job-progress').hidden=!running;
    $('#red-eye-job-progress').max=job?.total||1;$('#red-eye-job-progress').value=job?.processed||0;
    const corrected=job?.items.filter(i=>i.status==='corrected').length||0,errors=job?.items.filter(i=>i.error).length||0;
    $('#red-eye-job-status').textContent=job?`${running?'本机处理中':job.status==='cancelled'?'已取消剩余任务':'处理完成'} · ${job.processed} / ${job.total} 张 · ${corrected} 张生成修正${errors?' · '+errors+' 张失败':''}${running&&job.current?' · '+job.current:''}`:'选择一张照片查看结果或手动点选。';
    $('#red-eye-job-undo').disabled=!job||running||!job.items.some(i=>i.afterRevision);
    $('#red-eye-background-status').textContent=running?`去红眼：${job.processed} / ${job.total} 张` : '';
    $('#red-eye-roll').disabled=running;
  }
  function renderList(){
    const r=roll();if(!r)return;const items=job?.rollId===r.id?job.items:r.photos.map(p=>({photoId:p.id,versionId:getVersion(p).id,name:p.name,status:p.redEye?.[getVersion(p).id]?.status}));
    $('#red-eye-results').innerHTML=items.map(item=>{const p=r.photos.find(p=>p.id===item.photoId);if(!p)return '';const rec=p.redEye?.[item.versionId];return `<button type="button" class="red-eye-result ${photoId===p.id&&versionId===item.versionId?'active':''}" data-red-photo="${esc(p.id)}" data-red-version="${esc(item.versionId)}"><strong>第 ${r.photos.indexOf(p)+1} 帧 · ${esc(labels[rec?.status||item.status]||'尚未检测')}</strong><span>${esc(item.name||p.name)}</span>${item.error?`<small>${esc(item.error)}</small>`:''}</button>`;}).join('');
  }
  function sizeCanvas(){const c=$('#red-eye-canvas');if(!c.width)return;const width=Math.min(c.width,$('#red-eye-editor').clientWidth,380*c.width/c.height);c.style.width=width*Number($('#red-eye-zoom').value)+'px';}
  function drawCanvas(){
    const token=++canvasToken,img=new Image();$('#red-eye-canvas-note').textContent='正在载入原图预览…';img.onload=()=>{if(token!==canvasToken)return;const canvas=$('#red-eye-canvas'),scale=Math.min(1,1600/img.naturalWidth);canvas.width=Math.round(img.naturalWidth*scale);canvas.height=Math.round(img.naturalHeight*scale);const ctx=canvas.getContext('2d');ctx.drawImage(img,0,0,canvas.width,canvas.height);const rotation=photo()?.rotation||0;for(const r of record()?.regions||[]){const p=toDisplay(r.x,r.y,rotation),swap=rotation===90||rotation===270;ctx.strokeStyle=r.enabled?'#ff9c65':'#ffe182';ctx.lineWidth=2;ctx.setLineDash(r.enabled?[]:[4,3]);ctx.beginPath();ctx.ellipse(p.x*canvas.width,p.y*canvas.height,(swap?r.ry:r.rx)*canvas.width,(swap?r.rx:r.ry)*canvas.height,0,0,Math.PI*2);ctx.stroke();}sizeCanvas();$('#red-eye-canvas-note').textContent=manual?'点原图红瞳孔添加选区；修正前请核对下方眼部对照。':'原图预览；实线为已启用，虚线为待核对选区。';};img.onerror=()=>{if(token===canvasToken)$('#red-eye-canvas-note').textContent='原图暂不可用，请检查原目录。';};img.src=imageURL(true);
  }
  function renderEditor({redraw=true}={}){
    const p=photo(),rec=record();$('#red-eye-editor').hidden=!p;if(!p)return;
    $('#red-eye-photo-title').textContent=p.name;$('#red-eye-photo-note').textContent=rec?.note||'尚未检测。可先检测，再手动点选漏检的红眼。';
    $('#red-eye-rescan').disabled=busy||!!active();$('#red-eye-photo-undo').disabled=busy||!rec;
    const enabled=rec?.regions.some(r=>r.enabled&&r.strength>0),url=`/api/rolls/${rollId}/photos/${photoId}/red-eye-export?version=${encodeURIComponent(versionId)}&edit=${rec?.revision||''}`;
    $('#red-eye-export').hidden=!enabled;$('#red-eye-export').href=url;
    $('#red-eye-regions').innerHTML=(rec?.regions||[]).map((region,index)=>{const base=`/api/rolls/${rollId}/photos/${photoId}/red-eye-eye?version=${encodeURIComponent(versionId)}&region=${region.id}&edit=${rec.revision}`;return `<article class="red-eye-region"><div class="red-eye-pair"><figure><img src="${base}&before=1" alt="第 ${index+1} 只眼修正前"><figcaption>原图眼部</figcaption></figure><figure><img src="${base}" alt="第 ${index+1} 只眼修正后"><figcaption>修正后</figcaption></figure></div><div><label class="check-label"><input type="checkbox" data-red-enabled="${index}" ${region.enabled?'checked':''}>${region.manual?'手动选区':region.enabled?'自动修正':'疑似，请核对'}</label><label>强度<input type="range" min="0" max="100" value="${Math.round(region.strength*100)}" data-red-strength="${index}" aria-label="第 ${index+1} 只眼修正强度"></label><label>范围<input type="range" min="60" max="180" step="5" value="${Math.round(region.rx/(region.baseRx||region.rx)*100)}" data-red-size="${index}" aria-label="第 ${index+1} 只眼修正范围"></label><button class="danger-text" data-red-remove="${index}">删除选区</button></div></article>`;}).join('')||'<p class="muted">暂无眼部选区。漏检时可以手动点选红色瞳孔。</p>';
    if(redraw)drawCanvas();
  }
  async function selectPhoto(id,vid){photoId=id;versionId=vid;manual=false;$('#red-eye-zoom').value='1';$('#red-eye-canvas').classList.remove('picking');$('#red-eye-manual').setAttribute('aria-pressed','false');renderList();renderEditor();}
  async function update(){if(!job)return;job=await request(`/api/rolls/${rollId}/red-eye?job=${job.id}`);renderJob();if(!active()){clearInterval(poll);poll=null;await refresh();onChange();renderList();renderEditor();if(!dialog.open)toast('去红眼任务完成，可打开结果核对。');}}
  function watch(){clearInterval(poll);poll=setInterval(()=>{void update().catch(e=>{$('#red-eye-error').textContent=e.message;});},1200);}
  async function start(ids,specificVersion){
    const r=getCurrent();if(!r||!ids.length)return toast('请先选择照片。');rollId=r.id;open();
    try{job=await send(`/api/rolls/${rollId}/red-eye`,'POST',{ids,version:$('#version-view').value,...(specificVersion?{versionId:specificVersion}:{})});photoId=ids[0];versionId=job.items[0].versionId;renderJob();renderList();renderEditor();watch();}catch(e){$('#red-eye-error').textContent=e.message;}
  }
  async function review(viewer){const r=getCurrent();if(!r)return;rollId=r.id;open();try{job=await request(`/api/rolls/${rollId}/red-eye`);renderJob();const item=job?.items.find(i=>r.photos.some(p=>p.id===i.photoId)),p=viewer?.photo||r.photos.find(p=>p.id===item?.photoId)||r.photos.find(p=>p.redEye)||r.photos[0];if(p)await selectPhoto(p.id,viewer?.version?.id||(p.id===item?.photoId?item.versionId:getVersion(p).id));renderList();if(active())watch();}catch(e){$('#red-eye-error').textContent=e.message;}}
  async function mutate(input){if(busy||!record())return;busy=true;dialog.classList.add('is-saving');$('#red-eye-error').textContent='';try{await send(endpoint(),'PUT',{revision:record().revision,...input});await refresh();onChange();renderList();renderEditor();}catch(e){$('#red-eye-error').textContent=e.message;}finally{busy=false;dialog.classList.remove('is-saving');$('#red-eye-rescan').disabled=!!active();$('#red-eye-photo-undo').disabled=!record();}}
  $('#red-eye-selected').onclick=()=>start(getSelection());$('#red-eye-roll').onclick=()=>start(getCurrent()?.photos.map(p=>p.id)||[]);
  $('#red-eye-review').onclick=()=>review();$('#viewer-red-eye-review').onclick=()=>review(getViewer());
  $('#viewer-red-eye').onclick=()=>{const v=getViewer();if(v)start([v.photo.id],v.version.id);};
  $('#red-eye-rescan').onclick=()=>start([photoId],versionId);
  $('#red-eye-results').onclick=e=>{const button=e.target.closest('[data-red-photo]');if(button)selectPhoto(button.dataset.redPhoto,button.dataset.redVersion);};
  $('#red-eye-cancel').onclick=async()=>{try{job=await send(`/api/rolls/${rollId}/red-eye/cancel`,'POST',{jobId:job.id});renderJob();}catch(e){$('#red-eye-error').textContent=e.message;}};
  $('#red-eye-job-undo').onclick=async()=>{try{const result=await send(`/api/rolls/${rollId}/red-eye/undo`,'POST',{jobId:job.id});await refresh();onChange();renderList();renderEditor();toast(`已撤销 ${result.changed} 张${result.skipped?'，保留后续修改 '+result.skipped+' 张':''}`);}catch(e){$('#red-eye-error').textContent=e.message;}};
  $('#red-eye-photo-undo').onclick=async()=>{try{await send(endpoint(),'DELETE',{revision:record().revision});await refresh();onChange();renderList();renderEditor();}catch(e){$('#red-eye-error').textContent=e.message;}};
  $('#red-eye-manual').onclick=()=>{manual=!manual;$('#red-eye-manual').setAttribute('aria-pressed',manual);$('#red-eye-canvas').classList.toggle('picking',manual);$('#red-eye-canvas-note').textContent=manual?'点击下方原图中的红瞳孔，添加眼部修正。':'已结束手动点选。';};
  $('#red-eye-radius').oninput=e=>{$('#red-eye-radius-value').textContent=e.target.value+'%';};
  $('#red-eye-zoom').onchange=sizeCanvas;window.addEventListener('resize',sizeCanvas);
  $('#red-eye-canvas').onclick=async e=>{
    if(!manual||busy)return;if(!record())return toast('请先运行一次检测，再添加漏检选区。');
    const bounds=e.currentTarget.getBoundingClientRect(),point=fromDisplay((e.clientX-bounds.left)/bounds.width,(e.clientY-bounds.top)/bounds.height,photo().rotation||0);await mutate({point:{...point,radius:Number($('#red-eye-radius').value)/100}});
  };
  $('#red-eye-regions').onchange=e=>{const rec=record();if(!rec)return;const enabled=e.target.dataset.redEnabled,strength=e.target.dataset.redStrength,size=e.target.dataset.redSize,regions=structuredClone(rec.regions);if(enabled!==undefined)regions[enabled].enabled=e.target.checked;else if(strength!==undefined)regions[strength].strength=Number(e.target.value)/100;else if(size!==undefined){regions[size].rx=Math.min(.12,(regions[size].baseRx||regions[size].rx)*Number(e.target.value)/100);regions[size].ry=Math.min(.12,(regions[size].baseRy||regions[size].ry)*Number(e.target.value)/100);}else return;void mutate({regions});};
  $('#red-eye-regions').onclick=e=>{const button=e.target.closest('[data-red-remove]');if(button)void mutate({regions:record().regions.filter((_,i)=>i!==Number(button.dataset.redRemove))});};
  $('#copy-corrected').onclick=async()=>{const r=getCurrent(),ids=getSelection();if(!r||!ids.length)return;const button=$('#copy-corrected');button.disabled=true;try{const result=await send(`/api/rolls/${r.id}/copy-corrected`,'POST',{ids,version:$('#version-view').value});toast(`已复制 ${result.count} 个修正版 TIFF，可到 Windows 文件夹粘贴`);}catch(e){toast(e.message);}finally{onChange();}};
  request('/api/red-eye/active').then(jobs=>{if(jobs.length){job=jobs[0];rollId=job.rollId;renderJob();watch();}}).catch(()=>{});
  return {review};
}
