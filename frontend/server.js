import https from 'node:https';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

function loadEnvFile() {
  try {
    const text = fs.readFileSync('.env', 'utf8');
    for (const line of text.split(/\r?\n/)) {
      const t = line.trim(); if (!t || t.startsWith('#')) continue;
      const i = t.indexOf('='); if (i < 0) continue;
      const k = t.slice(0, i).trim(), v = t.slice(i + 1).trim();
      if (!process.env[k]) process.env[k] = v;
    }
  } catch {}
}
loadEnvFile();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(__dirname, 'public');
const PORT = Number(process.env.FRONTEND_PORT || 3443);
const key = fs.readFileSync(process.env.TLS_KEY_PATH || './certs/localhost-key.pem');
const cert = fs.readFileSync(process.env.TLS_CERT_PATH || './certs/localhost-cert.pem');

const types = { '.html':'text/html; charset=utf-8', '.css':'text/css; charset=utf-8', '.js':'text/javascript; charset=utf-8' };
const server = https.createServer({ key, cert, ciphers:'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES256-GCM-SHA384:ECDHE-RSA-AES128-GCM-SHA256', minVersion:'TLSv1.2', maxVersion:'TLSv1.3' }, (req, res) => {
  const pathname = new URL(req.url, 'https://localhost').pathname;
  const rel = pathname === '/' ? 'index.html' : pathname.replace(/^\//, '');
  const file = path.normalize(path.join(publicDir, rel));
  if (!file.startsWith(publicDir + path.sep)) { res.statusCode=403; return res.end('Forbidden'); }
  fs.readFile(file, (err, data) => {
    if (err) { res.statusCode=404; return res.end('Not found'); }
    res.setHeader('Content-Type', types[path.extname(file)] || 'application/octet-stream');
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    res.setHeader('Referrer-Policy', 'no-referrer');
    res.setHeader('Content-Security-Policy', "default-src 'self'; connect-src 'self' https://localhost:4443; style-src 'self'; script-src 'self'; base-uri 'none'; form-action 'self'; frame-ancestors 'none'");
    res.end(data);
  });
});
server.listen(PORT, process.env.BIND_HOST || '127.0.0.1', () => console.log(`Frontend HTTPS: https://localhost:${PORT}`));
