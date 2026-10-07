import crypto from 'node:crypto';

export function validateEmail(value) {
  if (typeof value !== 'string') return false;
  const email = value.trim();
  if (email.length > 254 || /[^\x21-\x7e]/.test(email)) return false;
  const parts = email.split('@');
  if (parts.length !== 2) return false;
  const [local, domain] = parts;
  return local.length > 0 && local.length <= 64 &&
    /^[a-zA-Z0-9.!#$%&'*+\/=?^_`{|}~-]+$/.test(local) &&
    !local.startsWith('.') && !local.endsWith('.') && !local.includes('..') &&
    domain.includes('.') && domain.split('.').every(label =>
      label.length > 0 && label.length <= 63 && /^[a-zA-Z0-9](?:[a-zA-Z0-9-]*[a-zA-Z0-9])?$/.test(label));
}

export function normalizeEmail(value) {
  return value.trim().toLowerCase();
}

export function encryptEmail(email, key) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(email, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    iv: iv.toString('base64'),
    ciphertext: ciphertext.toString('base64'),
    tag: tag.toString('base64')
  };
}

export function decryptEmail(record, key) {
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(record.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(record.tag, 'base64'));
  const plaintext = Buffer.concat([
    decipher.update(Buffer.from(record.ciphertext, 'base64')),
    decipher.final()
  ]);
  return plaintext.toString('utf8');
}

export function emailBlindIndex(email, indexKey) {
  return crypto.createHmac('sha256', indexKey).update(email, 'utf8').digest('hex');
}

export async function hashPassword(password) {
  const salt = crypto.randomBytes(16);
  const derived = await new Promise((resolve, reject) => {
    crypto.scrypt(password, salt, 64, { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 }, (err, key) => {
      if (err) reject(err); else resolve(key);
    });
  });
  return `scrypt$131072$8$1$${salt.toString('base64')}$${Buffer.from(derived).toString('base64')}`;
}

export async function verifyPassword(password, stored) {
  const [algo, n, r, p, saltB64, hashB64] = stored.split('$');
  if (algo !== 'scrypt') return false;
  const expected = Buffer.from(hashB64, 'base64');
  const actual = await new Promise((resolve, reject) => {
    crypto.scrypt(
      password,
      Buffer.from(saltB64, 'base64'),
      expected.length,
      { N: Number(n), r: Number(r), p: Number(p), maxmem: 256 * 1024 * 1024 },
      (err, key) => err ? reject(err) : resolve(key)
    );
  });
  return expected.length === actual.length && crypto.timingSafeEqual(expected, actual);
}

export function randomSessionToken() {
  return crypto.randomBytes(32).toString('base64url');
}

export function passwordIsAcceptable(value) {
  return typeof value === 'string' && value.length >= 12 && value.length <= 128;
}
