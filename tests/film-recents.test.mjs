import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filmStocks} from '../public/film-catalog.mjs';
import {rememberFilm,recentFilmNames,sortByRecentFilms} from '../public/film-recents.mjs';
test('最近胶卷按确认顺序置顶，别名去重、自定义保留，历史档案作为初始顺序',()=>{
  const history=recentFilmNames({rolls:[{film:'乐凯200'},{film:'Portra400'},{film:'乐凯 C200'},{film:'我的手工卷'}]});
  assert.deepEqual(history,['Lucky C200','Kodak Portra 400','我的手工卷']);
  const next=rememberFilm(history,'Portra400');assert.equal(next[0],'Kodak Portra 400');assert.equal(next.length,3);assert.equal(history[0],'Lucky C200');
  assert.equal(rememberFilm(next,'我的手工卷')[0],'我的手工卷');
  assert.deepEqual(recentFilmNames({recentFilms:[],rolls:[{film:'乐凯200'}]}),[]);
  assert.equal(rememberFilm(Array.from({length:35},(_,i)=>`自定义 ${i}`),'最新').length,30);
});
test('图片型号库、筛选结果和输入选项共用最近顺序，未使用项维持原序',()=>{
  const recent=['乐凯200','Kodak Portra 400'],sorted=sortByRecentFilms(filmStocks,recent);
  assert.deepEqual(sorted.slice(0,2).map(f=>f.id),['lucky-c200','kodak-portra-400']);
  assert.deepEqual(sorted.slice(2),filmStocks.filter(f=>!['lucky-c200','kodak-portra-400'].includes(f.id)));
  assert.deepEqual(sortByRecentFilms(['其他','Portra400','乐凯200'],recent,name=>name),['乐凯200','Portra400','其他']);
});
