import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {viewerHtml,primaryAssetOf} from '../assets/sample-core.js';
const records=JSON.parse(await readFile(new URL('../data/files.json',import.meta.url),'utf8'));
for(const r of records){if(!/^F\d+$/i.test(r.id)||r.path!==`f/${r.id.toLowerCase()}/`)throw new Error('不合法的资料路径');const dir=new URL('../'+r.path,import.meta.url);await mkdir(dir,{recursive:true});const asset=primaryAssetOf(r);if(!asset)throw new Error('缺少原文件');await writeFile(new URL('index.html',dir),viewerHtml(r.id,r.title,asset));}
console.log(`Generated ${records.length} fixed record pages; registry and assets unchanged.`);
