export const cameraFields=['name','brand','model','type','lens','format','mount','focalLength','aperture','shutter','focus','power','releaseYear','serial','purchasedAt','status','notes'];

export function cameraMetadata(input,cameras,existingId) {
  if(!input||typeof input!=='object'||Array.isArray(input))throw new Error('相机档案格式无效。');
  const result=Object.fromEntries(cameraFields.map(key=>[key,String(input[key]??'').trim().slice(0,key==='notes'?4000:160)]));
  if(!result.name||!result.model)throw new Error('请填写相机显示名称和机身型号。');
  if(cameras.some(c=>c.id!==existingId&&c.name.toLowerCase()===result.name.toLowerCase()))throw new Error('这个相机名称已登记，请用昵称或编号区分。');
  if(result.releaseYear&&!/^\d{4}$/.test(result.releaseYear))throw new Error('上市年份请填写四位数字。');
  if(result.purchasedAt&&(!/^\d{4}-\d{2}-\d{2}$/.test(result.purchasedAt)||!Number.isFinite(Date.parse(result.purchasedAt))||new Date(result.purchasedAt).toISOString().slice(0,10)!==result.purchasedAt))throw new Error('请输入有效的购入日期。');
  result.status||='在用';
  const sources=Array.isArray(input.sources)?input.sources:String(input.sources??'').split(/\r?\n/);
  result.sources=[...new Set(sources.map(s=>String(s).trim()).filter(Boolean))];
  if(result.sources.length>8)throw new Error('资料来源最多登记 8 个链接。');
  for(const source of result.sources){let url;try{url=new URL(source);}catch{throw new Error('资料来源请填写完整的网页链接。');}if(!['http:','https:'].includes(url.protocol)||url.username||url.password||source.length>2000)throw new Error('资料来源只支持不含账号密码的 HTTP / HTTPS 链接。');}
  return result;
}

export function resolveRollCamera(input,cameras) {
  const name=String(input.camera??'').trim().slice(0,160),id=String(input.cameraId??'').trim();
  const camera=id?cameras.find(c=>c.id===id):cameras.find(c=>c.name===name);
  if(id&&!camera)throw new Error('这台相机已移除，请重新选择。');
  return {camera:camera?.name||name,cameraId:camera?.id||''};
}
