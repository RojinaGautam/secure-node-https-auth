import { spawn } from 'node:child_process';
const children = [spawn(process.execPath, ['backend/server.js'], {stdio:'inherit'}), spawn(process.execPath, ['frontend/server.js'], {stdio:'inherit'})];
for (const child of children) child.on('exit', code => { if (code) process.exitCode = code; });
process.on('SIGINT', () => { for (const child of children) child.kill('SIGINT'); process.exit(); });
