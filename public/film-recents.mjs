import {findFilmStock} from './film-catalog.mjs';
const canonical=name=>findFilmStock(name)?.name||String(name||'').trim().slice(0,160);
const key=name=>canonical(name).normalize('NFKC').toLocaleLowerCase();
export function rememberFilm(recent,name){
  const result=[],seen=new Set();
  for(const value of [name,...recent]){const label=canonical(value),id=key(label);if(label&&!seen.has(id)){result.push(label);seen.add(id);}if(result.length===30)break;}
  return result;
}
export function recentFilmNames(library){
  const names=Array.isArray(library.recentFilms)?library.recentFilms:(library.rolls||[]).map(r=>r.film);
  return rememberFilm(names,'');
}
export function sortByRecentFilms(items,recent,nameOf=item=>item.name){
  const positions=new Map(recent.map((name,index)=>[key(name),index]));
  return [...items].sort((a,b)=>(positions.get(key(nameOf(a)))??recent.length)-(positions.get(key(nameOf(b)))??recent.length));
}
