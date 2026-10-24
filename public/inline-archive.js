const fields=['title','number','camera','film','iso','format','loadedAt','shotStart','shotEnd','developedAt','lab','notes'];
export function setupInlineArchive({getCurrent,save,onSaved}) {
  const form=document.querySelector('#roll-inline-form'),status=document.querySelector('#archive-save-status'),error=document.querySelector('#archive-save-error');
  const drafts=new Map();let displayedId=null;
  const valuesOf=roll=>Object.fromEntries(fields.map(key=>[key,roll[key]||'']));
  function stateFor(roll) {
    if(!drafts.has(roll.id))drafts.set(roll.id,{values:valuesOf(roll),saved:JSON.stringify(valuesOf(roll)),revision:0,saving:false,queued:false,error:'',invalid:new Set()});
    return drafts.get(roll.id);
  }
  function feedback(id,state) {
    if(displayedId!==id)return;
    const dirty=JSON.stringify(state.values)!==state.saved;
    status.textContent=state.saving?'正在保存…':state.error?'未保存，请检查下方提示':dirty?'修改未保存，离开输入框自动保存':'已保存到本机 · 离开输入框或按回车保存';
    status.dataset.state=state.error?'error':state.saving||dirty?'pending':'saved';
    error.textContent=state.error;
  }
  function render(roll) {
    const state=stateFor(roll),same=displayedId===roll.id,focused=document.activeElement?.form===form;
    if(!state.saving&&JSON.stringify(state.values)===state.saved){state.values=valuesOf(roll);state.saved=JSON.stringify(state.values);}
    if(!same||!focused)for(const key of fields)form.elements.namedItem(key).value=state.values[key];
    displayedId=roll.id;feedback(roll.id,state);
  }
  async function commit(id,state) {
    if(state.saving){state.queued=true;return;}
    if(state.invalid.size){state.error='请填写完整、有效的日期。';feedback(id,state);return;}
    if(JSON.stringify(state.values)===state.saved){state.error='';feedback(id,state);return;}
    if(!state.values.title.trim()||!state.values.number.trim()){state.error='胶卷名称和实物胶卷编号不能为空。';feedback(id,state);return;}
    const input={...state.values},revision=state.revision;
    state.saving=true;state.error='';feedback(id,state);
    try {
      const roll=await save(id,input);state.saved=JSON.stringify(valuesOf(roll));
      if(state.revision===revision)state.values=valuesOf(roll);
      onSaved(roll);
    }catch(e){state.error=e.message;}
    finally {
      state.saving=false;feedback(id,state);
      if(state.queued){state.queued=false;void commit(id,state);}
    }
  }
  function track(event) {
    const element=event.target;if(element.form!==form||!fields.includes(element.name)||!getCurrent())return;
    const state=stateFor(getCurrent());state.values[element.name]=element.value;state.revision++;state.error='';
    if(element.validity.badInput)state.invalid.add(element.name);else state.invalid.delete(element.name);
    feedback(displayedId,state);
  }
  const detail=document.querySelector('#detail-view');
  detail.addEventListener('input',track);
  detail.addEventListener('change',event=>{track(event);if(event.target.form===form&&['date','select-one'].includes(event.target.type))void commit(displayedId,drafts.get(displayedId));});
  detail.addEventListener('focusout',event=>{if(event.target.form===form)void commit(displayedId,drafts.get(displayedId));});
  detail.addEventListener('keydown',event=>{
    if(event.target.form===form&&event.key==='Enter'&&(event.target.tagName!=='TEXTAREA'||event.ctrlKey||event.metaKey)){event.preventDefault();event.target.blur();}
    if(event.target.form===form&&event.key==='Escape'){event.preventDefault();const roll=getCurrent();event.target.value=roll[event.target.name]||'';track(event);event.target.blur();}
  });
  form.addEventListener('submit',event=>{event.preventDefault();void commit(displayedId,drafts.get(displayedId));});
  async function applyFields(values) {
    const roll=getCurrent();if(!roll)throw new Error('请先打开要记录的胶卷。');
    const state=stateFor(roll);if(state.saving)throw new Error('上一项修改正在保存，请稍后再选用。');
    for(const [key,value] of Object.entries(values))if(fields.includes(key))state.values[key]=String(value);
    state.revision++;state.error='';render(roll);await commit(roll.id,state);
    if(state.error)throw new Error(state.error);
  }
  return {render,applyFields};
}
