import test from 'node:test';
import assert from 'node:assert/strict';
import {normalizeSample,nextFileId,viewerHtml,attachmentsOf,primaryAssetOf} from '../assets/sample-core.js';
import {validateFiles,saveSample} from '../cloudflare-worker/src/sample-upload.js';
import worker from '../cloudflare-worker/src/index.js';
const pdf={originalName:'报告.pdf',mime:'application/pdf',fileBase64:btoa('%PDF-1.7\n%%EOF')};
const png={originalName:'图片.png',mime:'image/png',fileBase64:btoa('\x89PNG\r\n\x1a\nTEST')};
// Unit tests use fixed sample data, never the growing production registry.
const legacy=[1,2].map(n=>({id:`F00${n}`,title:`Sample ${n}`,path:`f/f00${n}/`,asset:`f/f00${n}/file.jpg`,kind:'image',mime:'image/jpeg',originalName:'sample.jpg',createdAt:'2026-10-06'}));
function repoMock({conflict=false,seed=legacy}={}){
  const data={records:structuredClone(seed),head:'old-head',calls:[],commits:[],trees:[],writes:0};let n=0;
  async function fetcher(url,options={}){
    const path=url.split('/temp-pages')[1],method=options.method||'GET',body=options.body?JSON.parse(options.body):null;data.calls.push({path,method,body});
    let result;
    if(path==='/git/ref/heads/main')result={object:{sha:data.head}};
    else if(path.startsWith('/git/commits/')&&method==='GET')result={tree:{sha:'base-tree'}};
    else if(path.startsWith('/contents/'))result={content:Buffer.from(JSON.stringify(data.records)).toString('base64')};
    else if(path==='/git/blobs')result={sha:'blob-'+(++n)};
    else if(path==='/git/trees'){data.trees.push(body);result={sha:'tree-'+data.trees.length};}
    else if(path==='/git/commits'){data.commits.push(body);result={sha:'commit-'+data.commits.length};}
    else if(path==='/git/refs/heads/main'){
      if(conflict&&data.writes++===0){data.head='competing-head';data.records.push({id:'F003',path:'f/f003/',asset:'f/f003/file.jpg',createdAt:'2026-11-02',kind:'image'});return new Response('{}',{status:422});}
      data.head=body.sha;const tree=data.trees.at(-1);data.records=JSON.parse(tree.tree.find(x=>x.path==='data/files.json').content);result={object:{sha:data.head}};
    }else throw new Error('Unexpected GitHub request '+method+' '+path);
    return Response.json(result);
  }
  return {data,fetcher};
}
test('F numbering preserves legacy IDs and continues after gaps',()=>{assert.equal(nextFileId(legacy),'F003');assert.equal(nextFileId([{id:'F999'},{id:'A1002'}]),'F1000');});
test('metadata is bounded; HTML is escaped in generated fixed page',()=>{assert.deepEqual(normalizeSample({sampleNo:' S001 ',unknown:'x'}),{sampleNo:'S001'});assert.throws(()=>normalizeSample({model:{}}));assert.throws(()=>normalizeSample({description:'x'.repeat(3001)}));assert.match(viewerHtml('F003','<script>alert(1)</script>'),/&lt;script&gt;/);assert.throws(()=>viewerHtml('../bad'));});
test('scan URLs immediately open only the original image or PDF',()=>{for(const name of ['file.jpg','file1.pdf']){const html=viewerHtml('F003','样品','f/f003/'+name);assert.ok(html.includes(`content="0;url=./${name}"`));assert.ok(html.includes(`location.replace("./${name}")`));assert.ok(html.endsWith('<body></body></html>'));assert.doesNotMatch(html,/<iframe|stylesheet|<button|<main/);}});
test('direct file target preserves legacy primary files and rejects invalid paths',()=>{assert.equal(primaryAssetOf(legacy[0]),legacy[0].asset);assert.equal(primaryAssetOf({attachments:[{asset:'f/f003/file1.pdf'},{asset:'f/f003/file2.jpg'}]}),'f/f003/file1.pdf');for(const asset of ['f/f002/file.jpg','https://example.com/file.pdf','f/f003/../../file.pdf','f/f003/file.html'])assert.throws(()=>viewerHtml('F003','样品',asset));});
test('legacy attachments require no migration',()=>assert.equal(attachmentsOf(legacy[0])[0].asset,'f/f001/file.jpg'));
test('accept image/PDF and reject spoofed, excessive, malformed uploads',()=>{assert.equal(validateFiles([pdf,png]).length,2);assert.throws(()=>validateFiles([{...pdf,fileBase64:btoa('not-pdf')}]));assert.throws(()=>validateFiles(Array(9).fill(pdf)));assert.throws(()=>validateFiles([{...pdf,fileBase64:'X==='}]));assert.throws(()=>validateFiles([{...pdf,mime:'text/html'}]));});
test('normal large PDFs do not overflow the validator, size limits hold',()=>{const bytes=Buffer.alloc(7*1024*1024);bytes.write('%PDF-1.7');const large={...pdf,fileBase64:bytes.toString('base64')};assert.equal(validateFiles([large])[0].size,bytes.length);assert.throws(()=>validateFiles([large,large,large]),error=>error.status===413);});
test('new sample writes registry, attachments and viewer in one commit',async()=>{const mock=repoMock();const out=await saveSample({title:'样品',sample:{sampleNo:'S001'},files:[pdf,png]},{GITHUB_TOKEN:'test'},{fetcher:mock.fetcher});assert.equal(out.id,'F003');assert.equal(out.record.attachments.length,2);assert.equal(mock.data.commits.length,1);assert.deepEqual(mock.data.records.slice(0,2),legacy);assert.equal(mock.data.trees[0].tree.length,4);assert.equal(mock.data.calls.filter(x=>x.method==='PATCH').length,1);assert.ok(mock.data.calls.at(-1).body.force===false);assert.equal(out.record.sample.sampleNo,'S001');});
test('uploads continue after F003 and future production growth',async()=>{for(const count of [3,12]){const seed=Array.from({length:count},(_,i)=>({...legacy[0],id:'F'+String(i+1).padStart(3,'0'),path:'f/f'+String(i+1).padStart(3,'0')+'/'}));const mock=repoMock({seed});const out=await saveSample({title:'Next archive',files:[pdf]},{GITHUB_TOKEN:'test'},{fetcher:mock.fetcher});assert.equal(out.id,'F'+String(count+1).padStart(3,'0'));assert.deepEqual(mock.data.records.slice(0,count),seed);}});
test('editing keeps address and original assets, appends attachments and history',async()=>{const mock=repoMock();const out=await saveSample({id:'F001',expectedRevision:legacy[0].createdAt,title:'新名称',sample:{batch:'B01'},files:[pdf]},{GITHUB_TOKEN:'test'},{update:true,fetcher:mock.fetcher});assert.equal(out.record.path,legacy[0].path);assert.equal(out.record.asset,legacy[0].asset);assert.equal(out.record.attachments[0].asset,legacy[0].asset);assert.equal(out.record.attachments.length,2);assert.equal(out.record.history.length,2);assert.deepEqual(mock.data.records[1],legacy[1]);});
test('stale edit fails without modifying published branch',async()=>{const mock=repoMock();await assert.rejects(saveSample({id:'F001',expectedRevision:'outdated',title:'名称',files:[]},{GITHUB_TOKEN:'test'},{update:true,fetcher:mock.fetcher}),error=>error.status===409);assert.equal(mock.data.calls.filter(x=>x.method==='PATCH').length,0);});
test('concurrent create reloads registry and allocates next available number',async()=>{const mock=repoMock({conflict:true});const out=await saveSample({title:'样品',files:[pdf]},{GITHUB_TOKEN:'test'},{fetcher:mock.fetcher});assert.equal(out.id,'F004');assert.equal(mock.data.records.length,4);assert.equal(mock.data.commits.length,2);assert.equal(mock.data.commits[1].parents[0],'competing-head');});
test('health declares version 2; unauthorized upload/update cannot write',async()=>{const h=await worker.fetch(new Request('https://worker/health'),{});assert.equal((await h.json()).version,2);for(const endpoint of ['/upload','/update']){const r=await worker.fetch(new Request('https://worker'+endpoint,{method:'POST',body:'{}'}),{GITHUB_TOKEN:'test',ADMIN_PIN:'test-pin'});assert.equal(r.status,401);}});
test('invoice endpoint still dispatches original workflow',async()=>{const original=globalThis.fetch;let called;globalThis.fetch=async(url,options)=>{called={url,options};return new Response(null,{status:204});};try{const r=await worker.fetch(new Request('https://worker/create',{method:'POST',body:JSON.stringify({invoiceNo:'1234567890',amount:'123.45',date:'2026.11.02'})}),{GITHUB_TOKEN:'test'});assert.equal(r.status,202);assert.match(called.url,/create-invoice-record.yml/);assert.equal(JSON.parse(called.options.body).inputs.invoice_no,'1234567890');}finally{globalThis.fetch=original;}});

