# Secure Node.js HTTPS authentication demo

## Run the configured local application

Node 20+ is required. Run npm install for the official MongoDB driver. A running MongoDB instance is required.

```powershell
cd secure-node-auth-demo-clean
npm start
```

Open https://localhost:3443. The HTTPS API is https://localhost:4443.
Both listeners bind to 127.0.0.1 by default; neither starts an HTTP listener.
Use Create account to open the signup view (#signup), or Login to open the login view (#login). Signup requires full name, email, password and matching password confirmation. Full name is encrypted with AES-256-GCM; older accounts without a name remain supported. After signup/login, the account view displays your profile with Refresh account and Logout controls.

This workspace has generated independent random AES/index keys in .env and a local
CA-signed RSA 3072-bit certificate with SANs localhost, 127.0.0.1, and ::1.
The leaf expires January 5, 2027 UTC. This is a local development certificate,
not a publicly trusted production certificate. The local CA was imported into
the current user's trusted roots with explicit user authorization.

For a fresh checkout, run scripts/setup-local.ps1. It refuses to overwrite existing
certificates or keys. Review the CA before importing it for browser use:

```powershell
certutil -user -f -addstore Root certs/local-ca.pem
```

To remove this local trust, find its thumbprint with:

```powershell
Get-ChildItem Cert:\CurrentUser\Root | Where-Object Subject -eq 'CN=Secure Auth Local Development CA'
# Use the displayed thumbprint, after confirming it is the certificate created here:
certutil -user -delstore Root THUMBPRINT
```

## Security controls

- TLS 1.2 minimum and TLS 1.3 maximum, with explicit AEAD cipher suites.
- HTTPS-only browser fetch URLs; CSP restricts API connections to HTTPS localhost.
- HSTS, nosniff, frame protection, no-referrer, and API no-store responses.
- Required email input plus server validation of ASCII email syntax and lengths.
  This checks syntax; it does not establish mailbox ownership. Add email verification
  before treating an email as verified in a production service.
- AES-256-GCM email encryption: random 12-byte IV and 16-byte authentication tag.
- Independent HMAC-SHA-256 blind index for lookup; plaintext email is not persisted.
- scrypt N=131072, r=8, p=1, random 16-byte salt, 64-byte derived key;
  constant-time hash comparison. No plaintext password persistence or logging.
- Random 256-bit session token, __Host-sid Secure/HttpOnly/SameSite=Strict cookie,
  30-minute expiration, rotation and invalidation on logout.
- Exact origin and JSON checks for POST, 20 POSTs/minute/IP, 16 KiB body limit.
- MongoDB storage with unique indexes for email lookup and user IDs; duplicate inserts are rejected atomically.

Email and passwords exist briefly in memory for processing and inside TLS-protected
requests. AES protects stored email; scrypt protects stored passwords. TLS protects
transport. These are distinct controls. Hashes permit offline password guessing;
strong passwords and an expensive hash reduce that risk.

## Tests and evidence

Stop npm start first so the test owns the two ports:

```powershell
npm test
```

The test uses explicit CA trust with rejectUnauthorized=true and hostname verification.
It creates synthetic accounts in a unique isolated MongoDB test database and removes that test database afterward. Results are in
output/evidence/poc-results.json. Browser screenshots and browser-results.json document
an actual Chrome signup/logout/login flow with certificate checking enabled. The browser
PoC helper requires Playwright, available in the Codex runtime used for this report;
it is optional and is not an application dependency.

## Wireshark evidence - pending on this machine

Wireshark and Npcap were absent during implementation. Windows pktmon returned
Access is denied. No packet capture or Wireshark screenshot has been fabricated.
The PDF accurately marks this requirement as pending.

Install the official Windows Wireshark package with Npcap loopback support:
https://www.wireshark.org/download.html

Start npm start, then run:

```powershell
./scripts/capture-poc.ps1
```

During the 45-second capture, perform signup, logout, and login using a unique synthetic
email and password. No TLS key logging should be configured (clear SSLKEYLOGFILE and
Wireshark's TLS (Pre)-Master-Secret log filename). Open auth-flow.pcapng in Wireshark:

1. Display filter: tcp.port == 3443 || tcp.port == 4443. If necessary, Decode As TLS.
2. Screenshot ClientHello and ServerHello. Expand supported_versions: 0x0304 means
   TLS 1.3. TLS record-layer legacy_version 0x0303 alone does not mean TLS 1.2.
3. Screenshot TLS Application Data and its encrypted bytes during signup/login.
4. Use Find Packet > Packet bytes > String for the exact test email and password.
   Screenshot the search settings and no-match result. Search the stored AES ciphertext
   too if desired; the application does not transmit that stored ciphertext to the browser.
5. Follow TCP Stream and show ciphertext. Without keys, HTTP JSON bodies should not be
   decoded. Retain pcapng and screenshots in output/evidence.
6. Hash the original capture with Get-FileHash -Algorithm SHA256 and record the capture
   interval, interface, test sequence, relevant packet numbers, and Wireshark version.

A no-match search alone is not a proof of security. Combine it with a complete capture,
verified TLS handshake, encrypted application records, and the corresponding successful
browser flow. Traffic metadata (IP addresses, ports, size, timing, possibly SNI) remains
visible. An endpoint or a party holding TLS session secrets can decrypt traffic.

## Production configuration

Use a CA-issued certificate for your actual domain, supply the full certificate chain,
and automate renewal. Set TLS_KEY_PATH/TLS_CERT_PATH to protected files outside source
control. Replace hardcoded localhost API/CSP URLs together with FRONTEND_ORIGIN for a
non-local deployment. Never disable certificate validation. Limit key and database ACLs
on Windows; POSIX file mode 0600 alone does not establish Windows ACLs.

Use a secret manager, back up encryption keys securely, plan key rotation/re-encryption,
and use shared session/rate-limit stores for multiple instances.
MongoDB stores users; the in-memory session and rate-limit stores are intended for a single-process demo.
Duplicate-signup responses disclose account existence; production policy should consider
neutral responses and mailbox confirmation. Add recovery, verification and audit facilities
as needed. Never publish .env, CA private key, server key, or live user data.


## MongoDB connection

The backend now connects to the running local MongoDB service:

```env
MONGODB_URI=mongodb://127.0.0.1:27017
MONGODB_DB=secure_auth
```

Accounts are in `secure_auth.users`. In MongoDB Compass, connect using the local
URI above and open this database and collection. Stored fields are encrypted
email/name, keyed email index, scrypt hash, user ID and creation timestamp.
Passwords and emails are never persisted as plaintext.

Existing encrypted accounts were migrated without changing encryption keys or
password hashes. The original JSON is retained as a backup, but the application
no longer reads or writes it. For another legacy file, run:

```powershell
npm run migrate
# Or: node scripts/migrate-to-mongo.js path/to/users.json
```

Migration is idempotent: accounts with an existing email index are skipped.
Keep the original AES and email-index keys or existing accounts cannot be read
or looked up. MongoDB connection failure prevents backend startup; there is no
silent fallback to file storage. Browser-to-backend traffic remains HTTPS.
This local database connection uses loopback without MongoDB TLS; for production,
use an authenticated TLS-enabled MongoDB URI (Atlas mongodb+srv or tls=true),
with certificate validation enabled and least-privilege credentials. Do not expose
an unauthenticated local database to the network.
