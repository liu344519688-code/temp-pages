import {escapeHtml as e,FIELD_LABELS,attachmentsOf,nextFileId,normalizeSample} from './sample-core.js';
import {renderDetail,assetUrl} from './detail.js';
import {scanUrl,isPublished,waitForPublished} from './publish-state.js';
const $=id=>document.getElementById(id),base=new URL('../',import.meta.url);
let records=[],workerApi='',advanced=false,editing=null,busy=false,previewUrls=[];
function status(text,type=''){const el=$('status');el.textContent=text;el.className='status '+type;el.hidden=false;}
function sample(){return normalizeSample(Object.fromEntries([...Object.keys(FIELD_LABELS),'description'].map(k=>[k,$(k).value])));}
function selected(){const files=Array.from($('file').files);if(files.length>8)throw new Error('每次最多上传 8 份附件');if(files.reduce((n,f)=>n+f.size,0)>20*1024*1024)throw new Error('附件合计超过 20 MB');for(const f of files){if(!['image/jpeg','image/png','image/webp','application/pdf'].includes(f.type))throw new Error('只支持 JPG、PNG、WEBP、PDF');if(!f.size||f.size>8*1024*1024)throw new Error('附件不能为空，每份不能超过 8 MB');}return files;}
async function loadRecords(){const r=await fetch(new URL('data/files.json?t='+Date.now(),base),{cache:'no-store'});if(!r.ok)throw new Error('资料库读取失败');const data=await r.json();if(!Array.isArray(data))throw new Error('资料记录格式异常');records=data;$('nextBadge').textContent='下一编号 '+nextFileId(records);render();}
async function loadConfig(){try{const r=await fetch(new URL('data/app-config.json',base),{cache:'no-store'});if(!r.ok)throw new Error('配置读取失败');const c=await r.json();workerApi=String(c.workerApiBase||'').replace(/\/$/,'');if(!workerApi)throw new Error('尚未配置上传服务');const health=await fetch(workerApi+'/health',{signal:AbortSignal.timeout(15000)});if(!health.ok)throw new Error('上传服务暂时不可用');const h=await health.json();advanced=Number(h.version)>=2;$('backendHint').textContent=advanced?'上传服务已连接 · 支持样品信息、多附件与固定档案更新':'基础上传服务已连接。扩展后台尚未发布，仅支持单文件上传。';$('uploadBtn').disabled=false;}catch(error){$('backendHint').textContent='上传服务未连接：'+error.message+'。仍可浏览现有资料与打印标签。';}}
function render(){const query=$('search').value.trim().toLowerCase(),kind=$('kindFilter').value;const list=records.slice().reverse().filter(r=>[r.id,r.title,...Object.values(r.sample||{})].join(' ').toLowerCase().includes(query)&&(!kind||attachmentsOf(r).some(a=>a.kind===kind)));$('recordCount').textContent=list.length+' / '+records.length+' 份';$('recordsBody').innerHTML=list.length?list.map(r=>`<article class="record-card"><div class="record-top"><span class="record-code">${e(r.id)}</span><div><h3>${e(r.title)}</h3><p class="muted">${e(r.sample?.sampleNo||r.originalName||'')}</p><p class="muted">${e(r.createdAt)} · ${attachmentsOf(r).length} 份附件</p></div></div><div class="actions"><a class="btn primary small" target="_blank" rel="noopener" href="${e(scanUrl(r,base))}">查看档案 ↗</a><button class="btn small" data-action="qr" data-id="${e(r.id)}">二维码 / 标签</button><button class="btn small" data-action="copy" data-id="${e(r.id)}">复制链接</button><button class="btn small" data-action="edit" data-id="${e(r.id)}">编辑</button></div></article>`).join(''):'<p class="empty">没有匹配的资料</p>';$('recordsBody').querySelectorAll('button[data-id]').forEach(b=>b.onclick=()=>{const r=records.find(x=>x.id===b.dataset.id);if(b.dataset.action==='qr')openQr(r);if(b.dataset.action==='copy')copy(scanUrl(r,base));if(b.dataset.action==='edit')edit(r);});}
async function copy(text){try{await navigator.clipboard.writeText(text);status('固定档案链接已复制。','success');}catch{status('请复制：'+text);}}
function edit(r){if(!advanced){status('编辑样品字段需要发布新版 Cloudflare 上传后台。原档案继续可查看。','error');$('status').scrollIntoView({behavior:'smooth',block:'center'});return;}editing=r;$('title').value=r.title;for(const k of [...Object.keys(FIELD_LABELS),'description'])$(k).value=r.sample?.[k]||'';$('file').value='';$('fileList').textContent='已保留 '+attachmentsOf(r).length+' 份原附件。';$('formTitle').textContent='编辑资料档案';$('editBadge').textContent=r.id;$('uploadBtn').textContent='保存更新 · 保留原二维码';$('fileLabel').textContent='追加图片 / PDF（可选）';$('moreFields').open=true;$('uploadForm').scrollIntoView({behavior:'smooth'});}
function reset(){if(busy)return;editing=null;$('uploadForm').reset();$('fileList').textContent='';$('formTitle').textContent='建立资料档案';$('editBadge').textContent='';$('uploadBtn').textContent='上传并生成固定二维码';$('fileLabel').textContent='选择附件 *（可多选）';$('status').hidden=true;}
function base64(file){return new Promise((resolve,reject)=>{const reader=new FileReader();reader.onload=()=>resolve(String(reader.result).split(',')[1]);reader.onerror=()=>reject(new Error('读取文件失败'));reader.readAsDataURL(file);});}
async function publish(event){
  event.preventDefault();if(busy)return;
  let files,info;const current=editing,title=$('title').value.trim(),pin=$('pin').value;
  try{
    files=selected();info=sample();
    if(!title)throw new Error('请填写名称');
    if(!current&&!files.length)throw new Error('请至少选择一份附件');
    if(!pin)throw new Error('请输入上传管理密码');
    if(!advanced&&(current||files.length>1||Object.keys(info).length))throw new Error('当前后台尚不支持样品字段或多附件，已保留填写内容。');
  }catch(error){status(error.message,'error');return;}
  busy=true;$('uploadBtn').disabled=true;$('clearBtn').disabled=true;status('正在上传并保存，请勿重复提交…');
  let saved=null;
  try{
    const uploads=await Promise.all(files.map(async f=>({originalName:f.name,mime:f.type,fileBase64:await base64(f)})));
    const payload={title,sample:info,files:uploads};
    if(current){payload.id=current.id;payload.expectedRevision=current.revision||current.createdAt;}
    if(!advanced)Object.assign(payload,uploads[0]);
    const response=await fetch(workerApi+(current?'/update':'/upload'),{method:'POST',headers:{'Content-Type':'application/json','X-Admin-Pin':pin},body:JSON.stringify(payload)});
    const result=await response.json().catch(()=>({}));
    if(!response.ok||!result.ok)throw new Error(result.error||'保存失败');
    saved=result.record||{id:result.id,title,path:new URL(result.pageUrl).pathname.slice(base.pathname.length),asset:new URL(result.assetUrl).pathname.slice(base.pathname.length),sample:info};
    editing=saved;$('pin').value='';$('file').value='';$('fileList').textContent='';
    $('formTitle').textContent='编辑资料档案';$('editBadge').textContent=saved.id;$('uploadBtn').textContent='保存更新 · 保留原二维码';$('fileLabel').textContent='追加图片 / PDF（可选）';
    status(saved.id+' 已保存，正在等待网页发布并检查原文件，请稍候…');
    const ready=await waitForPublished(saved,base);
    if(!ready){status(saved.id+' 已保存，但网页还未准备好。请稍后刷新资料库再获取二维码，不要重复上传。','error');return;}
    records=records.filter(r=>r.id!==saved.id).concat(saved);render();$('nextBadge').textContent='下一编号 '+nextFileId(records);
    status(saved.id+' 发布完成，页面和原文件均已可打开。','success');
    await openQr(saved,{verified:true});
  }catch(error){status(saved?saved.id+' 已保存，发布检查暂时未完成，请稍后从资料库获取二维码，不要重复上传。':'保存未完成：'+error.message+'。若连接中断，请先刷新资料库确认有无新记录。','error');}
  finally{busy=false;$('uploadBtn').disabled=false;$('clearBtn').disabled=false;}
}
async function openQr(r,{verified=false}={}){
  if(typeof QRCode==='undefined'){status('二维码组件读取失败，请刷新重试。','error');return;}
  if(!verified){
    status('正在检查 '+r.id+' 的网页和原文件…');
    if(!await isPublished(r,base)){status(r.id+' 的页面仍在发布或暂时无法连接，请稍后重试，暂不提供二维码。','error');return;}
    status(r.id+' 页面和原文件已就绪。','success');
  }
  $('qrWrap').innerHTML='';
  new QRCode($('qrWrap'),{text:scanUrl(r,base),width:236,height:236,correctLevel:QRCode.CorrectLevel.M});
  $('qrHeading').textContent=r.title;$('labelMeta').textContent=r.id+(r.sample?.sampleNo?' · 样品编号 '+r.sample.sampleNo:'');$('qrDialog').showModal();
  $('downloadQr').onclick=()=>{const canvas=$('qrWrap').querySelector('canvas');if(!canvas)return;const a=document.createElement('a');a.href=canvas.toDataURL('image/png');a.download=r.id+'-二维码.png';a.click();};
}
function closeQr(){$('qrDialog').close();document.body.classList.remove('print-label');}
function closePreview(){$('previewDialog').close();$('previewContent').innerHTML='';previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];}
$('previewBtn').onclick=()=>{try{const files=selected();const old=editing?attachmentsOf(editing).map(a=>({...a,previewUrl:assetUrl(a.asset)})):[];previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];const attachments=old.concat(files.map(f=>{const url=URL.createObjectURL(f);previewUrls.push(url);return {originalName:f.name,kind:f.type==='application/pdf'?'pdf':'image',previewUrl:url};}));if(!attachments.length)throw new Error('请选择附件后预览');renderDetail({id:editing?.id||nextFileId(records),title:$('title').value.trim()||'未命名资料',createdAt:editing?.createdAt||'待发布',sample:sample(),attachments,history:editing?.history},$('previewContent'),{preview:true});$('previewDialog').showModal();}catch(error){status(error.message,'error');}};
$('file').onchange=()=>{try{$('fileList').innerHTML=selected().map(f=>`<li>${e(f.name)} · ${(f.size/1024/1024).toFixed(2)} MB</li>`).join('');}catch(error){status(error.message,'error');}};
$('search').oninput=render;$('kindFilter').onchange=render;$('uploadForm').onsubmit=publish;$('clearBtn').onclick=reset;$('closeQr').onclick=closeQr;$('closePreview').onclick=closePreview;$('previewDialog').addEventListener('close',()=>{previewUrls.forEach(URL.revokeObjectURL);previewUrls=[];});$('qrDialog').addEventListener('close',()=>document.body.classList.remove('print-label'));$('printLabel').onclick=()=>{document.body.classList.add('print-label');window.print();};window.addEventListener('afterprint',()=>document.body.classList.remove('print-label'));
loadRecords().catch(error=>{$('recordsBody').textContent=error.message;$('recordCount').textContent='读取失败';});loadConfig();
