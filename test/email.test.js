const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const { sendMail, mailConfigured } = require('../server/email');

const KEYS = [
  'EMAIL_FROM', 'BREVO_API_KEY', 'BREVO_API_URL',
  'SMTP_HOST', 'SMTP_PORT', 'SMTP_USER', 'SMTP_PASS',
  'RESEND_API_KEY', 'RESEND_API_URL',
];

function snapshot() {
  return Object.fromEntries(KEYS.map((key) => [key, process.env[key]]));
}

function restore(saved) {
  for (const key of KEYS) {
    if (saved[key] === undefined) delete process.env[key];
    else process.env[key] = saved[key];
  }
}

test('Brevo sends a reset message over HTTPS with a parsed sender', async (t) => {
  const saved = snapshot();
  let received;
  const server = http.createServer((req, res) => {
    let body = '';
    req.setEncoding('utf8');
    req.on('data', (chunk) => { body += chunk; });
    req.on('end', () => {
      received = { method: req.method, url: req.url, headers: req.headers, body: JSON.parse(body) };
      res.writeHead(201, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ messageId: 'brevo-test-id' }));
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve) => server.close(resolve)));
  t.after(() => restore(saved));

  process.env.EMAIL_FROM = 'Djournl <no-reply@example.test>';
  process.env.BREVO_API_KEY = 'brevo-test-key';
  process.env.BREVO_API_URL = `http://127.0.0.1:${server.address().port}/v3/smtp/email`;
  delete process.env.SMTP_HOST;
  delete process.env.SMTP_PORT;
  delete process.env.SMTP_USER;
  delete process.env.SMTP_PASS;
  delete process.env.RESEND_API_KEY;
  delete process.env.RESEND_API_URL;

  assert.equal(mailConfigured(), true);
  const result = await sendMail({
    to: 'user@example.test',
    subject: 'Atur ulang kata sandi Djournl',
    text: 'Buka tautan berikut untuk membuat kata sandi baru.',
  });

  assert.equal(result.messageId, 'brevo-test-id');
  assert.equal(received.method, 'POST');
  assert.equal(received.url, '/v3/smtp/email');
  assert.equal(received.headers['api-key'], 'brevo-test-key');
  assert.deepEqual(received.body.sender, { name: 'Djournl', email: 'no-reply@example.test' });
  assert.deepEqual(received.body.to, [{ email: 'user@example.test' }]);
  assert.equal(received.body.subject, 'Atur ulang kata sandi Djournl');
  assert.equal(received.body.textContent, 'Buka tautan berikut untuk membuat kata sandi baru.');
});
