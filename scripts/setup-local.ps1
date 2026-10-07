$ErrorActionPreference = 'Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$openssl = 'C:/Program Files/Git/usr/bin/openssl.exe'
if (!(Test-Path $openssl)) { $openssl = (Get-Command openssl).Source }
if (Test-Path certs/localhost-key.pem) { throw 'Certificates already exist; refusing to overwrite.' }
New-Item -ItemType Directory -Force certs | Out-Null
& $openssl req -x509 -newkey rsa:3072 -nodes -keyout certs/local-ca-key.pem -out certs/local-ca.pem -days 365 -subj '/CN=Secure Auth Local Development CA' -addext 'basicConstraints=critical,CA:TRUE' -addext 'keyUsage=critical,keyCertSign,cRLSign' 2>$null
& $openssl req -new -newkey rsa:3072 -nodes -keyout certs/localhost-key.pem -out certs/localhost.csr -subj '/CN=localhost' 2>$null
@"
subjectAltName=DNS:localhost,IP:127.0.0.1,IP:::1
basicConstraints=critical,CA:FALSE
keyUsage=critical,digitalSignature,keyEncipherment
extendedKeyUsage=serverAuth
"@ | Set-Content certs/localhost.ext
& $openssl x509 -req -in certs/localhost.csr -CA certs/local-ca.pem -CAkey certs/local-ca-key.pem -CAcreateserial -out certs/localhost-cert.pem -days 90 -sha256 -extfile certs/localhost.ext 2>$null
if ($LASTEXITCODE -ne 0) { throw 'Certificate creation failed.' }
node scripts/setup-secrets.js
Write-Host 'Local certificates created. Node PoC explicitly trusts only local-ca.pem.'
Write-Host 'For browser trust, import certs/local-ca.pem into Current User Trusted Root Certification Authorities after reviewing it.'
