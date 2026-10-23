// End-to-end tests: starts the real server against a throwaway database and talks to it over HTTP.
// Run with `npm test`.
const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { utcDay, shiftDay } = require('../server/day');
const twofactor = require('../server/twofactor');

const PORT = 3491;
const BASE = `http://127.0.0.1:${PORT}`;
const MAIL_PORT = 3493;
const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'djournl-test-'));
const outbox = [];        // every message the app tried to send through Resend
let server, mailServer;

before(async () => {
  // A stand-in for Resend: it records what the app sends and always accepts it.
  mailServer = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => { raw += chunk; });
    req.on('end', () => {
      if (req.method !== 'POST' || req.url !== '/emails') { res.writeHead(404); res.end(); return; }
      try { outbox.push(JSON.parse(raw)); } catch (e) { /* ignore malformed bodies */ }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ id: `mail-${outbox.length}` }));
    });
  });
  await new Promise((resolve) => mailServer.listen(MAIL_PORT, '127.0.0.1', resolve));
  server = spawn(process.execPath, [path.join(__dirname, '..', 'server', 'index.js')], {
    // An empty key keeps the AI "unconfigured" even if the developer's own .env has one.
    env: {
      ...process.env, PORT: String(PORT), DATA_DIR: dataDir, AI_PROVIDER: 'anthropic', ANTHROPIC_API_KEY: '',
      ALLOW_SIGNUP: 'true', SIGNUPS_PER_HOUR: '100', TRUST_PROXY: '1',
      RESEND_API_KEY: 'test-key', EMAIL_FROM: 'Djournl <no-reply@example.test>',
      RESEND_API_URL: `http://127.0.0.1:${MAIL_PORT}/emails`, APP_URL: BASE,
    },
    stdio: 'ignore',
  });
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`${BASE}/healthz`)).ok) return; } catch (e) { /* not up yet */ }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('server did not start');
});

after(async () => {
  server.kill();
  await new Promise((r) => server.once('exit', r));
  await new Promise((resolve) => mailServer.close(resolve));
  fs.rmSync(dataDir, { recursive: true, force: true });
});

// One browser: keeps its session cookie and reports a local date, as the page does.
function client(localDate = utcDay()) {
  // A real browser can hold the session cookie and the short-lived 2FA ticket at once, and one
  // response can clear one while setting the other. Keep a tiny jar rather than one string.
  const jar = new Map();
  const cookieHeader = () => [...jar].map(([name, value]) => `${name}=${value}`).join('; ');
  const absorb = (res) => {
    const lines = typeof res.headers.getSetCookie === 'function'
      ? res.headers.getSetCookie()
      : (res.headers.get('set-cookie') ? [res.headers.get('set-cookie')] : []);
    for (const line of lines) {
      const pair = line.split(';')[0];
      const i = pair.indexOf('=');
      if (i < 1) continue;
      const name = pair.slice(0, i).trim();
      const value = pair.slice(i + 1).trim();
      if (value) jar.set(name, value); else jar.delete(name);
    }
  };
  const call = async (method, url, body, raw) => {
    const res = await fetch(BASE + url, {
      method,
      headers: { 'X-Local-Date': call.day, ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}), ...(jar.size ? { cookie: cookieHeader() } : {}) },
      body: raw !== undefined ? raw : body !== undefined ? JSON.stringify(body) : undefined,
    });
    absorb(res);
    let data = null;
    try { data = await res.json(); } catch (e) { /* not JSON */ }
    return { status: res.status, data, headers: res.headers };
  };
  call.day = localDate;
  // For requests that are not JSON in and JSON out (uploading and fetching pictures).
  call.raw = (url, init = {}) => fetch(BASE + url, { ...init, headers: { 'X-Local-Date': call.day, ...(jar.size ? { cookie: cookieHeader() } : {}), ...(init.headers || {}) } });
  return call;
}
// The smallest things the server will take for a JPEG and a PNG: it checks the leading bytes.
const JPEG = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 0x01]);
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d]);
const upload = async (c, bytes = JPEG, type = 'image/jpeg') => {
  const res = await c.raw('/api/photos', { method: 'POST', headers: { 'Content-Type': type }, body: bytes });
  return { status: res.status, data: await res.json().catch(() => null) };
};
const note = (text, extra = {}) => ({ prompt: 'Apa kabar hari ini?', text, at: Date.now(), ...extra });
const write = (c, date, text = 'catatan uji') => c('PUT', `/api/entries/${date}`, { mood: 'tenang', notes: [note(text)] });
const register = async (username, localDate) => {
  const c = client(localDate);
  const res = await c('POST', '/api/auth/register', {
    email: `${username}@example.test`,
    username,
    name: username[0].toUpperCase() + username.slice(1),
    password: `rahasia-${username}-1`,
  });
  assert.equal(res.status, 200);
  return c;
};
// Turns the optional second factor on for an account made by register().
const enableTwoFactor = async (c, username) => {
  const setup = await c('POST', '/api/account/2fa/setup', { password: `rahasia-${username}-1` });
  assert.equal(setup.status, 200);
  const enabled = await c('POST', '/api/account/2fa/enable', { code: twofactor.codeAt(setup.data.secret) });
  assert.equal(enabled.status, 200);
  return { secret: setup.data.secret, uri: setup.data.uri, codes: enabled.data.recoveryCodes };
};
// The newest reset email for an address, and the one-time token in its link.
const resetTokenFor = (email) => {
  const message = [...outbox].reverse().find((m) => (Array.isArray(m.to) ? m.to : [m.to]).includes(email));
  assert.ok(message, `no reset email was sent to ${email}`);
  const match = String(message.text || '').match(/https?:\/\/\S+\?reset=([a-f0-9]{64})/);
  assert.ok(match, 'the email carries a reset link');
  return match[1];
};
// A request from a chosen address, for the rate-limit tests (TRUST_PROXY is on for this server).
const postFrom = (ip, url, body) => fetch(BASE + url, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', 'X-Forwarded-For': ip },
  body: JSON.stringify(body),
});

const today = utcDay();
const yesterday = shiftDay(today, -1);

test('nothing under /api is readable without signing in', async () => {
  const anon = client();
  for (const url of ['/api/me', '/api/entries', '/api/settings', '/api/circles', '/api/export.json', '/api/export.txt']) {
    assert.equal((await anon('GET', url)).status, 401, url);
  }
  const cfg = (await anon('GET', '/api/auth/config')).data;
  assert.deepEqual(cfg, { signup: true, firstAccount: true, emailReset: true });
});

test('responses carry the security headers', async () => {
  const res = await fetch(BASE + '/');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.match(res.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.equal(res.headers.get('x-frame-options'), 'DENY');
  assert.match(res.headers.get('permissions-policy'), /geolocation=\(\)/);
  assert.equal(res.headers.get('x-powered-by'), null);
});

test('registration needs an email, and accounts cannot share an email or username', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/register', { username: 'ana', password: 'short' })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { email: 'bukan-email', password: 'long-enough-1' })).status, 400);
  assert.equal((await c('POST', '/api/auth/register', { email: 'ana@example.test', username: 'a b', password: 'long-enough-1' })).status, 400);
  const ok = await c('POST', '/api/auth/register', { email: 'Ana@Example.test', name: 'Ana', password: 'rahasia-ana-1' });
  assert.equal(ok.status, 200);
  assert.equal(ok.data.username, 'ana', 'the username is derived from the email when it is not supplied');
  assert.equal(ok.data.email, 'ana@example.test');
  assert.match(ok.headers.get('set-cookie'), /HttpOnly; SameSite=Lax/);
  assert.equal((await client()('POST', '/api/auth/register', { email: 'ana@example.test', username: 'ana2', password: 'another-pass-1' })).status, 409);
  assert.equal((await client()('POST', '/api/auth/register', { email: 'ana2@example.test', username: 'ana', password: 'another-pass-1' })).status, 409);
});

test('usernames derived from an email are made unique', async () => {
  const first = await client()('POST', '/api/auth/register', { email: 'kembar@one.test', password: 'rahasia-kembar-1' });
  const second = await client()('POST', '/api/auth/register', { email: 'kembar@two.test', password: 'rahasia-kembar-1' });
  assert.equal(first.status, 200);
  assert.equal(second.status, 200);
  assert.equal(first.data.username, 'kembar');
  assert.equal(second.data.username, 'kembar-2');
});

test('login with an email or a legacy username, logout and lockout', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/login', { email: 'ana@example.test', password: 'wrong-pass-1' })).status, 401);
  assert.equal((await c('POST', '/api/auth/login', { email: 'ANA@EXAMPLE.TEST', password: 'rahasia-ana-1' })).status, 200);
  assert.equal((await c('GET', '/api/me')).data.username, 'ana');
  assert.equal((await c('GET', '/api/me')).data.email, 'ana@example.test');
  await c('POST', '/api/auth/logout');
  assert.equal((await c('POST', '/api/auth/login', { username: 'ANA', password: 'rahasia-ana-1' })).status, 200, 'old accounts can still use their username');
  await c('POST', '/api/auth/logout');
  assert.equal((await c('GET', '/api/me')).status, 401);

  await register('kunci');
  const guesser = client();
  let last;
  for (let i = 0; i < 9; i++) last = await guesser('POST', '/api/auth/login', { username: 'kunci', password: `guess-${i}-xx` });
  assert.equal(last.status, 429);
});

test('entries are validated and cleaned before they are stored', async () => {
  const c = await register('budi');
  assert.equal((await c('PUT', '/api/entries/not-a-date', { notes: [note('x')] })).status, 400);
  assert.equal((await c('PUT', '/api/entries/2026-02-31', { notes: [note('x')] })).status, 400);
  assert.equal((await c('PUT', `/api/entries/${today}`, { notes: [note('   ')] })).status, 400);
  assert.equal((await c('PUT', `/api/entries/${today}`, {})).status, 400);

  const res = await c('PUT', `/api/entries/${today}`, {
    mood: '<script>', notes: [note('halo #kerja', { fav: true, evil: '<img onerror=x>' }), { text: 42 }], daySummary: { text: 'ringkas', at: 1, extra: true },
  });
  assert.equal(res.status, 200);
  const [entry] = (await c('GET', '/api/entries')).data;
  assert.equal(entry.mood, 'biasa');
  assert.equal(entry.notes.length, 1);
  assert.deepEqual(Object.keys(entry.notes[0]).sort(), ['at', 'fav', 'prompt', 'text']);
  assert.deepEqual(entry.daySummary, { text: 'ringkas', at: 1 });
  assert.equal(entry.text, 'halo #kerja');
});

test('one account cannot see another account\'s journal', async () => {
  const ana = client();
  await ana('POST', '/api/auth/login', { username: 'ana', password: 'rahasia-ana-1' });
  await write(ana, today, 'rahasia ana');
  const citra = await register('citra');
  assert.equal((await citra('GET', '/api/entries')).data.length, 0);
  assert.equal((await citra('GET', '/api/export.json')).data.entries.length, 0);
  assert.equal((await citra('DELETE', `/api/entries/${today}`)).status, 200);
  assert.equal((await ana('GET', '/api/entries')).data.length, 1, 'deleting your own empty day must not touch someone else\'s');
});

test('the server takes "today" from the caller, within a day of its own clock', async () => {
  const c = await register('dewi', yesterday);
  const name = (res) => res.headers.get('content-disposition');
  await write(c, yesterday);
  assert.match(name(await c('GET', '/api/export.json')), new RegExp(yesterday));
  c.day = '1999-01-01'; // nonsense: ignored, falls back to the server's UTC date
  assert.match(name(await c('GET', '/api/export.json')), new RegExp(today));
});

test('backup round-trips, and restore skips what it cannot read', async () => {
  const c = await register('eka');
  await write(c, yesterday, 'kemarin');
  await c('PUT', `/api/entries/${today}`, { mood: 'senang', notes: [note('hari ini', { fav: true })] });
  const backup = (await c('GET', '/api/export.json')).data;
  assert.equal(backup.entries.length, 2);
  await c('DELETE', `/api/entries/${yesterday}`);
  const restored = await c('POST', '/api/import', { entries: [...backup.entries, { date: 'nope', text: 'x' }, { date: '2020-01-01', notes: [{ text: ' ' }] }, null] });
  assert.deepEqual(restored.data, { ok: true, imported: 2, skipped: 3 });
  const after = (await c('GET', '/api/entries')).data;
  assert.equal(after.length, 2);
  assert.equal(after.find((e) => e.date === today).notes[0].fav, true);
  assert.equal((await c('POST', '/api/import', { entries: [] })).status, 400);
});

test('settings only accept the keys the user owns', async () => {
  const c = await register('fajar');
  const res = await c('PUT', '/api/settings', { reminderTime: '21:30', dayMode: 'daily', insightText: 'injected', summaryText: 'injected' });
  assert.equal(res.data.reminderTime, '21:30');
  assert.equal(res.data.dayMode, 'daily');
  assert.equal(res.data.insightText, null);
  assert.equal(res.data.summaryText, null);
  assert.equal((await c('PUT', '/api/settings', { reminderTime: 'whenever' })).data.reminderTime, '21:30');
});

test('without a provider key the AI routes say so kindly, and settings report it', async () => {
  const c = await register('gita');
  assert.deepEqual((await c('GET', '/api/settings')).data.ai, { configured: false, label: 'Claude' });
  for (let i = 0; i < 3; i++) await write(c, shiftDay(today, -i), `catatan ${i}`);
  for (const [url, body] of [['/api/insight'], ['/api/summary', { range: 7 }], [`/api/entries/${today}/day-summary`]]) {
    const res = await c('POST', url, body);
    assert.equal(res.status, 501, url);
    assert.doesNotMatch(res.data.error, /API_KEY|\.env/, 'the technical reason stays in the server log');
  }
});

test('errors come back as JSON in the app\'s own voice', async () => {
  const c = await register('hadi');
  const missing = await c('GET', '/api/no-such-thing');
  assert.equal(missing.status, 404);
  assert.equal(typeof missing.data.error, 'string');
  const broken = await c('PUT', `/api/entries/${today}`, null, '{"notes": [');
  assert.equal(broken.status, 400);
  assert.equal(typeof broken.data.error, 'string');
});

test('a circle\'s streak counts the days every member wrote', async () => {
  // Both join "yesterday" (their local date), so yesterday and today are days the circle covers.
  const indah = await register('indah', yesterday);
  const joko = await register('joko', yesterday);
  const made = (await indah('POST', '/api/circles', { name: 'Tim Pagi' })).data;
  assert.equal(made.length, 1);
  assert.match(made[0].code, /^[A-Z2-9]{6}$/);
  assert.equal(made[0].streak, 0, 'one member is not a streak');
  assert.equal((await joko('POST', '/api/circles/join', { code: 'ZZZZZZ' })).status, 404);
  assert.equal((await joko('POST', '/api/circles/join', { code: made[0].code.toLowerCase() })).data[0].members.length, 2);
  assert.equal((await joko('POST', '/api/circles/join', { code: made[0].code })).status, 409);

  await write(indah, yesterday);
  await write(joko, yesterday);
  indah.day = today; joko.day = today;
  let view = (await indah('GET', '/api/circles')).data[0];
  assert.equal(view.streak, 1, 'yesterday is complete; an unfinished today does not break it');
  assert.equal(view.todayComplete, false);
  assert.deepEqual(Object.keys(view.members[0]).sort(), ['me', 'name', 'wroteToday'], 'only name and wrote-today are shared');

  await write(indah, today);
  view = (await joko('GET', '/api/circles')).data[0];
  assert.equal(view.streak, 1);
  assert.equal(view.members.find((m) => m.me).wroteToday, false);
  await write(joko, today);
  view = (await joko('GET', '/api/circles')).data[0];
  assert.equal(view.streak, 2);
  assert.equal(view.todayComplete, true);

  // A newcomer who has not written makes today incomplete, but cannot undo the days before they joined.
  const lala = await register('lala');
  await lala('POST', '/api/circles/join', { code: made[0].code });
  view = (await indah('GET', '/api/circles')).data[0];
  assert.equal(view.todayComplete, false);
  assert.equal(view.streak, 1);
  await write(lala, today);
  assert.equal((await indah('GET', '/api/circles')).data[0].streak, 2);

  assert.equal((await lala('DELETE', `/api/circles/${view.id}/membership`)).data.length, 0);
  assert.equal((await indah('GET', '/api/circles')).data[0].members.length, 2);
});

test('Harian is the mode a new account starts in', async () => {
  const c = await register('mira');
  assert.equal((await c('GET', '/api/settings')).data.dayMode, 'daily');
  assert.equal((await c('PUT', '/api/settings', { dayMode: 'checkup' })).data.dayMode, 'checkup');
  assert.equal((await c('GET', '/api/settings')).data.dayMode, 'checkup');
});

test('profile: the display name can be changed, and friends see the new one', async () => {
  const rudi = await register('rudi');
  const me = (await rudi('GET', '/api/me')).data;
  assert.equal(me.name, 'Rudi');
  assert.equal(typeof me.createdAt, 'number');
  assert.equal((await rudi('PATCH', '/api/account/profile', { name: '   ' })).status, 400);
  assert.equal((await rudi('PATCH', '/api/account/profile', { name: '  Rudi Hartono  ' })).data.name, 'Rudi Hartono');
  assert.equal((await rudi('GET', '/api/me')).data.name, 'Rudi Hartono');
  const circle = (await rudi('POST', '/api/circles', { name: 'Berdua' })).data[0];
  assert.equal(circle.members[0].name, 'Rudi Hartono');
  assert.equal((await client()('PATCH', '/api/account/profile', { name: 'x' })).status, 401);
});

test('profile: changing the password needs the current one and signs other devices out', async () => {
  const laptop = await register('tika');
  const phone = client();
  assert.equal((await phone('POST', '/api/auth/login', { username: 'tika', password: 'rahasia-tika-1' })).status, 200);
  assert.equal((await laptop('POST', '/api/account/password', { current: 'bukan-ini-1', next: 'sandi-baru-123' })).status, 403);
  assert.equal((await laptop('POST', '/api/account/password', { current: 'rahasia-tika-1', next: 'pendek' })).status, 400);
  assert.equal((await laptop('POST', '/api/account/password', { current: 'rahasia-tika-1', next: 'sandi-baru-123' })).status, 200);
  assert.equal((await laptop('GET', '/api/me')).status, 200, 'the device that changed it stays signed in');
  assert.equal((await phone('GET', '/api/me')).status, 401, 'the other device is signed out');
  assert.equal((await client()('POST', '/api/auth/login', { username: 'tika', password: 'rahasia-tika-1' })).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { username: 'tika', password: 'sandi-baru-123' })).status, 200);
});

test('email can be set or changed from the account, with the password and without collisions', async () => {
  const c = await register('legacy');
  const other = await register('emaildua');
  assert.equal((await c('POST', '/api/account/email', { email: 'bukan-email', password: 'rahasia-legacy-1' })).status, 400);
  assert.equal((await c('POST', '/api/account/email', { email: 'emaildua@example.test', password: 'rahasia-legacy-1' })).status, 409);
  assert.equal((await c('POST', '/api/account/email', { email: 'baru@example.test', password: 'salah-password-1' })).status, 403);
  const changed = await c('POST', '/api/account/email', { email: 'Baru@Example.test', password: 'rahasia-legacy-1' });
  assert.equal(changed.status, 200);
  assert.equal(changed.data.email, 'baru@example.test');
  assert.equal((await c('GET', '/api/me')).data.email, 'baru@example.test');
  assert.equal((await client()('POST', '/api/auth/login', { email: 'baru@example.test', password: 'rahasia-legacy-1' })).status, 200, 'the new address signs in');
  assert.equal((await client()('POST', '/api/auth/login', { email: 'legacy@example.test', password: 'rahasia-legacy-1' })).status, 401, 'the old address no longer does');
  assert.equal((await client()('POST', '/api/account/email', { email: 'apa@example.test', password: 'rahasia-legacy-1' })).status, 401, 'needs a session');
  assert.equal((await other('GET', '/api/me')).data.email, 'emaildua@example.test');
});

test('two-factor: setup, sign-in, one-time recovery codes and disabling', async () => {
  const c = await register('yusuf');
  assert.equal((await c('GET', '/api/me')).data.twoFactor, 0);
  assert.equal((await c('POST', '/api/account/2fa/setup', { password: 'bukan-password-1' })).status, 403);
  const setup = await c('POST', '/api/account/2fa/setup', { password: 'rahasia-yusuf-1' });
  assert.equal(setup.status, 200);
  assert.match(setup.data.secret, /^[A-Z2-7]{32}$/);
  assert.match(setup.data.uri, /^otpauth:\/\/totp\/Djournl%3Ayusuf%40example\.test\?/);
  assert.equal((await c('POST', '/api/account/2fa/enable', { code: '000000' })).status, 401);
  const enabled = await c('POST', '/api/account/2fa/enable', { code: twofactor.codeAt(setup.data.secret) });
  assert.equal(enabled.status, 200);
  assert.equal(enabled.data.recoveryCodes.length, 10);
  const me = (await c('GET', '/api/me')).data;
  assert.equal(me.twoFactor, 1);
  assert.equal(me.recoveryCodesLeft, 10);
  assert.deepEqual((await c('GET', '/api/account/security')).data, { twoFactor: true, recoveryCodesLeft: 10 });
  assert.equal((await c('POST', '/api/account/2fa/setup', { password: 'rahasia-yusuf-1' })).status, 409, 'setup must not turn an active factor off');

  await c('POST', '/api/auth/logout');
  const phone = client();
  const login = await phone('POST', '/api/auth/login', { username: 'yusuf', password: 'rahasia-yusuf-1' });
  assert.equal(login.status, 200);
  assert.equal(login.data.twoFactor, true);
  assert.match(login.headers.get('set-cookie'), /djournl_2fa=/);
  assert.equal((await phone('GET', '/api/me')).status, 401, 'a half-finished login is not a session');
  assert.equal((await phone('POST', '/api/auth/2fa', { code: '000000' })).status, 401);
  assert.equal((await phone('POST', '/api/auth/2fa', { code: twofactor.codeAt(setup.data.secret) })).status, 200);
  assert.equal((await phone('GET', '/api/me')).data.username, 'yusuf');

  // A recovery code works once, and the remaining count drops.
  await phone('POST', '/api/auth/logout');
  const tablet = client();
  assert.equal((await tablet('POST', '/api/auth/login', { username: 'yusuf', password: 'rahasia-yusuf-1' })).data.twoFactor, true);
  assert.equal((await tablet('POST', '/api/auth/2fa', { code: enabled.data.recoveryCodes[0] })).status, 200);
  assert.equal((await tablet('GET', '/api/me')).data.recoveryCodesLeft, 9);
  await tablet('POST', '/api/auth/logout');
  const spent = client();
  await spent('POST', '/api/auth/login', { username: 'yusuf', password: 'rahasia-yusuf-1' });
  assert.equal((await spent('POST', '/api/auth/2fa', { code: enabled.data.recoveryCodes[0] })).status, 401, 'a spent recovery code is dead');

  // Turning it off needs both the password and a current code.
  const admin = client();
  assert.equal((await admin('POST', '/api/auth/login', { username: 'yusuf', password: 'rahasia-yusuf-1' })).data.twoFactor, true);
  assert.equal((await admin('POST', '/api/auth/2fa', { code: twofactor.codeAt(setup.data.secret) })).status, 200);
  assert.equal((await admin('POST', '/api/account/2fa/disable', { password: 'bukan-password-1', code: twofactor.codeAt(setup.data.secret) })).status, 403);
  assert.equal((await admin('POST', '/api/account/2fa/disable', { password: 'rahasia-yusuf-1', code: '000000' })).status, 401);
  assert.equal((await admin('POST', '/api/account/2fa/disable', { password: 'rahasia-yusuf-1', code: twofactor.codeAt(setup.data.secret) })).status, 200);
  assert.equal((await admin('GET', '/api/me')).data.twoFactor, 0);
});

test('two-factor: a password reset still asks for the second factor', async () => {
  const c = client();
  assert.equal((await c('POST', '/api/auth/register', {
    email: 'zahra@example.test', username: 'zahra', name: 'Zahra', password: 'rahasia-zahra-1',
  })).status, 200);
  const factor = await enableTwoFactor(c, 'zahra');
  await c('POST', '/api/auth/logout');

  const fresh = client();
  assert.equal((await fresh('POST', '/api/auth/forgot', { email: 'zahra@example.test' })).status, 200);
  const reset = await fresh('POST', '/api/auth/reset', { token: resetTokenFor('zahra@example.test'), password: 'sandi-baru-456' });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.twoFactor, true, 'the reset does not skip the code');
  assert.equal((await fresh('GET', '/api/me')).status, 401);
  assert.equal((await fresh('POST', '/api/auth/2fa', { code: twofactor.codeAt(factor.secret) })).status, 200);
  assert.equal((await fresh('GET', '/api/me')).data.username, 'zahra');
});

test('sessions: other devices can be signed out without ending this one', async () => {
  const laptop = await register('agus');
  const phone = client();
  assert.equal((await phone('POST', '/api/auth/login', { username: 'agus', password: 'rahasia-agus-1' })).status, 200);
  const revoked = await laptop('DELETE', '/api/account/sessions');
  assert.equal(revoked.status, 200);
  assert.equal(revoked.data.revoked, 1);
  assert.equal((await laptop('GET', '/api/me')).status, 200);
  assert.equal((await phone('GET', '/api/me')).status, 401);
});

test('a note is capped at 20,000 characters', async () => {
  const c = await register('bayu');
  assert.equal((await c('PUT', `/api/entries/${today}`, { notes: [note('x'.repeat(25000))] })).status, 200);
  const [entry] = (await c('GET', '/api/entries')).data;
  assert.equal(entry.notes[0].text.length, 20000);
});

test('cross-site changes are refused, and API responses are not cached', async () => {
  const body = JSON.stringify({ username: 'ana', password: 'rahasia-ana-1' });
  const evil = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://evil.example' }, body,
  });
  assert.equal(evil.status, 403);
  const same = await fetch(`${BASE}/api/auth/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Origin: BASE }, body,
  });
  assert.equal(same.status, 200);
  assert.equal((await fetch(`${BASE}/api/auth/config`)).headers.get('cache-control'), 'no-store');
});

test('the first-visit tour is offered once per account', async () => {
  const c = await register('putu');
  assert.equal((await c('GET', '/api/settings')).data.tourDone, false);
  assert.equal((await c('PUT', '/api/settings', { tourDone: true })).data.tourDone, true);
  assert.equal((await c('GET', '/api/settings')).data.tourDone, true);
  assert.equal((await (await register('qori'))('GET', '/api/settings')).data.tourDone, false, 'it is per account');
});

test('pictures: upload, attach to a note, and stay private to their owner', async () => {
  const nina = await register('nina');
  const omar = await register('omar');
  assert.equal((await client().raw('/api/photos/' + 'a'.repeat(32))).status, 401);

  assert.equal((await upload(nina, Buffer.from('<svg onload=alert(1)>'), 'image/png')).status, 415, 'the bytes decide, not the label');
  assert.equal((await upload(nina, JPEG, 'image/svg+xml')).status, 415);
  const a = (await upload(nina)).data.id;
  const b = (await upload(nina, PNG, 'image/png')).data.id;
  assert.match(a, /^[a-f0-9]{32}$/);

  const got = await nina.raw(`/api/photos/${b}`);
  assert.equal(got.status, 200);
  assert.equal(got.headers.get('content-type'), 'image/png');
  assert.match(got.headers.get('cache-control'), /private/);
  assert.deepEqual(Buffer.from(await got.arrayBuffer()), PNG);
  assert.equal((await omar.raw(`/api/photos/${a}`)).status, 404, 'someone else\'s picture does not exist for you');

  // A note can be a picture with no words. Ids that are not yours are dropped from it.
  const theirs = (await upload(omar)).data.id;
  assert.equal((await nina('PUT', `/api/entries/${today}`, { notes: [note('', { photos: [a, theirs, 'nonsense'] }), note('dengan kata', { photos: [b] })] })).status, 200);
  let [entry] = (await nina('GET', '/api/entries')).data;
  assert.deepEqual(entry.notes.map((n) => n.photos), [[a], [b]]);
  assert.equal(entry.text, 'dengan kata');
  assert.equal((await omar('PUT', `/api/entries/${today}`, { notes: [note('', { photos: [a] })] })).status, 400, 'a note holding only someone else\'s picture is empty');

  // Dropping a picture from the day removes it; the other one stays.
  await nina('PUT', `/api/entries/${today}`, { notes: [note('dengan kata', { photos: [b] })] });
  assert.equal((await nina.raw(`/api/photos/${a}`)).status, 404);
  assert.equal((await nina.raw(`/api/photos/${b}`)).status, 200);

  // The backup carries the picture, so deleting the day and restoring brings it back.
  const backup = (await nina('GET', '/api/export.json')).data;
  assert.equal(backup.photos.length, 1);
  await nina('DELETE', `/api/entries/${today}`);
  assert.equal((await nina.raw(`/api/photos/${b}`)).status, 404);
  assert.equal((await nina('POST', '/api/import', backup)).data.imported, 1);
  assert.deepEqual(Buffer.from(await (await nina.raw(`/api/photos/${b}`)).arrayBuffer()), PNG);
  [entry] = (await nina('GET', '/api/entries')).data;
  assert.deepEqual(entry.notes[0].photos, [b]);

  // Restoring nina's backup into omar's account gives him his own copy of the note, without her picture's id being reusable.
  await nina('DELETE', `/api/entries/${today}`);
  assert.equal((await omar('POST', '/api/import', backup)).data.imported, 1);
  assert.equal((await omar.raw(`/api/photos/${b}`)).status, 200);
  assert.equal((await nina.raw(`/api/photos/${b}`)).status, 404);

  // If an unusual client uses one picture on two days, deleting one day must not break the other.
  const c = (await upload(nina)).data.id;
  await nina('PUT', `/api/entries/${today}`, { notes: [note('hari ini', { photos: [c] })] });
  await nina('PUT', `/api/entries/${yesterday}`, { notes: [note('kemarin', { photos: [c] })] });
  await nina('DELETE', `/api/entries/${today}`);
  assert.equal((await nina.raw(`/api/photos/${c}`)).status, 200);
  await nina('DELETE', `/api/entries/${yesterday}`);
  assert.equal((await nina.raw(`/api/photos/${c}`)).status, 404);
});

test('forgot password: an emailed link sets a new password', async () => {
  const laptop = client();
  assert.equal((await laptop('POST', '/api/auth/register', { email: 'umar@example.test', username: 'umar', name: 'Umar', password: 'rahasia-umar-1' })).status, 200);
  const me = (await laptop('GET', '/api/me')).data;
  assert.equal(me.email, 'umar@example.test');
  assert.deepEqual(Object.keys(me).sort(), ['createdAt', 'email', 'id', 'name', 'recoveryCodesLeft', 'twoFactor', 'username'], 'no secret answer is ever returned');
  const phone = client();
  assert.equal((await phone('POST', '/api/auth/login', { username: 'umar', password: 'rahasia-umar-1' })).status, 200);

  const fresh = client();
  // An address that is not registered gets the same answer, and no email is sent.
  const before = outbox.length;
  assert.equal((await fresh('POST', '/api/auth/forgot', { identifier: 'tidak-ada@example.test' })).status, 200);
  assert.equal(outbox.length, before, 'an unknown address causes no mail');

  assert.equal((await fresh('POST', '/api/auth/forgot', { email: 'umar@example.test' })).status, 200);
  const token = resetTokenFor('umar@example.test');

  assert.equal((await fresh('POST', '/api/auth/reset', { token: '0'.repeat(64), password: 'sandi-baru-456' })).status, 401, 'a made-up token is refused');
  assert.equal((await fresh('POST', '/api/auth/reset', { token, password: 'pendek' })).status, 400);
  const reset = await fresh('POST', '/api/auth/reset', { token, password: 'sandi-baru-456' });
  assert.equal(reset.status, 200);
  assert.equal(reset.data.email, 'umar@example.test');
  assert.equal((await fresh('GET', '/api/me')).data.username, 'umar', 'the reset signs you in');
  assert.equal((await laptop('GET', '/api/me')).status, 401, 'every earlier session is ended');
  assert.equal((await phone('GET', '/api/me')).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'umar@example.test', password: 'rahasia-umar-1' })).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { email: 'umar@example.test', password: 'sandi-baru-456' })).status, 200);
  assert.equal((await fresh('POST', '/api/auth/reset', { token, password: 'sandi-lain-789' })).status, 401, 'the link only works once');
});

test('asking for reset links is cut off per address', async () => {
  let last;
  for (let i = 0; i < 6; i++) last = await postFrom('203.0.113.77', '/api/auth/forgot', { email: `tidak-ada-${i}@example.test` });
  assert.equal(last.status, 429);
  assert.equal((await postFrom('203.0.113.78', '/api/auth/forgot', { email: 'tidak-ada@example.test' })).status, 200, 'a different visitor is not caught in someone else\u2019s lockout');
});

test('a newer reset link replaces the earlier one', async () => {
  const c = await register('wati');
  assert.equal((await postFrom('198.51.100.23', '/api/auth/forgot', { email: 'wati@example.test' })).status, 200);
  const first = resetTokenFor('wati@example.test');
  assert.equal((await postFrom('198.51.100.23', '/api/auth/forgot', { email: 'wati@example.test' })).status, 200);
  const second = resetTokenFor('wati@example.test');
  assert.notEqual(first, second);
  assert.equal((await client()('POST', '/api/auth/reset', { token: first, password: 'sandi-baru-456' })).status, 401, 'the old link is dead');
  assert.equal((await client()('POST', '/api/auth/reset', { token: second, password: 'sandi-baru-456' })).status, 200);
  assert.equal((await c('GET', '/api/me')).status, 401);
});

test('deleting an account removes everything it owned and frees the name', async () => {
  const wina = await register('wina');
  const yoga = await register('yoga');
  const picture = (await upload(wina)).data.id;
  await wina('PUT', `/api/entries/${today}`, { notes: [note('catatan wina', { photos: [picture] })] });
  const shared = (await wina('POST', '/api/circles', { name: 'Berdua' })).data[0];
  await yoga('POST', '/api/circles/join', { code: shared.code });
  const solo = (await wina('POST', '/api/circles', { name: 'Sendiri' })).data.find((c) => c.name === 'Sendiri');

  assert.equal((await wina('DELETE', '/api/account', { password: 'salah-salah-1' })).status, 403);
  assert.equal((await wina('GET', '/api/me')).status, 200, 'a wrong password deletes nothing');
  assert.equal((await wina('DELETE', '/api/account', { password: 'rahasia-wina-1' })).status, 200);
  assert.equal((await wina('GET', '/api/me')).status, 401);
  assert.equal((await client()('POST', '/api/auth/login', { username: 'wina', password: 'rahasia-wina-1' })).status, 401);

  const left = (await yoga('GET', '/api/circles')).data;
  assert.deepEqual(left.map((c) => c.members.map((m) => m.name)), [['Yoga']], 'she is gone from the shared circle');
  assert.equal((await yoga('POST', '/api/circles/join', { code: solo.code })).status, 404, 'a circle with nobody left is removed');

  const again = await register('wina');
  assert.equal((await again('GET', '/api/entries')).data.length, 0, 'the name is free, and starts empty');
  assert.equal((await again.raw(`/api/photos/${picture}`)).status, 404);
});
