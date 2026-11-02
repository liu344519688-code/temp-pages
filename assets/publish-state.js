import {primaryAssetOf} from './sample-core.js';
export function scanUrl(record,base){
  const url=new URL(record.path,base);
  const revision=record.revision||record.updatedAt||record.createdAt;
  if(revision)url.searchParams.set('v',revision);
  return url.href;
}
export async function isPublished(record,base,{fetcher=fetch}={}){
  try{
    const nonce=String(Date.now());
    const registry=await fetcher(new URL('data/files.json?ready='+nonce,base),{cache:'no-store',signal:AbortSignal.timeout(10000)});
    if(!registry.ok)return false;
    const records=await registry.json();
    const published=records.find(r=>r.id===record.id);
    if(!published||(record.revision&&published.revision!==record.revision))return false;
    const page=new URL(scanUrl(record,base)),asset=new URL(primaryAssetOf(published),base);
    page.searchParams.set('ready',nonce);asset.searchParams.set('ready',nonce);
    const checks=await Promise.all([page,asset].map(url=>fetcher(url,{method:'HEAD',cache:'no-store',signal:AbortSignal.timeout(10000)})));
    return checks.every(r=>r.ok);
  }catch{return false;}
}
export async function waitForPublished(record,base,{fetcher=fetch,attempts=60,interval=3000,sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),onAttempt=()=>{}}={}){
  for(let i=0;i<attempts;i++){
    onAttempt(i+1);
    if(await isPublished(record,base,{fetcher}))return true;
    if(i<attempts-1)await sleep(interval);
  }
  return false;
}
