import {test} from 'node:test';
import assert from 'node:assert/strict';
import {filmDefaults,filmPresentation} from '../public/film-canister.mjs';

test('型号变更自动带入感光度并选择兼容画幅，同一型号别名保留已有曝光记录',()=>{
  assert.deepEqual(filmDefaults('乐凯200','',{format:''}),{iso:'200',format:'135'});
  assert.deepEqual(filmDefaults('Portra400','乐凯200',{format:'120'}),{iso:'400',format:'120'});
  assert.deepEqual(filmDefaults('乐凯200','',{format:'110'}),{iso:'200',format:'135'});
  assert.deepEqual(filmDefaults('乐凯200','Lucky C200',{iso:'800',format:'120'}),{});
  assert.deepEqual(filmDefaults('自定义卷','',{iso:'800'}),{});
  assert.deepEqual(filmDefaults('C200',''),{});
});

test('暗盒随型号变化、缺失及歧义型号回退默认、120 使用卷轴且历史参数优先',()=>{
  const lucky=filmPresentation({film:'乐凯200'});
  assert.equal(lucky.id,'lucky-c200');assert.equal(lucky.brand,'Lucky');assert.equal(lucky.iso,200);assert.equal(lucky.format,'135');
  assert.notEqual(lucky.colour,filmPresentation({film:'Portra400'}).colour);
  assert.equal(filmPresentation({film:'Ilford HP5 Plus 400'}).monochrome,true);
  const spool=filmPresentation({film:'Portra400',format:'120',iso:'800'});
  assert.equal(spool.spool,true);assert.equal(spool.iso,'800');
  for(const film of ['',undefined,'C200','我的自装卷'])assert.equal(filmPresentation({film}).id,'default');
  assert.equal(filmPresentation({film:'我的自装卷'}).name,'我的自装卷');
});
