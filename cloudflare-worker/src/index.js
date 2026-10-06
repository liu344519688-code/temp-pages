const ALLOWED_ORIGIN = 'https://liu344519688-code.github.io';
const OWNER = 'liu344519688-code';
const REPO = 'temp-pages';
const WORKFLOW = 'create-invoice-record.yml';
const BRANCH = 'main';

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST,OPTIONS,GET',
    'Access-Control-Allow-Headers': 'Content-Type,X-Admin-Pin',
    'Access-Control-Max-Age': '86400',
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  };
}

function json(data, status = 200, origin = ALLOWED_ORIGIN) {
  return new Response(JSON.stringify(data), { status, headers: cors(origin) });
}

function validInvoiceNo(v) {
  return typeof v === 'string' && /^\d{6,30}$/.test(v.trim());
}

function validAmount(v) {
  return typeof v === 'string' && /^\d+(?:\.\d{1,2})?$/.test(v.trim().replace(/,/g, ''));
}

function validDate(v) {
  return typeof v === 'string' && /^\d{4}[.\/-]\d{1,2}[.\/-]\d{1,2}$/.test(v.trim());
}

function ghHeaders(env) {
  return {
    'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
    'Accept': 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
    'User-Agent': 'invoice-file-qr-cloudflare-worker',
    'Content-Type': 'application/json'
  };
}

function bytesToBase64(bytes) {
  let out = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    out += String.fromCharCode(...bytes.subarray(i, Math.min(i + chunk, bytes.length)));
  }
  return btoa(out);
}

function utf8ToBase64(text) {
  return bytesToBase64(new TextEncoder().encode(text));
}

function base64ToUtf8(b64) {
  const bin = atob(String(b64 || '').replace(/\s+/g, ''));
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new TextDecoder().decode(bytes);
}

function escapeHtml(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'
  }[c]));
}

async function ghGetContent(path, env) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}?ref=${BRANCH}`;
  const r = await fetch(url, { headers: ghHeaders(env) });
  if (!r.ok) return null;
  return await r.json();
}

async function ghPutContent(path, contentBase64, message, env, sha) {
  const url = `https://api.github.com/repos/${OWNER}/${REPO}/contents/${path}`;
  const body = { message, content: contentBase64, branch: BRANCH };
  if (sha) body.sha = sha;
  const r = await fetch(url, { method: 'PUT', headers: ghHeaders(env), body: JSON.stringify(body) });
  if (!r.ok) {
    const text = await r.text();
    throw new Error(`GitHub 写入失败 ${r.status}: ${text.slice(0, 220)}`);
  }
  return await r.json();
}

function buildViewerHtml({ title, kind, assetName, originalName }) {
  const safeTitle = escapeHtml(title);
  const safeOriginal = escapeHtml(originalName);
  const viewer = kind === 'pdf'
    ? `<iframe class="pdf" src="./${assetName}#view=FitH" title="${safeTitle}"></iframe>`
    : `<img class="image" src="./${assetName}" alt="${safeTitle}">`;
  return `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>${safeTitle}</title><style>
*{box-sizing:border-box}html,body{margin:0;background:#f5f6f8;color:#111;font-family:-apple-system,BlinkMacSystemFont,"PingFang SC","Microsoft YaHei",Arial,sans-serif}.wrap{max-width:1100px;margin:auto;padding:18px}.bar{background:#fff;border:1px solid #e8e8e8;border-radius:16px;padding:16px 18px;margin-bottom:14px;display:flex;justify-content:space-between;gap:12px;align-items:center}.title{font-size:20px;font-weight:800}.meta{color:#888;font-size:13px;margin-top:5px}.download{background:#111;color:#fff;text-decoration:none;border-radius:10px;padding:10px 14px;font-weight:700;white-space:nowrap}.viewer{background:#fff;border:1px solid #e8e8e8;border-radius:16px;overflow:hidden;min-height:70vh;display:flex;align-items:center;justify-content:center}.image{display:block;max-width:100%;height:auto;margin:auto}.pdf{width:100%;height:82vh;border:0;background:#fff}@media(max-width:640px){.wrap{padding:10px}.bar{align-items:flex-start}.title{font-size:18px}.pdf{height:78vh}}
</style></head><body><div class="wrap"><div class="bar"><div><div class="title">${safeTitle}</div><div class="meta">${safeOriginal}</div></div><a class="download" href="./${assetName}" download>下载原文件</a></div><div class="viewer">${viewer}</div></div></body></html>`;
}

async function handleInvoice(request, env, origin) {
  let body;
  try { body = await request.json(); }
  catch { return json({ ok:false, error:'Invalid JSON body.' }, 400, origin); }

  const invoiceNo = String(body.invoiceNo || '').trim();
  const amount = String(body.amount || '').trim().replace(/,/g, '');
  const invoiceDate = String(body.date || '').trim();
  if (!validInvoiceNo(invoiceNo)) return json({ ok:false, error:'发票号码格式不正确。' }, 400, origin);
  if (!validAmount(amount)) return json({ ok:false, error:'金额格式不正确。' }, 400, origin);
  if (!validDate(invoiceDate)) return json({ ok:false, error:'日期格式不正确。' }, 400, origin);

  const endpoint = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
  const resp = await fetch(endpoint, {
    method:'POST', headers:ghHeaders(env),
    body:JSON.stringify({ ref:BRANCH, inputs:{ invoice_no:invoiceNo, amount, invoice_date:invoiceDate } })
  });
  if (!resp.ok) {
    const text = await resp.text();
    return json({ ok:false, error:'GitHub 自动生成任务启动失败。', detail:text.slice(0,500) }, 502, origin);
  }
  return json({ ok:true, accepted:true, message:'已提交正式生成任务，请稍候自动刷新历史记录。' }, 202, origin);
}

async function handleUpload(request, env, origin) {
  if (!env.ADMIN_PIN) return json({ ok:false, error:'Server secret ADMIN_PIN is not configured.' }, 500, origin);
  const pin = request.headers.get('X-Admin-Pin') || '';
  if (pin !== env.ADMIN_PIN) return json({ ok:false, error:'上传密码不正确。' }, 401, origin);

  let body;
  try { body = await request.json(); }
  catch { return json({ ok:false, error:'上传数据格式不正确。' }, 400, origin); }

  const title = String(body.title || '').trim();
  const originalName = String(body.originalName || '').trim();
  const mime = String(body.mime || '').trim().toLowerCase();
  const fileBase64 = String(body.fileBase64 || '').replace(/\s+/g, '');
  if (!title || title.length > 120) return json({ ok:false, error:'资料名称不能为空，且不能超过 120 个字符。' }, 400, origin);
  if (!originalName) return json({ ok:false, error:'缺少文件名。' }, 400, origin);

  const types = {
    'image/jpeg': { ext:'jpg', kind:'image' },
    'image/png': { ext:'png', kind:'image' },
    'image/webp': { ext:'webp', kind:'image' },
    'application/pdf': { ext:'pdf', kind:'pdf' }
  };
  const t = types[mime];
  if (!t) return json({ ok:false, error:'只支持 JPG、PNG、WEBP 和 PDF。' }, 400, origin);
  if (!/^[A-Za-z0-9+/=]+$/.test(fileBase64)) return json({ ok:false, error:'文件编码不正确。' }, 400, origin);
  const approxBytes = Math.floor(fileBase64.length * 3 / 4);
  if (approxBytes > 8 * 1024 * 1024) return json({ ok:false, error:'文件超过 8 MB。' }, 413, origin);

  const registry = await ghGetContent('data/files.json', env);
  if (!registry) return json({ ok:false, error:'无法读取资料历史记录。请确认 GitHub Token 的 Contents 权限。' }, 502, origin);

  let records = [];
  try { records = JSON.parse(base64ToUtf8(registry.content)); }
  catch { return json({ ok:false, error:'资料历史记录格式损坏。' }, 500, origin); }

  let max = 0;
  for (const r of records) {
    const m = /^F(\d+)$/i.exec(String(r.id || ''));
    if (m) max = Math.max(max, Number(m[1]));
  }
  const id = `F${String(max + 1).padStart(3, '0')}`;
  const slug = id.toLowerCase();
  const assetName = `file.${t.ext}`;
  const assetPath = `f/${slug}/${assetName}`;
  const pagePath = `f/${slug}/index.html`;
  const pageUrl = `https://liu344519688-code.github.io/temp-pages/f/${slug}/`;
  const assetUrl = `https://liu344519688-code.github.io/temp-pages/${assetPath}`;
  const viewerHtml = buildViewerHtml({ title, kind:t.kind, assetName, originalName });

  try {
    await ghPutContent(assetPath, fileBase64, `Add ${id} source file`, env);
    await ghPutContent(pagePath, utf8ToBase64(viewerHtml), `Add ${id} viewer page`, env);

    records.push({
      id, title, kind:t.kind, mime, originalName,
      path:`f/${slug}/`, asset:assetPath,
      createdAt:new Date().toISOString().slice(0,10)
    });
    await ghPutContent('data/files.json', utf8ToBase64(JSON.stringify(records, null, 2) + '\n'), `Register ${id} file record`, env, registry.sha);
  } catch (e) {
    return json({ ok:false, error:String(e.message || e) }, 502, origin);
  }

  return json({ ok:true, id, pageUrl, assetUrl, message:`${id} 上传成功。` }, 201, origin);
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ALLOWED_ORIGIN;
    if (request.method === 'OPTIONS') return new Response(null, { status:204, headers:cors(origin) });
    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok:true, service:'invoice-file-qr-dispatcher', uploadConfigured:Boolean(env.ADMIN_PIN) }, 200, origin);
    }
    if (!env.GITHUB_TOKEN) return json({ ok:false, error:'Server secret GITHUB_TOKEN is not configured.' }, 500, origin);
    if (request.method === 'POST' && url.pathname === '/create') return handleInvoice(request, env, origin);
    if (request.method === 'POST' && url.pathname === '/upload') return handleUpload(request, env, origin);
    return json({ ok:false, error:'Not found' }, 404, origin);
  }
};
