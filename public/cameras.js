import {cameraPresets} from './camera-presets.mjs';
import {cameraPhotoReferences,cameraPhotos} from './camera-photos.mjs';
const $=s=>document.querySelector(s);
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cameraIcon='<svg viewBox="0 0 120 80" aria-hidden="true"><path d="M13 23h22l7-10h28l7 10h29v46H13z"/><circle cx="61" cy="46" r="19"/><circle cx="61" cy="46" r="11"/><path d="M23 33h11m49-2h13"/></svg>';
function photosMarkup(photos) {
  return `<div class="camera-photo-grid ${photos.length>1?'has-lens':''}">${photos.map(p=>`<figure><a class="camera-photo-link" href="${esc(p.src)}" target="_blank" rel="noopener noreferrer" aria-label="查看大图：${esc(p.caption)}"><img src="${esc(p.src)}" alt="${esc(p.caption)}" loading="lazy"></a><figcaption>${esc(p.caption)}${p.source?`<small><a href="${esc(p.source)}" target="_blank" rel="noopener noreferrer">${esc(p.author)} / Wikimedia Commons</a> · <a href="${p.licenseUrl}" target="_blank" rel="noopener noreferrer">${p.license}</a> · 已缩放</small>`:''}</figcaption></figure>`).join('')}</div>`;
}

export function setupCameras({getLibrary,send,refresh,toast,confirmAction,showCameras,showCameraRolls}) {
  const form=$('#camera-form'),dialog=$('#camera-dialog');let editingId=null,editingPhoto=null,pendingPhoto=null,previewUrl=null;
  const photoChoice=form.elements.photoChoice;
  photoChoice.innerHTML='<option value="auto">按机身型号匹配参考图</option><option value="custom">我上传的相机照片</option>'+cameraPhotoReferences.map(p=>`<option value="${p.key}">${esc(p.label)}</option>`).join('')+'<option value="none">不显示预览图</option>';
  function clearPhoto() {pendingPhoto=null;$('#camera-photo-file').value='';if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=null;}
  function renderPhotoEditor() {
    photoChoice.querySelector('[value="custom"]').disabled=!editingPhoto&&!pendingPhoto;
    const record={...Object.fromEntries(new FormData(form)),photo:editingPhoto};
    const photos=pendingPhoto&&photoChoice.value==='custom'?[{src:previewUrl,caption:'待保存的相机照片',personal:true}]:cameraPhotos(record);
    $('#camera-photo-preview').innerHTML=photos.length?photosMarkup(photos):'<p class="muted">暂无预览图，可以上传自己的相机照片，或选择型号参考图。</p>';
  }
  const cameras=()=>getLibrary().cameras||[];
  function options() {
    const registered=cameras(),legacy=[...new Set(getLibrary().rolls.map(r=>r.camera).filter(name=>name&&!registered.some(c=>c.name===name)))];
    for(const select of document.querySelectorAll('[data-camera-select]')) {
      const value=select.value,old=[...legacy];if(value&&!registered.some(c=>c.name===value)&&!old.includes(value))old.push(value);
      select.innerHTML='<option value="">暂未记录 · 选择相机</option>'+(registered.length?`<optgroup label="我的相机">${registered.map(c=>`<option value="${esc(c.name)}">${esc(c.name)}${c.status&&c.status!=='在用'?' · '+esc(c.status):''}</option>`).join('')}</optgroup>`:'')+(old.length?`<optgroup label="历史胶卷中的相机">${old.map(name=>`<option value="${esc(name)}">${esc(name)}</option>`).join('')}</optgroup>`:'');
      select.value=value;
    }
  }
  function render() {
    options();$('#count-cameras').textContent=cameras().length;
    $('#camera-total').textContent=cameras().length;
    $('#camera-in-use').textContent=cameras().filter(c=>c.status==='在用').length;
    $('#camera-roll-total').textContent=getLibrary().rolls.filter(r=>r.camera).length;
    const query=$('#camera-search').value.trim().toLowerCase(),visible=cameras().filter(c=>[c.name,c.brand,c.model,c.lens,c.serial,c.notes].join(' ').toLowerCase().includes(query));
    $('#camera-empty').hidden=cameras().length>0;
    $('#camera-no-results').hidden=!cameras().length||visible.length>0;
    $('#camera-grid').innerHTML=visible.map(c=>{
      const used=getLibrary().rolls.filter(r=>r.cameraId===c.id||(!r.cameraId&&r.camera===c.name)).length;
      const facts=[['焦距',c.focalLength],['最大光圈',c.aperture],['机身上市',c.releaseYear],['电池',c.power]].filter(([,v])=>v);
      const extra=[['镜头卡口',c.mount],['快门',c.shutter],['对焦',c.focus],['机身编号',c.serial],['购入日期',c.purchasedAt]].filter(([,v])=>v);
      const photos=cameraPhotos(c);
      return `<article class="camera-card"><div class="camera-card-top">${photos.length?'<span class="camera-photo-kicker">器材预览 · 点击照片看大图</span>':`<span class="camera-drawing">${cameraIcon}</span>`}<span class="camera-state">${esc(c.status)}</span></div>${photos.length?photosMarkup(photos):''}<div class="eyebrow">${esc(c.brand||'MY FILM CAMERA')}</div><h2>${esc(c.name)}</h2><p class="camera-model">${esc(c.model)}</p><p class="camera-lens">${esc(c.lens||'镜头待登记')}</p><div class="camera-tags"><span>${esc(c.format||'规格待登记')}</span><span>${esc(c.type||'机身类型待登记')}</span></div><dl class="camera-facts">${facts.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl><details class="camera-reference"><summary>器材资料与登记信息</summary><dl>${extra.map(([k,v])=>`<div><dt>${k}</dt><dd>${esc(v)}</dd></div>`).join('')}</dl>${c.notes?`<p>${esc(c.notes)}</p>`:''}${c.sources?.length?`<div class="camera-sources"><span>资料来源</span>${c.sources.map((url,i)=>`<a href="${esc(url)}" target="_blank" rel="noopener noreferrer">${esc(new URL(url).hostname)} · 来源 ${i+1} ↗</a>`).join('')}</div>`:''}</details><div class="camera-card-actions"><button class="secondary" data-edit-camera="${c.id}" aria-label="编辑相机 ${esc(c.name)}">编辑档案</button><button data-camera-rolls="${c.id}" class="camera-usage">${used} 卷胶片 →</button><button class="danger-text" data-delete-camera="${c.id}" aria-label="移除相机 ${esc(c.name)}">移除登记</button></div></article>`;
    }).join('');
  }
  function populate(record={}) {
    for(const element of form.elements)if(element.name)element.value=element.name==='sources'?(record.sources||[]).join('\n'):record[element.name]||'';
    if(!record.status)form.elements.status.value='在用';
    photoChoice.value=record.photoChoice||'auto';renderPhotoEditor();
  }
  function openEditor(camera=null) {
    editingId=camera?.id||null;editingPhoto=camera?.photo||null;clearPhoto();form.reset();populate(camera||{});$('#camera-error').textContent='';
    $('#camera-dialog-title').textContent=camera?'编辑相机档案':'登记胶片相机';$('#camera-template').value='';$('#camera-template-wrap').hidden=!!camera;
    dialog.showModal();
  }
  $('#camera-template').innerHTML='<option value="">空白登记 · 自己填写</option>'+cameraPresets.map(c=>`<option value="${c.key}">${esc(c.name)}</option>`).join('');
  $('#camera-template').onchange=()=>{const preset=cameraPresets.find(c=>c.key===$('#camera-template').value);clearPhoto();populate(preset||{});};
  photoChoice.onchange=renderPhotoEditor;
  for(const key of ['model','brand','lens'])form.elements[key].addEventListener('input',renderPhotoEditor);
  $('#camera-photo-upload').onclick=()=>$('#camera-photo-file').click();
  $('#camera-photo-file').onchange=()=>{
    const file=$('#camera-photo-file').files[0];if(!file)return;
    if(file.size>8*1024*1024||!(/\.(jpe?g|png|webp)$/i.test(file.name))){$('#camera-error').textContent='请选择 8 MB 以内的 JPG、PNG 或 WebP 相机照片。';$('#camera-photo-file').value='';return;}
    clearPhoto();pendingPhoto=file;previewUrl=URL.createObjectURL(file);photoChoice.value='custom';$('#camera-error').textContent='';renderPhotoEditor();
  };
  dialog.addEventListener('close',clearPhoto);
  $('#new-camera').onclick=$('#empty-new-camera').onclick=()=>openEditor();
  $('#camera-search').oninput=render;
  for(const button of document.querySelectorAll('[data-manage-cameras]'))button.onclick=showCameras;
  form.onsubmit=async event=>{
    event.preventDefault();const button=$('#save-camera');button.disabled=true;$('#camera-error').textContent='';
    let saved=false;
    try {
      const record=await send(editingId?'/api/cameras/'+editingId:'/api/cameras',editingId?'PUT':'POST',Object.fromEntries(new FormData(form)));saved=true;editingId=record.id;
      if(pendingPhoto&&photoChoice.value==='custom'){
        const response=await fetch(`/api/cameras/${editingId}/photo`,{method:'POST',body:pendingPhoto}),result=await response.json();if(!response.ok)throw new Error(result.error||'相机照片保存失败。');editingPhoto=result.photo;
      }
      await refresh();dialog.close();toast('相机档案与预览图已保存到本机');
    } catch(error){$('#camera-error').textContent=(saved?'档案已保存，预览图未保存完成，可再次点击保存重试。':'')+error.message;if(saved){$('#camera-dialog-title').textContent='编辑相机档案';$('#camera-template-wrap').hidden=true;}}
    finally{button.disabled=false;}
  };
  $('#camera-grid').onclick=async event=>{
    const edit=event.target.closest('[data-edit-camera]'),remove=event.target.closest('[data-delete-camera]'),rolls=event.target.closest('[data-camera-rolls]');
    if(edit)return openEditor(cameras().find(c=>c.id===edit.dataset.editCamera));
    if(rolls){const camera=cameras().find(c=>c.id===rolls.dataset.cameraRolls);if(camera)showCameraRolls(camera);return;}
    if(remove){const camera=cameras().find(c=>c.id===remove.dataset.deleteCamera);if(!camera)return;
      if(await confirmAction('移除这台相机的登记？',`“${camera.name}”将从我的相机中移除，已有胶卷上的相机文字会保留，照片不会删除。`)){
        try {await send('/api/cameras/'+camera.id,'DELETE');await refresh();toast('相机登记已移除，历史胶卷保留');}catch(error){toast(error.message);}
      }
    }
  };
  return {render,options,openEditor};
}
