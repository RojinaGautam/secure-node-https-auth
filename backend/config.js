import fs from 'node:fs';
export function loadEnvFile() {
  try {
    for (const line of fs.readFileSync('.env','utf8').split(/\r?\n/)) {
      const text = line.trim(); if (!text || text.startsWith('#')) continue;
      const split = text.indexOf('='); if (split < 0) continue;
      const key = text.slice(0,split).trim();
      if (process.env[key] === undefined) process.env[key] = text.slice(split+1).trim();
    }
  } catch (error) { if (error.code !== 'ENOENT') throw error; }
}
