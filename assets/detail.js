import {escapeHtml as e,FIELD_LABELS,attachmentsOf} from './sample-core.js';
const root=document.querySelector('#detail');
const base=new URL('../',import.meta.url);
export function assetUrl(path){const u=new URL(path,base);if(u.origin!==base.origin||!u.pathname.startsWith(base.pathname+'f/'))throw new Error('附件地址不正确');return u.href;}
export function renderDetail(record,target=root,{preview=false}={}){
  const sample=record.sample||{},attachments=attachmentsOf(record);
  const fields=Object.entries(FIELD_LABELS).filter(([key])=>sample[key]);
  const events=record.history?.length?record.history:[{at:record.createdAt,action:'资料首次上传'}];
  target.innerHTML=`<div class="detail-brand"><span>样品资料 · 数字档案</span><span>${preview?'发布前预览':'公开查看'}</span></div><header class="hero"><div class="eyebrow">SAMPLE DOCUMENTS</div><span class="hero-code">${e(record.id)}</span><h1>${e(record.title)}</h1><p>${sample.sampleNo?'样品编号 '+e(sample.sampleNo):'图片 / PDF 资料档案'}</p></header><nav class="section-nav" aria-label="档案章节"><a href="#information">基本信息</a><a href="#attachments">图文与附件</a><a href="#trace">记录追溯</a></nav><section class="panel" id="information"><h2>基本信息</h2><dl class="info-grid"><div><dt>档案编号</dt><dd>${e(record.id)}</dd></div><div><dt>首次上传</dt><dd>${e(record.createdAt||'未记录')}</dd></div>${fields.map(([key,label])=>`<div><dt>${label}</dt><dd>${e(sample[key])}</dd></div>`).join('')}</dl>${!fields.length?'<p class="hint">本档案尚未填写样品扩展信息。</p>':''}${sample.description?`<h3 style="margin-top:24px">图文说明</h3><div class="description">${e(sample.description)}</div>`:''}</section><section class="panel" id="attachments"><div class="panel-title"><h2>图文与附件</h2><span class="muted">${attachments.length} 份</span></div><div class="attachment-tabs" aria-label="选择附件">${attachments.map((a,i)=>`<button class="btn small" aria-pressed="${i===0}" data-attachment="${i}">${a.kind==='pdf'?'PDF':'图片'} · ${e(a.originalName||'附件 '+(i+1))}</button>`).join('')}</div><div id="assetArea"></div></section><section class="panel" id="trace"><h2>记录追溯</h2><ol class="timeline">${events.slice().reverse().map(v=>`<li><time>${e(v.at||'日期未记录')}</time>${e(v.action)}</li>`).join('')}</ol><div class="notice">以上记录为资料上传与更新记录，不代表第三方检验认证。样品信息及报告内容由资料发布者提供。</div></section><p class="footnote">固定档案编号 ${e(record.id)} · 保留原始图片 / PDF<br>请以原始报告中的签章和结论为准。</p>`;
  function select(index){
    const attachment=attachments[index];if(!attachment)return;
    const url=preview?attachment.previewUrl:assetUrl(attachment.asset);
    const area=target.querySelector('#assetArea');
    area.innerHTML=`<p class="attachment-name">${e(attachment.originalName||'附件')}</p><div class="asset-frame">${attachment.kind==='pdf'?`<iframe title="${e(attachment.originalName||'PDF 预览')}" src="${e(url)}#view=FitH"></iframe>`:`<a href="${e(url)}" target="_blank" rel="noopener"><img src="${e(url)}" alt="${e(attachment.originalName||record.title)}" loading="lazy"></a>`}</div><div class="actions"><a class="btn primary" href="${e(url)}" target="_blank" rel="noopener">${attachment.kind==='pdf'?'打开 PDF':'查看大图'}</a><a class="btn" href="${e(url)}" download="${e(attachment.originalName||'附件')}">下载原文件</a></div>${attachment.kind==='pdf'?'<p class="hint">若手机未显示内嵌 PDF，请点击“打开 PDF”或下载查看。</p>':'<p class="hint">点击图片可打开原图。</p>'}`;
    target.querySelectorAll('[data-attachment]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.attachment)===index)));
  }
  target.querySelectorAll('[data-attachment]').forEach(b=>b.onclick=()=>select(Number(b.dataset.attachment)));select(0);
}
if(root&&!document.body.dataset.preview){
  const id=document.body.dataset.recordId;
  fetch(new URL('data/files.json',base),{cache:'no-store'}).then(r=>{if(!r.ok)throw new Error('资料读取失败');return r.json()}).then(records=>{const r=records.find(x=>x.id.toUpperCase()===id);if(!r)throw new Error('未找到此档案');document.title=r.title+' · '+r.id;renderDetail(r)}).catch(error=>{root.innerHTML=`<section class="panel"><h1>暂时无法读取档案</h1><p>${e(error.message)}</p><p>请刷新重试，或联系资料发布者。</p><button class="btn" id="retry">重新加载</button></section>`;document.querySelector('#retry').onclick=()=>location.reload()});
}
