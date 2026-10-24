import {filmStocks} from './film-stocks.mjs';
export {filmStocks};
export const filmKinds={color:'彩色负片',bw:'黑白负片',slide:'彩色反转片',creative:'特殊色彩'};
export const filmBrands={Kodak:'柯达',Fujifilm:'富士',Ilford:'伊尔福',Kentmere:'肯特米尔',CineStill:'CineStill',Harman:'哈曼',Foma:'福马',Rollei:'禄来',Adox:'爱多克斯',Ferrania:'费拉尼亚',Lomography:'Lomography',Lucky:'乐凯'};
const normalize=value=>String(value||'').normalize('NFKC').toLowerCase().replace(/[^\p{L}\p{N}]/gu,'');
export function findFilmStock(name) {
  const value=normalize(name);if(!value)return null;
  return filmStocks.find(f=>[f.name,f.model,`${filmBrands[f.brand]||f.brand}${f.model}`,...f.aliases].some(alias=>normalize(alias)===value))||null;
}
export function filterFilmStocks({query='',brand='',kind='',format='',iso=''}={}) {
  const terms=String(query).trim().split(/\s+/).map(normalize).filter(Boolean);
  return filmStocks.filter(f=>(!brand||f.brand===brand)&&(!kind||f.kind===kind)&&(!format||f.formats.includes(format))&&(!iso||(f.isoChoices||[f.iso]).includes(Number(iso)))&&terms.every(term=>normalize([f.name,f.model,filmBrands[f.brand],filmKinds[f.kind],f.process,f.iso,...f.aliases].join(' ')).includes(term)));
}
export function filmSelection(stockId,{format,iso,fillIso=true}={}) {
  const stock=filmStocks.find(f=>f.id===stockId);if(!stock)throw new Error('这个胶卷型号不存在，请重新选择。');
  if(!stock.formats.includes(format))throw new Error('请选择该型号支持的胶片规格。');
  const values={film:stock.name,format};
  if(fillIso){if(!(stock.isoChoices||[stock.iso]).includes(Number(iso)))throw new Error('请选择该型号标注的 ISO / EI。');values.iso=String(iso);}
  return values;
}
