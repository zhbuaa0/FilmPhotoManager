const collator=new Intl.Collator('zh-CN',{numeric:true,sensitivity:'base'});
export const rollDate=r=>r.shotStart||r.shotEnd||r.loadedAt||r.developedAt||'';
export function collectionRolls(rolls,{query='',camera='',film='',format='',year='',sort='archive'}={}) {
  const needle=query.trim().toLocaleLowerCase();
  const result=rolls.filter(r=>(!needle||[r.title,r.number,r.camera,r.film,r.notes].join(' ').toLocaleLowerCase().includes(needle))&&(!camera||(camera==='__missing__'?!r.camera:r.camera===camera))&&(!film||(film==='__missing__'?!r.film:r.film===film))&&(!format||r.collectionFormat===format)&&(!year||(year==='__missing__'?!rollDate(r):rollDate(r).slice(0,4)===year)));
  const compare={number:(a,b)=>collator.compare(a.number,b.number),'number-desc':(a,b)=>collator.compare(b.number,a.number),title:(a,b)=>collator.compare(a.title,b.title),'photos-desc':(a,b)=>b.photos.length-a.photos.length,'date-desc':(a,b)=>compareDates(a,b,-1),'date-asc':(a,b)=>compareDates(a,b,1)}[sort];
  return compare?result.sort(compare):result;
}
function compareDates(a,b,direction){const x=rollDate(a),y=rollDate(b);return !x?(!y?0:1):!y?-1:direction*x.localeCompare(y);}
export function selectPhotoRange(selected,ids,anchor,id,{range=false,additive=false}={}) {
  const next=new Set(selected),end=ids.indexOf(id),start=ids.indexOf(anchor);
  if(end<0)return next;
  if(range&&start>=0){if(!additive)next.clear();for(const key of ids.slice(Math.min(start,end),Math.max(start,end)+1))next.add(key);}
  else if(next.has(id))next.delete(id);else next.add(id);
  return next;
}
