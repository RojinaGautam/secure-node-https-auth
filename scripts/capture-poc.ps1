param([string]$WiresharkDir='C:/Program Files/Wireshark')
$ErrorActionPreference='Stop'
Set-Location (Join-Path $PSScriptRoot '..')
$dumpcap=Join-Path $WiresharkDir 'dumpcap.exe'
$tshark=Join-Path $WiresharkDir 'tshark.exe'
if (!(Test-Path $dumpcap)) { throw 'Install official Wireshark with Npcap first.' }
$interfaces = & $dumpcap -D
$loop = $interfaces | Where-Object { $_ -match 'NPF_Loopback' } | Select-Object -First 1
if (!$loop) { throw 'Npcap loopback interface not available.' }
$interfaceNumber=($loop -split '\.')[0]
New-Item -ItemType Directory -Force output/evidence | Out-Null
Write-Host 'Close other local application sessions. Start npm start separately.'
Write-Host 'Capture lasts 45 seconds. In the browser, sign up, logout, and login with a unique test password.'
& $dumpcap -i $interfaceNumber -f 'tcp port 3443 or tcp port 4443' -a duration:45 -w output/evidence/auth-flow.pcapng
if ($LASTEXITCODE -ne 0) { throw 'Capture failed.' }
& $tshark -r output/evidence/auth-flow.pcapng -d tcp.port==3443,tls -d tcp.port==4443,tls -Y tls -T fields -e frame.number -e tcp.srcport -e tcp.dstport -e tls.handshake.type -e tls.record.content_type | Set-Content output/evidence/tls-packets.tsv
& $tshark -r output/evidence/auth-flow.pcapng -d tcp.port==3443,tls -d tcp.port==4443,tls -Y 'tls.handshake.type == 2' -V | Set-Content output/evidence/server-hello.txt
Write-Host 'Open auth-flow.pcapng in Wireshark. See README evidence checklist; no TLS key log should be enabled.'
