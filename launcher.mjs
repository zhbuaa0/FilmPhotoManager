import {spawn,execFile} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.dirname(fileURLToPath(import.meta.url));
const port=Number(process.env.PORT||4317),url=`http://127.0.0.1:${port}`;
function openBrowser(){
  const command=process.platform==='win32'?'rundll32.exe':process.platform==='darwin'?'open':'xdg-open';
  const args=process.platform==='win32'?['url.dll,FileProtocolHandler',url]:[url];
  execFile(command,args,{windowsHide:true},error=>{if(error)console.log(`请在浏览器打开 ${url}`);});
}
async function ready(){
  try{const response=await fetch(url+'/api/library',{signal:AbortSignal.timeout(1500)});return response.ok&&Array.isArray((await response.json()).rolls);}
  catch{return false;}
}
if(await ready())openBrowser();
else {
  const child=spawn(process.execPath,[path.join(root,'server.mjs')],{cwd:root,stdio:'inherit'});
  child.on('error',error=>{console.error(error.message);process.exitCode=1;});
  child.on('exit',code=>{process.exitCode=code??0;});
  for(let i=0;i<50;i++){
    if(child.exitCode!==null)break;
    if(await ready()){openBrowser();break;}
    await new Promise(resolve=>setTimeout(resolve,200));
  }
}
