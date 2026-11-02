import {normalizeSample,nextFileId,attachmentsOf,viewerHtml} from '../../assets/sample-core.js';
const API='https://api.github.com/repos/liu344519688-code/temp-pages';
const BASE='https://liu344519688-code.github.io/temp-pages/';
export class UploadError extends Error{constructor(message,status=400){super(message);this.status=status;}}
export function validateFiles(input){
  if(!Array.isArray(input)||input.length>8)throw new UploadError('每次最多上传 8 份附件');
  let total=0;
  const types={'image/jpeg':{ext:'jpg',kind:'image'},'image/png':{ext:'png',kind:'image'},'image/webp':{ext:'webp',kind:'image'},'application/pdf':{ext:'pdf',kind:'pdf'}};
  return input.map(file=>{
    const mime=String(file.mime||'').toLowerCase(),type=types[mime],name=String(file.originalName||'').trim(),content=String(file.fileBase64||'').replace(/\s/g,'');
    if(!type||!name||name.length>240)throw new UploadError('附件类型或文件名不正确');
    if(content.length>Math.ceil(8*1024*1024/3)*4+4)throw new UploadError('每份附件不能超过 8 MB',413);
    const padding=content.endsWith('==')?2:content.endsWith('=')?1:0;
    if(!content||content.length%4||/[^A-Za-z0-9+/=]/.test(content)||content.indexOf('=')!==(padding?content.length-padding:-1))throw new UploadError('文件编码不正确');
    const binary=atob(content),size=binary.length;total+=size;
    if(size>8*1024*1024||total>20*1024*1024)throw new UploadError('每份最多 8 MB，合计最多 20 MB',413);
    const starts=prefix=>binary.startsWith(prefix);
    const valid=mime==='application/pdf'?starts('%PDF-'):mime==='image/jpeg'?starts('\xff\xd8\xff'):mime==='image/png'?starts('\x89PNG\r\n\x1a\n'):starts('RIFF')&&binary.slice(8,12)==='WEBP';
    if(!valid)throw new UploadError('文件内容与扩展类型不一致');
    return {mime,originalName:name,content,size,...type};
  });
}
function b64(text){const bytes=new TextEncoder().encode(text);let out='';for(let i=0;i<bytes.length;i+=0x8000)out+=String.fromCharCode(...bytes.subarray(i,i+0x8000));return btoa(out);}
function fromB64(text){return new TextDecoder().decode(Uint8Array.from(atob(text.replace(/\s/g,'')),x=>x.charCodeAt(0)));}
export async function saveSample(body,env,{update=false,fetcher=fetch}={}){
  const title=String(body.title||'').trim();if(!title||title.length>120)throw new UploadError('名称不能为空且不能超过 120 字');
  const sample=normalizeSample(body.sample),files=validateFiles(body.files??(body.fileBase64?[body]:[]));
  if(!update&&!files.length)throw new UploadError('请至少上传一份附件');
  if(update&&!/^F\d+$/.test(body.id||''))throw new UploadError('档案编号格式不正确');
  const headers={'Authorization':`Bearer ${env.GITHUB_TOKEN}`,'User-Agent':'sample-qr-worker','Accept':'application/vnd.github+json','Content-Type':'application/json','X-GitHub-Api-Version':'2022-11-28'};
  async function gh(path,method='GET',data){const response=await fetcher(API+path,{method,headers,body:data===undefined?undefined:JSON.stringify(data)});if(!response.ok){const error=new UploadError('仓库保存失败，请稍后重试或检查后台访问权限',502);error.githubStatus=response.status;throw error;}return response.json();}
  // Blobs stay unreferenced until one atomic tree/commit/ref update succeeds.
  const blobs=await Promise.all(files.map(f=>gh('/git/blobs','POST',{content:f.content,encoding:'base64'})));
  for(let attempt=0;attempt<3;attempt++){
    const head=await gh('/git/ref/heads/main'),parent=head.object.sha,commit=await gh('/git/commits/'+parent);
    const registry=await gh('/contents/data/files.json?ref='+parent);
    const records=JSON.parse(fromB64(registry.content));if(!Array.isArray(records))throw new UploadError('资料库格式异常',500);
    const old=update?records.find(r=>r.id===body.id):null;
    if(update&&!old)throw new UploadError('档案不存在',404);
    if(update&&(!body.expectedRevision||body.expectedRevision!==(old.revision||old.createdAt)))throw new UploadError('档案已被其他操作更新，请刷新后重新编辑',409);
    const id=old?.id||nextFileId(records),path=old?.path||`f/${id.toLowerCase()}/`,now=new Date().toISOString();
    const revision=crypto.randomUUID(),existing=old?attachmentsOf(old):[];
    const added=files.map((f,i)=>({asset:`${path}${old?'add-'+revision+'-':''}file${existing.length+i+1}.${f.ext}`,kind:f.kind,mime:f.mime,originalName:f.originalName,size:f.size}));
    const record={...old,id,title,path,sample,attachments:existing.concat(added),createdAt:old?.createdAt||now.slice(0,10),updatedAt:now,revision,history:[...(old?.history|| (old?[{at:old.createdAt,action:'资料首次上传'}]:[])),{at:now,action:update?'更新样品信息'+(added.length?'，追加 '+added.length+' 份附件':''):'建立档案，上传 '+added.length+' 份附件'}]};
    if(record.attachments.length>64)throw new UploadError('单份档案最多保留 64 份附件');
    if(!old)Object.assign(record,{asset:added[0].asset,kind:added[0].kind,mime:added[0].mime,originalName:added[0].originalName});
    const next=update?records.map(r=>r.id===id?record:r):records.concat(record);
    const entries=added.map((a,i)=>({path:a.asset,mode:'100644',type:'blob',sha:blobs[i].sha}));
    entries.push({path:path+'index.html',mode:'100644',type:'blob',content:viewerHtml(id,title)},{path:'data/files.json',mode:'100644',type:'blob',content:JSON.stringify(next,null,2)+'\n'});
    const tree=await gh('/git/trees','POST',{base_tree:commit.tree.sha,tree:entries});
    const saved=await gh('/git/commits','POST',{message:`${update?'Update':'Create'} ${id} sample archive`,tree:tree.sha,parents:[parent]});
    try{await gh('/git/refs/heads/main','PATCH',{sha:saved.sha,force:false});return {ok:true,id,record,pageUrl:BASE+path,assetUrl:BASE+record.asset,commit:saved.sha};}
    catch(error){if(![409,422].includes(error.githubStatus)||attempt===2)throw error;}
  }
}
export async function handleSampleRequest(request,env,origin,json,update=false){
  if(!env.ADMIN_PIN)return json({ok:false,error:'后台尚未配置上传密码'},500,origin);
  if(request.headers.get('X-Admin-Pin')!==env.ADMIN_PIN)return json({ok:false,error:'上传密码不正确'},401,origin);
  if(Number(request.headers.get('Content-Length')||0)>29*1024*1024)return json({ok:false,error:'请求过大'},413,origin);
  let body;try{body=await request.json();}catch{return json({ok:false,error:'上传数据格式不正确'},400,origin);}
  try{return json(await saveSample(body,env,{update}),update?200:201,origin);}catch(error){return json({ok:false,error:error.message||'保存失败'},error.status||400,origin);}
}
