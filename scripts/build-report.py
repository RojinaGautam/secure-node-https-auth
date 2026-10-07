from pathlib import Path
import json, textwrap
from reportlab.pdfgen import canvas
from reportlab.lib.colors import HexColor
from reportlab.lib.utils import ImageReader
from PIL import Image, ImageDraw, ImageFont
p=Path('.')
report=Path('output/pdf/security-report.pdf');report.parent.mkdir(parents=True,exist_ok=True)
r=json.loads(Path('output/evidence/poc-results.json').read_text());br=json.loads(Path('output/evidence/browser-results.json').read_text())
font=ImageFont.truetype('C:/Windows/Fonts/consola.ttf',20)
source=Path('backend/security.js').read_text().splitlines()
raw=Path('backend/security.js').read_text()
encryption=raw[raw.index('export function encryptEmail'):raw.index('export function decryptEmail')].strip()
hashing=raw[raw.index('export async function hashPassword'):raw.index('export async function verifyPassword')].strip()
lines=['IMPLEMENTATION EXCERPT | backend/security.js','AES email encryption / scrypt password hashing','']
for line in (encryption+'\n\n'+hashing).splitlines():
 lines.extend(textwrap.wrap(line,width=94,replace_whitespace=False,drop_whitespace=False) or [''])
im=Image.new('RGB',(1220,50+len(lines)*27),'#102338');d=ImageDraw.Draw(im)
for i,line in enumerate(lines): d.text((24,20+i*27),line,font=font,fill='#e4eef8')
im.save('output/evidence/implementation-excerpt.png')
W,H=595.28,841.89;c=canvas.Canvas(str(report),pagesize=(W,H));c.setTitle('Secure Node HTTPS Authentication - Implementation and Evidence');c.setAuthor('Security implementation report')
page=0;y=0
blue=HexColor('#17324f');muted=HexColor('#52677c')
def start(title,kicker):
 global page,y
 page+=1;c.setFillColor(blue);c.rect(0,H-110,W,110,fill=1,stroke=0)
 c.setFillColor(HexColor('#8ed8e6'));c.setFont('Helvetica-Bold',10);c.drawString(42,H-34,kicker.upper())
 c.setFillColor(HexColor('#ffffff'));c.setFont('Helvetica-Bold',22);c.drawString(42,H-70,title)
 y=H-140
 c.setFillColor(muted);c.setFont('Helvetica',8);c.drawString(42,28,'Secure Node authentication | 7 October 2026 | Local development assessment');c.drawRightString(W-42,28,str(page))
def para(text,size=11,space=10):
 global y
 c.setFillColor(blue);c.setFont('Helvetica',size)
 # wrap with actual font widths
 words=text.split();line=''
 for word in words:
  test=(line+' '+word).strip()
  if c.stringWidth(test,'Helvetica',size)>W-84:
   c.drawString(42,y,line);y-=size*1.45;line=word
  else:line=test
 if line:c.drawString(42,y,line);y-=size*1.45
 y-=space
 if y<45:raise RuntimeError('Page overflow')
def heading(text):
 global y
 c.setFillColor(blue);c.setFont('Helvetica-Bold',13);c.drawString(42,y,text);y-=23
def code(text,size=8.5):
 global y
 lines=text.splitlines();height=len(lines)*12+18
 c.setFillColor(HexColor('#eef3f8'));c.rect(42,y-height+8,W-84,height,fill=1,stroke=0)
 c.setFillColor(blue);c.setFont('Courier',size)
 for line in lines:c.drawString(52,y-7,line);y-=12
 y-=19
 if y<45:raise RuntimeError('Code overflow')
def pic(path,maxh):
 global y
 image=Image.open(path);w,h=image.size;scale=min((W-84)/w,maxh/h)
 c.drawImage(str(path),42,y-h*scale,width=w*scale,height=h*scale);y-=h*scale+15

def end():c.showPage()
start('HTTPS authentication security report','Implementation / verified local PoC')
para('A working Node.js frontend and backend now communicate exclusively over HTTPS. The application requires an email address at signup, stores it using authenticated AES encryption, and stores only a salted scrypt password hash.')
heading('Verified results')
para(f"All {len(r['checks'])} automated security checks passed. A separate Chrome browser run completed signup, logout, login, and authenticated profile retrieval with certificate checking enabled. TLS 1.3 negotiated TLS_AES_256_GCM_SHA384 on both services.")
heading('Scope and evidence status')
para('This report documents a local development implementation on Windows. The certificate is signed by a generated local CA trusted for this user with permission; it is not a publicly issued production certificate.')
para('Wireshark and Npcap were not installed during assessment. Windows pktmon reported Access is denied. Consequently, genuine Wireshark capture files, packet analysis and packet screenshots are PENDING. Browser and automated TLS evidence below do not substitute for that requirement.')
heading('Artifacts and reproduction')
code('npm start\n# Frontend: https://localhost:3443\n# Backend:  https://localhost:4443\n# Stop servers before testing:\nnpm test\n# After installing Wireshark + Npcap:\n./scripts/capture-poc.ps1')
para('Evidence: output/evidence/poc-results.json, browser-results.json, signup.png, login.png, implementation-excerpt.png. This PDF is an implementation report with the packet-capture section explicitly incomplete.',size=10)
end()
start('TLS configuration and verified PoC','Transport security')
heading('HTTPS-only listeners and certificate')
para('Both services use https.createServer, bind to 127.0.0.1, require TLS 1.2 or TLS 1.3 and allow explicit AEAD cipher suites. Neither runs an HTTP listener. Browser fetch calls target https://localhost:4443; the frontend CSP allows that HTTPS API endpoint.')
code("https.createServer({\n  key: tlsKey, cert: tlsCert,\n  minVersion: 'TLSv1.2', maxVersion: 'TLSv1.3',\n  ciphers: /* TLS 1.3 and ECDHE-RSA AES-GCM suites */\n}, handler)")
para('Certificate: RSA 3072-bit leaf, CN=localhost. SANs: localhost, 127.0.0.1 and ::1. Issuer: Secure Auth Local Development CA. Valid from 7 October 2026 to 5 January 2027 (UTC). OpenSSL chain and hostname verification returned OK.')
heading('Observed test results')
for check in r['checks']:
 if check.get('detail'):
  t=check['detail'];code(f"{check['name']}\nstatus: PASS; authorized: {t['authorized']}\nprotocol: {t['protocol']}\ncipher: {t['cipher']}")
para('The Node client supplies local-ca.pem as its CA and sets rejectUnauthorized=true. No certificate or hostname checks are disabled. Plain HTTP probes on ports 3443 and 4443 received no HTTP response.')
para('TLS encrypts HTTP bodies and authenticates the server. Capturers without session secrets should see encrypted records; IP addresses, ports, sizes, timing and some handshake metadata remain observable.',size=10)
end()
start('Signup over trusted HTTPS','Browser evidence / screenshot 1')
pic(Path('output/evidence/signup.png'),440)
para('Actual Chrome screenshot after a synthetic account signup. The page reports Signup successful and displays the authenticated email. Password inputs were cleared before capturing the screenshot. Certificate checks were enabled; no HTTPS interstitial was bypassed.',size=10)
heading('Validation and session controls')
para('Both HTML and backend require email input. Backend validation checks ASCII email syntax, local/domain structure and lengths; it rejects invalid addresses and passwords outside 12-128 characters. Syntax validation does not confirm mailbox ownership.')
para('A 256-bit random session token is sent in a __Host-sid cookie: Secure; HttpOnly; SameSite=Strict; Path=/; Max-Age=1800. POST requests require the exact allowed origin and JSON content type. API responses are not cached.',size=10)
end()
start('Login and authenticated profile','Browser evidence / screenshot 2')
pic(Path('output/evidence/login.png'),440)
para('Actual Chrome screenshot after logout, then login using the same synthetic account. Login successful and the authenticated email show that the complete browser flow worked. The API derives a lookup index, verifies the salted hash and issues a fresh session token.',size=10)
heading('Recorded browser network evidence')
for t in br['traffic']:
 if '/api/login' in t['url'] or '/api/signup' in t['url']:
  sec=t.get('security') or {};para(f"{t['url']} - HTTP status {t['status']}; browser security protocol {sec.get('protocol','see browser-results.json')}; issuer {sec.get('issuer','see evidence')}.",size=10)
para('Automated checks also rejected a wrong password, invalidated the old session on logout, confirmed profile access after login and verified token rotation. Browser network metadata is endpoint evidence, not a Wireshark packet capture.',size=10)
end()
start('Encrypted storage and implementation','At-rest security')
pic(Path('output/evidence/implementation-excerpt.png'),350)
para('Faithful rendered source excerpt from backend/security.js. AES-256-GCM uses a fresh 12-byte IV for every encryption and stores ciphertext, IV and a 16-byte tag. The tag makes modification detectable. Independent HMAC-SHA-256 indexing supports lookup without storing plaintext email.',size=10)
heading('Password and stored-record evidence')
u=r['storedSample'];code(f"emailEncrypted.ciphertext: {u['emailEncrypted']['ciphertext'][:44]}...\nemailEncrypted.iv: {u['emailEncrypted']['iv']}\nemailEncrypted.tag: {u['emailEncrypted']['tag']}\npasswordHash prefix: scrypt$131072$8$1$...\nplaintext email stored: NO\nplaintext password stored: NO")
para('scrypt uses N=131072, r=8, p=1 (about 128 MiB memory), a random 16-byte salt and 64-byte derived hash. Login compares hashes with timingSafeEqual; hashing is one-way and salts prevent identical-password hashes. A stored hash still permits offline guessing. AES email encryption is reversible only with the encryption key.',size=10)
para('Tests confirmed random ciphertext on repeated encryption, rejected a changed GCM tag, and found neither the test email nor password in the stored record. Encryption keys and TLS private keys are omitted from this report.',size=10)
end()
start('Wireshark packet evidence: pending','Required capture / reproducible procedure')
para('No genuine Wireshark packet capture or packet screenshots are available from this machine yet. This section provides the exact procedure for collecting the remaining evidence; it makes no claim that packet searches have been performed.')
heading('Capture the real signup and login traffic')
para('1. Install official Wireshark with Npcap loopback support. Start npm start. Clear SSLKEYLOGFILE and the Wireshark TLS secret-log setting; do not export session secrets for this capture.')
para('2. Run scripts/capture-poc.ps1. It selects NPF_Loopback, filters TCP ports 3443/4443 and captures for 45 seconds. During that interval, load the frontend, sign up with unique synthetic credentials, logout and login. Save auth-flow.pcapng.')
code('Capture filter: tcp port 3443 or tcp port 4443\nDisplay filter: tcp.port == 3443 || tcp.port == 4443\nHandshake: tls.handshake.type == 1 ||\n           tls.handshake.type == 2\nData: tls.record.content_type == 23')
heading('Required screenshots and packet analysis')
para('3. Screenshot ServerHello and expand supported_versions (0x0304 = TLS 1.3) and the selected cipher suite. A legacy record version of 0x0303 alone does not prove TLS 1.2. Decode the two ports as TLS if needed.')
para('4. Screenshot encrypted Application Data and packet bytes for the signup/login time interval. Record packet numbers and TCP streams. TLS 1.3 also carries encrypted handshake messages inside records with outer type 23; correlate timing and flow before labeling data.')
para('5. Find Packet > Packet bytes > String: search the exact password and email. Show the no-match result and search settings. Follow TCP Stream to show unreadable ciphertext. Stored AES ciphertext is not sent to the browser; a no-match for that value alone is not useful proof.')
para('6. Retain the original pcapng, SHA-256 hash, interface, time interval, test sequence, Wireshark version and screenshots. A no-match search alone is insufficient; combine verified handshake, complete capture and successful application flow.',size=10)
end()
start('Verification, limits and deployment','Operational configuration / references')
heading('Security checks completed')
para('; '.join(x['name'] for x in r['checks'])+'.',size=10)
heading('Deployment and key management')
para('For production, use a public CA certificate for the actual domain, a full certificate chain and automated renewal. Protect private keys and AES/index secrets outside source control. Replace the frontend API/CSP URLs and allowed origin together. Never disable certificate validation.')
para('Use Windows ACLs to restrict .env, key and data access; POSIX mode 0600 does not establish Windows ACLs. Preserve secure key backups and plan re-encryption for rotation. Use a transactional database and shared session/rate-limit storage for multiple instances. The JSON store and in-memory sessions are a single-process demo.')
para('Remaining limits: email ownership is not verified; duplicate signup responses can disclose account existence; there is no password recovery or MFA; process restart clears sessions. TLS protects traffic against observers without keys; compromised endpoints or exposed session secrets can reveal plaintext.')
heading('Evidence provenance')
para(f"Node {r['node']}; test run {r['runAt']}. Browser screenshots were generated from actual local Chrome interactions. Source excerpt was rendered directly from application code. Wireshark/Npcap were absent and no packet evidence was generated.",size=10)
heading('Primary references')
for text in ['Node.js Crypto: https://nodejs.org/api/crypto.html','Node.js TLS: https://nodejs.org/api/tls.html','Wireshark download: https://www.wireshark.org/download.html','Wireshark TLS analysis: https://wiki.wireshark.org/TLS','Wireshark Npcap: https://wiki.wireshark.org/NPcap/']:
 para(text,size=9,space=4)
end();c.save();print(f'Created {report}, {page} pages')
