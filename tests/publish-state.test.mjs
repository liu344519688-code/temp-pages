import test from 'node:test';
import assert from 'node:assert/strict';
import {scanUrl,isPublished,waitForPublished} from '../assets/publish-state.js';
const base='https://example.test/temp-pages/';
const record={id:'F004',path:'f/f004/',asset:'f/f004/file1.jpg',revision:'saved-version'};
function fetchMock({records=[record],pageStatus=200,assetStatus=200}={}){
  const calls=[];
  return {calls,fetcher:async(url,options={})=>{const u=new URL(url);calls.push({url:u,options});return u.pathname.endsWith('files.json')?Response.json(records):new Response(null,{status:u.pathname.endsWith('.jpg')?assetStatus:pageStatus});}};
}
test('scan URL keeps the fixed path and bypasses a previous cached 404',()=>{const url=new URL(scanUrl(record,base));assert.equal(url.pathname,'/temp-pages/f/f004/');assert.equal(url.searchParams.get('v'),record.revision);});
test('PDF QR links request the compatible page image viewer',()=>{const url=new URL(scanUrl({...record,asset:'f/f004/file1.pdf'},base));assert.equal(url.searchParams.get('view'),'pages');assert.equal(url.pathname,'/temp-pages/f/f004/');});
test('a saved but unpublished record is not ready',async()=>{const m=fetchMock({records:[]});assert.equal(await isPublished(record,base,m),false);assert.equal(m.calls.length,1);});
test('a previous version of the same record is not ready',async()=>{const m=fetchMock({records:[{...record,revision:'older'}]});assert.equal(await isPublished(record,base,m),false);assert.equal(m.calls.length,1);});
test('both the page and original file must be available',async()=>{for(const status of [{pageStatus:404},{assetStatus:404}]){const m=fetchMock(status);assert.equal(await isPublished(record,base,m),false);}});
test('readiness probes avoid downloading large files and cached 404 responses',async()=>{const m=fetchMock();assert.equal(await isPublished(record,base,m),true);assert.equal(m.calls.length,3);for(const call of m.calls.slice(1)){assert.equal(call.options.method,'HEAD');assert.ok(call.url.searchParams.has('ready'));assert.equal(call.options.cache,'no-store');}});
test('publication polling waits for the file before permitting a QR',async()=>{let pass=0,sleeps=0;const fetcher=async(url)=>{const path=new URL(url).pathname;if(path.endsWith('files.json')){pass++;return Response.json(pass===1?[]:[record]);}return new Response(null,{status:path.endsWith('.jpg')&&pass===2?404:200});};assert.equal(await waitForPublished(record,base,{fetcher,attempts:3,sleep:async()=>{sleeps++;}}),true);assert.equal(pass,3);assert.equal(sleeps,2);});
test('publication timeout does not report a failed upload or create another record',async()=>{const m=fetchMock({records:[]});assert.equal(await waitForPublished(record,base,{...m,attempts:2,sleep:async()=>{}}),false);assert.equal(m.calls.length,2);assert.ok(m.calls.every(c=>!c.options.method));});
test('temporary connectivity errors keep the QR unavailable',async()=>{assert.equal(await isPublished(record,base,{fetcher:async()=>{throw new Error('network');}}),false);});
