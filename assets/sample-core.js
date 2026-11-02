export const FIELD_LABELS = {sampleNo:'样品编号',model:'规格 / 型号',batch:'批次',manufacturer:'生产 / 提供单位',reportNo:'报告编号',productionDate:'生产日期',inspectionDate:'检验日期'};
export function escapeHtml(s){return String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));}
export function normalizeSample(raw={}){
  const result={};
  for(const key of [...Object.keys(FIELD_LABELS),'description']){
    if(raw[key]!=null&&typeof raw[key]!=='string')throw new Error('样品字段必须为文字');
    const value=String(raw[key]||'').trim();
    if(value.length>(key==='description'?3000:160))throw new Error('样品字段内容过长');
    if(value)result[key]=value;
  }
  for(const key of ['productionDate','inspectionDate'])if(result[key]&&!/^\d{4}-\d{2}-\d{2}$/.test(result[key]))throw new Error('日期格式应为 YYYY-MM-DD');
  return result;
}
export function nextFileId(records){return 'F'+String(Math.max(0,...records.map(r=>/^F\d+$/i.test(r.id)?Number(r.id.slice(1)):0))+1).padStart(3,'0');}
export function attachmentsOf(record){return record.attachments?.length?record.attachments:[{asset:record.asset,kind:record.kind,mime:record.mime,originalName:record.originalName}];}
export function primaryAssetOf(record){return record.asset||attachmentsOf(record)[0]?.asset;}
export function viewerHtml(id,title='样品资料',asset){
  if(!/^F\d+$/i.test(id))throw new Error('资料编号格式不正确');
  const head=`<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title>`;
  if(asset){
    const prefix=`f/${id.toLowerCase()}/`;
    if(!asset.startsWith(prefix)||!/^[-\w]+\.(?:jpe?g|png|webp|pdf)$/i.test(asset.slice(prefix.length)))throw new Error('原文件地址不正确');
    const target='./'+asset.slice(prefix.length);
    return `${head}<meta http-equiv="refresh" content="0;url=${target}"><script>location.replace(${JSON.stringify(target)})</script></head><body></body></html>`;
  }
  return `${head}</head><body data-record-id="${id.toUpperCase()}"><main id="detail"></main><script type="module" src="../../assets/detail.js"></script></body></html>`;
}
