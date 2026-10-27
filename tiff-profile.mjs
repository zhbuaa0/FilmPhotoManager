import fs from 'node:fs/promises';
// Attach an ICC tag without running a second colour transform on already decoded RGB samples.
// Only our own single-page classic TIFF exports are accepted; source files are never passed here.
export async function attachTiffProfile(file,profile){
  const handle=await fs.open(file,'r+');
  try{
    const header=Buffer.alloc(8);await handle.read(header,0,8,0);const little=header.toString('ascii',0,2)==='II';
    if(!little&&header.toString('ascii',0,2)!=='MM')throw new Error('修正版 TIFF 文件头无效。');
    const u16=(b,o)=>little?b.readUInt16LE(o):b.readUInt16BE(o),u32=(b,o)=>little?b.readUInt32LE(o):b.readUInt32BE(o),w16=(b,n,o)=>little?b.writeUInt16LE(n,o):b.writeUInt16BE(n,o),w32=(b,n,o)=>little?b.writeUInt32LE(n,o):b.writeUInt32BE(n,o);
    if(u16(header,2)!==42)throw new Error('此导出只支持标准 TIFF。');
    const offset=u32(header,4),countBytes=Buffer.alloc(2);await handle.read(countBytes,0,2,offset);const count=u16(countBytes,0),table=Buffer.alloc(count*12+4);await handle.read(table,0,table.length,offset+2);
    if(u32(table,count*12)!==0)throw new Error('修正版必须是单页 TIFF。');
    const entries=[];for(let i=0;i<count;i++){const entry=Buffer.from(table.subarray(i*12,i*12+12));if(u16(entry,0)!==34675)entries.push(entry);}
    const size=(await handle.stat()).size,profileOffset=size+(size%2),directoryOffset=profileOffset+profile.length+(profile.length%2),tag=Buffer.alloc(12);w16(tag,34675,0);w16(tag,7,2);w32(tag,profile.length,4);w32(tag,profileOffset,8);entries.push(tag);entries.sort((a,b)=>u16(a,0)-u16(b,0));
    const directory=Buffer.alloc(2+entries.length*12+4);w16(directory,entries.length,0);entries.forEach((entry,i)=>entry.copy(directory,2+i*12));
    await handle.write(Buffer.concat([Buffer.alloc(size%2),profile,Buffer.alloc(profile.length%2),directory]),0,directoryOffset+directory.length-size,size);
    const pointer=Buffer.alloc(4);w32(pointer,directoryOffset,0);await handle.write(pointer,0,4,4);
  }finally{await handle.close();}
}
