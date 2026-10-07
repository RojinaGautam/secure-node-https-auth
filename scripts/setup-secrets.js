import fs from 'node:fs';
import crypto from 'node:crypto';
const old = fs.existsSync('.env') ? fs.readFileSync('.env','utf8') : fs.readFileSync('.env.example','utf8');
if (/^AES_KEY_HEX=[a-f0-9]{64}$/m.test(old)) throw new Error('Configured keys already exist; refusing rotation.');
fs.writeFileSync('.env',old.replace(/^AES_KEY_HEX=.*$/m,`AES_KEY_HEX=${crypto.randomBytes(32).toString('hex')}`).replace(/^EMAIL_INDEX_KEY_HEX=.*$/m,`EMAIL_INDEX_KEY_HEX=${crypto.randomBytes(32).toString('hex')}`),{mode:0o600});
console.log('Independent encryption and index keys generated; values not logged.');
