// Vercel serverless auth gate for talkov-partition-visualizer
// Endpoints (all on the same function via ?action=...):
//   POST /api/auth?action=login    body: { password }
//   GET  /api/auth?action=verify
//   POST /api/auth?action=logout
//
// Required Vercel env vars:
//   SITE_PASSWORD     - the shared password (you pick it, never logged)
//   SESSION_SECRET    - random string for HMAC signing (32+ chars recommended)

const crypto = require('crypto');

const SESSION_HOURS = 8;
const COOKIE_NAME = 'acs_session';

function constantTimeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

function sign(payload, secret) {
  return crypto.createHmac('sha256', secret).update(payload).digest('hex');
}

function makeToken(secret) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const payload = String(exp);
  return `${payload}.${sign(payload, secret)}`;
}

function verifyToken(token, secret) {
  if (!token || typeof token !== 'string') return false;
  const parts = token.split('.');
  if (parts.length !== 2) return false;
  const [exp, sig] = parts;
  if (!/^\d+$/.test(exp)) return false;
  if (Date.now() > parseInt(exp, 10)) return false;
  return constantTimeEqual(sig, sign(exp, secret));
}

function getCookie(req, name) {
  const raw = req.headers && req.headers.cookie;
  if (!raw) return null;
  const found = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
  return found ? decodeURIComponent(found.slice(name.length + 1)) : null;
}

function setSessionCookie(res, token) {
  const maxAge = SESSION_HOURS * 3600;
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`
  );
}

function clearSessionCookie(res) {
  res.setHeader('Set-Cookie',
    `${COOKIE_NAME}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`
  );
}

async function readJsonBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') {
    try { return JSON.parse(req.body); } catch { return {}; }
  }
  return await new Promise((resolve) => {
    let data = '';
    req.on('data', (c) => { data += c; if (data.length > 16384) data = ''; });
    req.on('end', () => {
      try { resolve(JSON.parse(data || '{}')); } catch { resolve({}); }
    });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  const SECRET = process.env.SESSION_SECRET || '';
  const PASSWORD = process.env.SITE_PASSWORD || '';

  if (!SECRET || !PASSWORD) {
    res.status(500).json({
      error: 'Server not configured',
      hint: 'Set SITE_PASSWORD and SESSION_SECRET in Vercel project env vars',
    });
    return;
  }

  const action = (req.query && req.query.action) || 'verify';

  if (action === 'verify') {
    const token = getCookie(req, COOKIE_NAME);
    if (verifyToken(token, SECRET)) {
      res.status(200).json({ authenticated: true });
    } else {
      res.status(401).json({ authenticated: false });
    }
    return;
  }

  if (action === 'logout') {
    clearSessionCookie(res);
    res.status(200).json({ ok: true });
    return;
  }

  if (action === 'login') {
    if (req.method !== 'POST') {
      res.status(405).json({ error: 'POST required' });
      return;
    }
    await new Promise(r => setTimeout(r, 250));
    const body = await readJsonBody(req);
    const submitted = String(body.password || '');
    if (!submitted) {
      res.status(400).json({ error: 'Password required' });
      return;
    }
    if (!constantTimeEqual(submitted, PASSWORD)) {
      res.status(401).json({ error: 'Invalid password' });
      return;
    }
    const token = makeToken(SECRET);
    setSessionCookie(res, token);
    res.status(200).json({ ok: true });
    return;
  }

  res.status(400).json({ error: 'Unknown action' });
};
