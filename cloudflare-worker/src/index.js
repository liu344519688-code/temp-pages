const ALLOWED_ORIGIN = 'https://liu344519688-code.github.io';
const OWNER = 'liu344519688-code';
const REPO = 'temp-pages';
const WORKFLOW = 'create-invoice-record.yml';

function cors(origin) {
  const allowed = origin === ALLOWED_ORIGIN ? origin : ALLOWED_ORIGIN;
  return {
    'Access-Control-Allow-Origin': allowed,
    'Access-Control-Allow-Methods': 'POST,OPTIONS,GET',
    'Access-Control-Allow-Headers': 'Content-Type',
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

export default {
  async fetch(request, env) {
    const origin = request.headers.get('Origin') || ALLOWED_ORIGIN;

    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const url = new URL(request.url);
    if (request.method === 'GET' && url.pathname === '/health') {
      return json({ ok: true, service: 'invoice-qr-dispatcher' }, 200, origin);
    }

    if (request.method !== 'POST' || url.pathname !== '/create') {
      return json({ ok: false, error: 'Not found' }, 404, origin);
    }

    if (!env.GITHUB_TOKEN) {
      return json({ ok: false, error: 'Server secret GITHUB_TOKEN is not configured.' }, 500, origin);
    }

    let body;
    try {
      body = await request.json();
    } catch {
      return json({ ok: false, error: 'Invalid JSON body.' }, 400, origin);
    }

    const invoiceNo = String(body.invoiceNo || '').trim();
    const amount = String(body.amount || '').trim().replace(/,/g, '');
    const invoiceDate = String(body.date || '').trim();

    if (!validInvoiceNo(invoiceNo)) {
      return json({ ok: false, error: '发票号码格式不正确。' }, 400, origin);
    }
    if (!validAmount(amount)) {
      return json({ ok: false, error: '金额格式不正确。' }, 400, origin);
    }
    if (!validDate(invoiceDate)) {
      return json({ ok: false, error: '日期格式不正确。' }, 400, origin);
    }

    const endpoint = `https://api.github.com/repos/${OWNER}/${REPO}/actions/workflows/${WORKFLOW}/dispatches`;
    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${env.GITHUB_TOKEN}`,
        'Accept': 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'invoice-qr-cloudflare-worker',
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        ref: 'main',
        inputs: {
          invoice_no: invoiceNo,
          amount,
          invoice_date: invoiceDate
        }
      })
    });

    if (!resp.ok) {
      const text = await resp.text();
      return json({
        ok: false,
        error: 'GitHub 自动生成任务启动失败。',
        detail: text.slice(0, 500)
      }, 502, origin);
    }

    return json({
      ok: true,
      accepted: true,
      message: '已提交正式生成任务，请稍候自动刷新历史记录。'
    }, 202, origin);
  }
};
