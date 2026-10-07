import fs from 'node:fs';
import https from 'node:https';
import net from 'node:net';
import {MongoClient} from 'mongodb';
import {loadEnvFile} from './config.js';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {spawn} from 'node:child_process';
import {setTimeout as delay} from 'node:timers/promises';
import {encryptEmail,decryptEmail,verifyPassword} from './security.js';
loadEnvFile();
const testDbName = 'secure_auth_poc_' + crypto.randomUUID().replaceAll('-','');
const mongo = new MongoClient(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017');
fs.mkdirSync('output/evidence',{recursive:true});
const checks=[],agent=new https.Agent({ca:fs.readFileSync('certs/local-ca.pem'),rejectUnauthorized:true});
const children=['backend/server.js','frontend/server.js'].map(file=>spawn(process.execPath,[file],{stdio:['ignore','pipe','pipe'],env:{...process.env,MONGODB_DB:testDbName}}));
for(const c of children)c.stderr.on('data',d=>process.stderr.write(d));
function req(port,path,method='GET',body=null,cookie='',origin='https://localhost:3443'){
 return new Promise((resolve,reject)=>{const q=https.request({hostname:'localhost',port,path,method,agent,headers:{Origin:origin,'Content-Type':'application/json',Cookie:cookie}},r=>{const tls={protocol:r.socket.getProtocol(),cipher:r.socket.getCipher().name,authorized:r.socket.authorized,subject:r.socket.getPeerCertificate().subject,validTo:r.socket.getPeerCertificate().valid_to};let b='';r.on('data',d=>b+=d);r.on('end',()=>resolve({status:r.statusCode,headers:r.headers,body:b,tls}));});q.on('error',reject);if(body)q.write(typeof body==='string'?body:JSON.stringify(body));q.end();});
}
function check(name,pass,detail){assert.ok(pass,name);checks.push({name,passed:true,detail});}
try{
 for(let i=0;i<40;i++){try{await req(4443,'/api/me');await req(3443,'/');break;}catch{await delay(200);}}
 const front=await req(3443,'/');check('Frontend certificate chain and hostname verified',front.status===200&&front.tls.authorized,front.tls);
 const email=`poc.${Date.now()}@example.com`,password='PoC-Secret-Password!2026';
 check('Invalid email rejected',(await req(4443,'/api/signup','POST',{email:'bad..email@example.com',password})).status===400);
 check('Short password rejected',(await req(4443,'/api/signup','POST',{email,password:'short'})).status===400);
 check('Untrusted origin rejected',(await req(4443,'/api/signup','POST',{email,password},'','https://evil.example')).status===403);
 check('Malformed JSON rejected',(await req(4443,'/api/signup','POST','{')).status===400);
 const signup=await req(4443,'/api/signup','POST',{email,password});check('Signup over verified TLS',signup.status===201&&signup.tls.authorized,signup.tls);
 const cookie=signup.headers['set-cookie'][0].split(';')[0];check('Secure HttpOnly SameSite host cookie',/__Host-sid=/.test(cookie)&&/Secure; HttpOnly; SameSite=Strict/.test(signup.headers['set-cookie'][0]));
 const me=await req(4443,'/api/me','GET',null,cookie);check('Authenticated session returns decrypted email',me.status===200&&JSON.parse(me.body).email===email);
 check('Duplicate signup rejected',(await req(4443,'/api/signup','POST',{email,password})).status===409);
 check('Wrong password rejected',(await req(4443,'/api/login','POST',{email,password:'Incorrect-Password!2026'})).status===401);
 await req(4443,'/api/logout','POST',{},cookie);check('Logout invalidates session',(await req(4443,'/api/me','GET',null,cookie)).status===401);
 const login=await req(4443,'/api/login','POST',{email,password});check('Login over verified TLS',login.status===200&&login.tls.authorized,login.tls);
 const next=login.headers['set-cookie'][0].split(';')[0];check('Login rotates token',next!==cookie);check('Login session works',(await req(4443,'/api/me','GET',null,next)).status===200);
 await mongo.connect();
 const records = await mongo.db(testDbName).collection('users').find({},{projection:{_id:0}}).toArray();
 const raw=JSON.stringify(records),user=records.at(-1);check('No plaintext email or password stored',!raw.includes(email)&&!raw.includes(password));check('Stored scrypt hash verifies',await verifyPassword(password,user.passwordHash));
 const key=crypto.randomBytes(32),enc=encryptEmail(email,key);check('Random IV changes ciphertext',enc.ciphertext!==encryptEmail(email,key).ciphertext);enc.tag=Buffer.alloc(16).toString('base64');let tamper=false;try{decryptEmail(enc,key)}catch{tamper=true}check('AES-GCM tampering rejected',tamper);
 for(const port of [3443,4443]){const reply=await new Promise(resolve=>{const s=net.connect(port,'127.0.0.1',()=>s.write('GET / HTTP/1.1\r\nHost: localhost\r\n\r\n'));let b='';s.on('data',d=>b+=d);s.on('close',()=>resolve(b));s.on('error',()=>resolve(b));s.setTimeout(2000,()=>s.destroy());});check(`Plain HTTP rejected on ${port}`,!reply.startsWith('HTTP/'));}
 fs.writeFileSync('output/evidence/poc-results.json',JSON.stringify({runAt:new Date().toISOString(),node:process.version,checks,storedSample:user,captureStatus:'Wireshark and Npcap unavailable. Packet capture pending.'},null,2));
 console.log(JSON.stringify({passed:checks.length,checks},null,2));
}finally{agent.destroy();for(const c of children)c.kill();
 try { await mongo.db(testDbName).dropDatabase(); } finally { await mongo.close(); }
}
