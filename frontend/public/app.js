const API = 'https://localhost:4443';
const $ = id => document.getElementById(id);
async function api(path, options = {}) {
  const res = await fetch(API + path, {credentials: 'include', headers: {'Content-Type': 'application/json'}, ...options});
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body;
}
function show(id, message, ok = false) { $(id).textContent = message; $(id).classList.toggle('success', ok); }
function route() {
  const requested = location.hash.slice(1);
  const page = ['signup', 'login', 'account'].includes(requested) ? requested : 'home';
  for (const name of ['home', 'signup', 'login', 'account']) $(`${name}-view`).hidden = name !== page;
  document.title = ({home:'Secure Account', signup:'Create account', login:'Login', account:'Your account'})[page];
  if (page !== 'signup') { $('sPassword').value = ''; $('sConfirm').value = ''; }
  if (page !== 'login') $('lPassword').value = '';
  document.querySelectorAll('[data-toggle]').forEach(button => {
    $(button.dataset.toggle).type = 'password'; button.textContent = 'Show'; button.setAttribute('aria-pressed', 'false');
  });
  if (page === 'account') checkMe();
  const heading = $(`${page}-title`); if (heading && page !== 'home') heading.focus();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);
function matchPasswords() {
  $('sConfirm').setCustomValidity($('sConfirm').value && $('sConfirm').value !== $('sPassword').value ? 'Passwords do not match.' : '');
}
$('sPassword').addEventListener('input', matchPasswords); $('sConfirm').addEventListener('input', matchPasswords);
document.querySelectorAll('[data-toggle]').forEach(button => button.addEventListener('click', () => {
  const field = $(button.dataset.toggle), visible = field.type === 'password';
  field.type = visible ? 'text' : 'password'; button.textContent = visible ? 'Hide' : 'Show';
  button.setAttribute('aria-pressed', String(visible));
}));
async function submit(form, status, action) {
  const button = form.querySelector('[type="submit"]'); button.disabled = true; show(status, '');
  try { await action(); } catch (err) { show(status, err.message); } finally { button.disabled = false; }
}
$('signup').addEventListener('submit', async event => {
  event.preventDefault(); matchPasswords(); if (!$('signup').reportValidity()) return;
  await submit($('signup'), 'sStatus', async () => {
    const fullName = $('sName').value.trim();
    if (fullName.length < 2) throw new Error('Please enter a name with at least 2 characters.');
    await api('/api/signup', {method:'POST', body:JSON.stringify({fullName, email:$('sEmail').value, password:$('sPassword').value})});
    $('signup').reset(); $('sConfirm').setCustomValidity(''); show('accountStatus', 'Account created successfully.', true); location.hash = 'account';
  });
});
$('login').addEventListener('submit', async event => {
  event.preventDefault(); await submit($('login'), 'lStatus', async () => {
    await api('/api/login', {method:'POST', body:JSON.stringify({email:$('lEmail').value, password:$('lPassword').value})});
    $('login').reset(); show('accountStatus', 'Login successful.', true); location.hash = 'account';
  });
});
async function checkMe() {
  try {
    const body = await api('/api/me'); $('me').textContent = body.email;
    $('welcome').textContent = body.fullName ? `Welcome, ${body.fullName}. You are securely signed in.` : 'You are securely signed in.';
  } catch (err) {
    $('me').textContent = ''; $('welcome').textContent = '';
    show('lStatus', err.message === 'Not authenticated.' ? 'Please log in to access your account.' : err.message); location.hash = 'login';
  }
}
$('check').addEventListener('click', checkMe);
$('logout').addEventListener('click', async () => {
  $('logout').disabled = true;
  try { await api('/api/logout', {method:'POST', body:'{}'}); $('me').textContent = ''; $('welcome').textContent = ''; show('lStatus', 'You have been logged out.', true); location.hash = 'login'; }
  catch (err) { show('accountStatus', err.message); }
  finally { $('logout').disabled = false; }
});
route();
