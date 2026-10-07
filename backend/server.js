import https from 'node:https';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { URL } from 'node:url';
import {
  validateEmail, normalizeEmail, encryptEmail, decryptEmail, emailBlindIndex,
  hashPassword, verifyPassword, randomSessionToken, passwordIsAcceptable
} from './security.js';
import { initializeStore, closeStore, findUserByEmailIndex, findUserById, createUser } from './store.js';
import { loadEnvFile } from './config.js';

loadEnvFile();
await initializeStore();

const PORT = Number(process.env.BACKEND_PORT || 4443);
const ORIGIN = process.env.FRONTEND_ORIGIN || 'https://localhost:3443';
const tlsKey = fs.readFileSync(process.env.TLS_KEY_PATH || './certs/localhost-key.pem');
const tlsCert = fs.readFileSync(process.env.TLS_CERT_PATH || './certs/localhost-cert.pem');
const aesKey = Buffer.from(process.env.AES_KEY_HEX || '', 'hex');
const indexKey = Buffer.from(process.env.EMAIL_INDEX_KEY_HEX || '', 'hex');
if (!/^[a-fA-F0-9]{64}$/.test(process.env.AES_KEY_HEX || '') || !/^[a-fA-F0-9]{64}$/.test(process.env.EMAIL_INDEX_KEY_HEX || '') || aesKey.equals(indexKey)) {
  throw new Error('AES_KEY_HEX and EMAIL_INDEX_KEY_HEX must each be 32-byte (64 hex char) keys.');
}

if (new URL(ORIGIN).protocol !== 'https:') throw new Error('FRONTEND_ORIGIN must use HTTPS.');
const dummyHash = await hashPassword(crypto.randomBytes(32).toString('hex'));
const attempts = new Map();
const sessions = new Map();
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of attempts) if (value.expires <= now) attempts.delete(key);
  for (const [key, value] of sessions) if (value.expires <= now) sessions.delete(key);
}, 60000).unref();
const SESSION_TTL_MS = 30 * 60 * 1000;

function securityHeaders(res) {
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'no-referrer');
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Security-Policy', "default-src 'none'; frame-ancestors 'none'");
}

function cors(req, res) {
  const origin = req.headers.origin;
  if (origin === ORIGIN) {
    res.setHeader('Access-Control-Allow-Origin', ORIGIN);
    res.setHeader('Vary', 'Origin');
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    res.setHeader('Access-Control-Allow-Methods', 'POST,GET,OPTIONS');
  }
}

function json(res, status, payload) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.end(JSON.stringify(payload));
}

async function readJson(req, limit = 16 * 1024) {
  let size = 0, body = '';
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw new Error('Payload too large');
    body += chunk;
  }
  const parsed = JSON.parse(body || '{}');
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new SyntaxError('Object required');
  return parsed;
}

function cookieValue(req, name) {
  const raw = req.headers.cookie || '';
  for (const part of raw.split(';')) {
    const [k, ...rest] = part.trim().split('=');
    if (k === name) return rest.join('=');
  }
  return null;
}

function issueSession(req, res, userId) {
  const previous = cookieValue(req, '__Host-sid');
  if (previous) sessions.delete(previous);
  const token = randomSessionToken();
  sessions.set(token, { userId, expires: Date.now() + SESSION_TTL_MS });
  res.setHeader('Set-Cookie', `__Host-sid=${encodeURIComponent(token)}; Max-Age=1800; Path=/; Secure; HttpOnly; SameSite=Strict`);
}

function getSession(req) {
  const token = cookieValue(req, '__Host-sid');
  if (!token) return null;
  const s = sessions.get(token);
  if (!s || s.expires < Date.now()) { sessions.delete(token); return null; }
  return s;
}

const server = https.createServer({
  key: tlsKey,
  cert: tlsCert,
  ciphers: 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256',
  minVersion: 'TLSv1.2',
  maxVersion: 'TLSv1.3'
}, async (req, res) => {
  securityHeaders(res); cors(req, res);
  if (req.method === 'OPTIONS') { res.statusCode = 204; return res.end(); }
  const url = new URL(req.url, 'https://localhost');
  if (req.method === 'POST') {
    if (req.headers.origin !== ORIGIN) return json(res, 403, {error:'Untrusted origin.'});
    if (!/^application\/json(?:;|$)/i.test(req.headers['content-type'] || '')) return json(res, 415, {error:'JSON required.'});
    const ip = req.socket.remoteAddress;
    const item = attempts.get(ip) || {count:0, expires:Date.now()+60000};
    if (item.expires <= Date.now()) { item.count=0; item.expires=Date.now()+60000; }
    item.count++; attempts.set(ip, item);
    if (item.count > 20) { res.setHeader('Retry-After','60'); return json(res,429,{error:'Try again later.'}); }
  }

  try {
    if (req.method === 'POST' && url.pathname === '/api/signup') {
      const { email, password, fullName } = await readJson(req);
      if (!validateEmail(email)) return json(res, 400, { error: 'A valid email address is required.' });
      if (!passwordIsAcceptable(password)) return json(res, 400, { error: 'Password must be 12-128 characters.' });

      if (fullName !== undefined && (typeof fullName !== 'string' || fullName.trim().length < 2 || fullName.trim().length > 100 || /[\x00-\x1f\x7f]/.test(fullName))) return json(res, 400, {error:'Full name must be 2-100 characters.'});
      const normalized = normalizeEmail(email);
      const emailIndex = emailBlindIndex(normalized, indexKey);

      const user = {
        id: crypto.randomUUID(),
        emailIndex,
        emailEncrypted: encryptEmail(normalized, aesKey),
        ...(fullName !== undefined ? {fullNameEncrypted: encryptEmail(fullName.trim(), aesKey)} : {}),
        passwordHash: await hashPassword(password),
        createdAt: new Date().toISOString()
      };
      const created = await createUser(user);
      if (!created) return json(res, 409, {error:'Account already exists.'});
      issueSession(req, res, user.id);
      return json(res, 201, { message: 'Signup successful.', user: { email: normalized } });
    }

    if (req.method === 'POST' && url.pathname === '/api/login') {
      const { email, password } = await readJson(req);
      if (!validateEmail(email) || !passwordIsAcceptable(password)) return json(res, 401, { error: 'Invalid credentials.' });
      const normalized = normalizeEmail(email);
      const idx = emailBlindIndex(normalized, indexKey);
      const user = await findUserByEmailIndex(idx);
      if (!(await verifyPassword(password, user?.passwordHash || dummyHash)) || !user) return json(res, 401, { error: 'Invalid credentials.' });
      issueSession(req, res, user.id);
      return json(res, 200, { message: 'Login successful.' });
    }

    if (req.method === 'GET' && url.pathname === '/api/me') {
      const session = getSession(req);
      if (!session) return json(res, 401, { error: 'Not authenticated.' });
      const user = await findUserById(session.userId);
      if (!user) return json(res, 401, { error: 'Not authenticated.' });
      return json(res, 200, { email: decryptEmail(user.emailEncrypted, aesKey), fullName: user.fullNameEncrypted ? decryptEmail(user.fullNameEncrypted, aesKey) : null });
    }

    if (req.method === 'POST' && url.pathname === '/api/logout') {
      const token = cookieValue(req, '__Host-sid'); if (token) sessions.delete(token);
      res.setHeader('Set-Cookie', '__Host-sid=; Max-Age=0; Path=/; Secure; HttpOnly; SameSite=Strict');
      return json(res, 200, { message: 'Logged out.' });
    }

    return json(res, 404, { error: 'Not found.' });
  } catch (err) {
    if (err instanceof SyntaxError) return json(res,400,{error:'Malformed JSON.'});
    if (err.message === 'Payload too large') return json(res,413,{error:'Payload too large.'});
    console.error('Request failed:', err.name);
    return json(res, 500, { error: 'Internal server error.' });
  }
});

server.listen(PORT, process.env.BIND_HOST || '127.0.0.1', () => {
  console.log(`Backend HTTPS API: https://localhost:${PORT}`);
});

async function shutdown() {
  server.close();
  await closeStore();
  process.exit(0);
}
process.once('SIGINT', shutdown);
process.once('SIGTERM', shutdown);
