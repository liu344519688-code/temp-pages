import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {viewerHtml,primaryAssetOf,pdfViewerHtml} from '../assets/sample-core.js';
const records=JSON.parse(await readFile(new URL('../data/files.json',import.meta.url),'utf8'));
let previews={};
if(records.some(r=>/\.pdf$/i.test(primaryAssetOf(r)||''))){
  const python=process.env.PDF_PYTHON||(process.platform==='win32'?'python':'python3');
  const result=spawnSync(python,[fileURLToPath(new URL('./render-pdfs.py',import.meta.url))],{encoding:'utf8',maxBuffer:16*1024*1024});
  if(result.status!==0)throw new Error('PDF 页面转换失败：'+(result.stderr||result.error?.message||'unknown error'));
  previews=JSON.parse(result.stdout);
}
for(const r of records){if(!/^F\d+$/i.test(r.id)||r.path!==`f/${r.id.toLowerCase()}/`)throw new Error('不合法的资料路径');const dir=new URL('../'+r.path,import.meta.url);await mkdir(dir,{recursive:true});const asset=primaryAssetOf(r);if(!asset)throw new Error('缺少原文件');const html=/\.pdf$/i.test(asset)?pdfViewerHtml(r.id,previews[r.id]?.pages):viewerHtml(r.id,r.title,asset,r.revision||r.createdAt);await writeFile(new URL('index.html',dir),html);}
console.log(`Generated ${records.length} fixed record pages; registry and assets unchanged.`);
