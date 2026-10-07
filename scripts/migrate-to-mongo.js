import fs from 'node:fs';
import {loadEnvFile} from '../backend/config.js';
import {initializeStore,createUser,findUserByEmailIndex,closeStore} from '../backend/store.js';
loadEnvFile();
try {
  await initializeStore();
  const file = process.argv[2] || 'data/users.json';
  if (!fs.existsSync(file)) { console.log('No legacy file to import.'); }
  else {
    const records=JSON.parse(fs.readFileSync(file,'utf8'));
    if (!Array.isArray(records)) throw new Error('Legacy data must be an array.');
    let imported=0,skipped=0;
    for (const user of records) {
      if (!user.id || !/^[a-f0-9]{64}$/.test(user.emailIndex || '') || !user.emailEncrypted?.ciphertext || !user.emailEncrypted?.iv || !user.emailEncrypted?.tag || !user.passwordHash?.startsWith('scrypt$')) throw new Error('Invalid legacy encrypted account record.');
      if (await findUserByEmailIndex(user.emailIndex)) { skipped++; continue; }
      const safe={id:user.id,emailIndex:user.emailIndex,emailEncrypted:user.emailEncrypted,passwordHash:user.passwordHash,createdAt:user.createdAt,...(user.fullNameEncrypted?{fullNameEncrypted:user.fullNameEncrypted}:{})};
      if (await createUser(safe)) imported++; else skipped++;
    }
    console.log(`Migration complete: ${imported} imported, ${skipped} existing accounts skipped. Legacy file preserved.`);
  }
}finally{await closeStore();}
