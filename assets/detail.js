import {escapeHtml as e,attachmentsOf,primaryAssetOf} from './sample-core.js';
const root=document.querySelector('#detail');
const base=new URL('../',import.meta.url);
export function assetUrl(path){const u=new URL(path,base);if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname+'f/'))throw new Error('附件地址不正确');return u.href;}
export function renderDetail(record,target=root,{preview=false}={}){
  const files=attachmentsOf(record),attachment=files.find(a=>a.asset===record.asset)||files[0];
  if(!attachment)throw new Error('缺少原文件');
  const url=preview?attachment.previewUrl:assetUrl(primaryAssetOf(record));
  target.innerHTML=attachment.kind==='pdf'?`<iframe title="PDF" src="${e(url)}" style="display:block;width:100%;height:78vh;border:0"></iframe>`:`<img src="${e(url)}" alt="" style="display:block;max-width:100%;height:auto;margin:auto">`;
}
// Also support already-created viewer shells from the existing upload service.
if(root&&!document.body.dataset.preview){
  const id=document.body.dataset.recordId;
  fetch(new URL('data/files.json',base),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('文件暂时无法打开');return r.json()}).then(records=>{const record=records.find(r=>r.id.toUpperCase()===id);if(!record)throw new Error('文件不存在');location.replace(assetUrl(primaryAssetOf(record)));}).catch(error=>{root.textContent=error.message;});
}
