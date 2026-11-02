import {readFile,writeFile,mkdir} from 'node:fs/promises';
const base=new URL('../',import.meta.url);
const core=await readFile(new URL('assets/sample-core.js',base),'utf8');
const sample=await readFile(new URL('cloudflare-worker/src/sample-upload.js',base),'utf8');
const entry=await readFile(new URL('cloudflare-worker/src/index.js',base),'utf8');
const strip=s=>s.replace(/^import .*?;\r?\n/gm,'').replace(/^export (?!default)/gm,'');
const output=strip(core)+'\n'+strip(sample)+'\n'+strip(entry);
await mkdir(new URL('work/',base),{recursive:true});await writeFile(new URL('work/worker-bundle.js',base),output);
console.log('Built standalone Cloudflare Worker, preserving existing secret names and invoice endpoint.');
