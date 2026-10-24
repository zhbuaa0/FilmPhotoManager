// Local, attributed model references; personal photographs stay in data/.
export const cameraPhotoReferences=[
  {key:'olympus-mju-ii',label:'奥林巴斯 μ-II · 35mm 定焦',src:'/assets/cameras/olympus-mju-ii.webp',caption:'μ-II 35mm f/2.8 · 型号参考图',author:'Ardo Beltz',source:'https://commons.wikimedia.org/wiki/File:Olympus_mju_ii.jpg',license:'CC BY-SA 3.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/3.0/'},
  {key:'canon-kiss-iii',label:'佳能 Kiss III / EOS 300 机身',src:'/assets/cameras/canon-eos-300.webp',caption:'EOS 300 · Kiss III 同款海外版机身参考图',author:'Ansgar Koreng',source:'https://commons.wikimedia.org/wiki/File:Canon_EOS_300,_1803102122,_ako.jpg',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'},
  {key:'canon-ef-50-stm',label:'佳能 EF 50mm f/1.8 STM 镜头',src:'/assets/cameras/canon-ef-50-stm.webp',caption:'EF 50mm f/1.8 STM · 镜头参考图',author:'Geognerd',source:'https://commons.wikimedia.org/wiki/File:Ef_50mm_stm.JPG',license:'CC BY-SA 4.0',licenseUrl:'https://creativecommons.org/licenses/by-sa/4.0/'}
];
export function inferCameraPhoto(camera) {
  const model=String(camera.model||'').normalize('NFKC').toLowerCase(),brand=String(camera.brand||'').toLowerCase();
  if(!/zoom|变焦/.test(model)&&/olympus|奥林巴斯|奥利巴斯/.test(brand+' '+model)&&/(?:mju|μ)[^\p{L}\p{N}]*ii\b|\bu2\b/u.test(model))return 'olympus-mju-ii';
  if(!/300d|iii\s*l\b|digital/.test(model)&&/kiss\s*(iii|3)\b|eos\s*300\b|rebel\s*2000\b/.test(model))return 'canon-kiss-iii';
  return '';
}
export function cameraPhotos(camera) {
  const choice=camera.photoChoice||'auto';
  if(choice==='none')return [];
  if(choice==='custom')return /^[a-f0-9-]+\.jpg$/.test(camera.photo||'')?[{src:'/camera-images/'+camera.photo,caption:'我的相机照片',personal:true}]:[];
  const key=choice==='auto'?inferCameraPhoto(camera):choice,reference=cameraPhotoReferences.find(p=>p.key===key);
  if(!reference)return [];
  const photos=[reference];
  if(key==='canon-kiss-iii'&&/\bef\s*50\s*mm\b/i.test(camera.lens||'')&&/\bstm\b/i.test(camera.lens||''))photos.push(cameraPhotoReferences.find(p=>p.key==='canon-ef-50-stm'));
  return photos;
}
