import {test} from 'node:test';
import assert from 'node:assert/strict';
import {collectionRolls,selectPhotoRange} from '../public/collection.mjs';
const rolls=[{id:'10',number:'10',title:'旅行',camera:'μ-II',film:'乐凯200',collectionFormat:'135',shotStart:'2025-10-01',photos:[1,2]},{id:'2',number:'2',title:'日常',camera:'Kiss III',film:'Gold',collectionFormat:'135',loadedAt:'2024-01-01',photos:[1]},{id:'3',number:'3',title:'未记录',photos:[]}];
test('胶卷组合筛选、自然编号排序、缺失日期置后且不修改原归档',()=>{
  assert.deepEqual(collectionRolls(rolls,{sort:'number'}).map(r=>r.id),['2','3','10']);
  assert.deepEqual(collectionRolls(rolls,{sort:'date-desc'}).map(r=>r.id),['10','2','3']);
  assert.deepEqual(collectionRolls(rolls,{sort:'date-asc'}).map(r=>r.id),['2','10','3']);
  assert.equal(collectionRolls(rolls,{query:'旅行',camera:'μ-II',film:'乐凯200',year:'2025',format:'135'}).length,1);
  assert.equal(collectionRolls(rolls,{camera:'Kiss III',year:'2025'}).length,0);
  assert.deepEqual(collectionRolls(rolls,{year:'__missing__',camera:'__missing__'}).map(r=>r.id),['3']);
  assert.deepEqual(rolls.map(r=>r.id),['10','2','3']);
});
test('Shift 连选按可见帧序，支持反向范围、追加和无效锚点',()=>{
  const ids=['a','b','c','d'];
  assert.deepEqual([...selectPhotoRange(new Set(['a']),ids,'d','b',{range:true})],['b','c','d']);
  assert.deepEqual([...selectPhotoRange(new Set(['a']),ids,'c','d',{range:true,additive:true})],['a','c','d']);
  assert.deepEqual([...selectPhotoRange(new Set(),['a','d'],'b','d',{range:true})],['d']);
  assert.deepEqual([...selectPhotoRange(new Set(['a']),ids,'a','a')],[]);
});
