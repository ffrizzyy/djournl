// Outgoing mail, for password-reset links only. Three ways to send:
//
//   Brevo   BREVO_API_KEY
//           HTTPS API, a verified sender address, no domain needed. Works on Railway, which
//           blocks outbound SMTP ports.
//   SMTP    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//           e.g. Gmail with an app password. Needs a host that allows outbound SMTP.
//   Resend  RESEND_API_KEY
//           Needs a sender domain verified in Resend.
//
// EMAIL_FROM is required for every provider, e.g. "Djournl <you@gmail.com>". Precedence:
// SMTP if any SMTP setting is present, then Brevo, then Resend. A half-filled SMTP setting
// never falls through to another provider.
//
// BREVO_API_URL and RESEND_API_URL exist so the tests can point at a local stand-in; leave
// them unset in production.
const nodemailer = require('nodemailer');

const sender = () => String(process.env.EMAIL_FROM || '');
const smtpHost = () => String(process.env.SMTP_HOST || '');
const smtpPort = () => Number(process.env.SMTP_PORT || 465);
const smtpUser = () => String(process.env.SMTP_USER || '');
const smtpPass = () => String(process.env.SMTP_PASS || '');
const brevoKey = () => String(process.env.BREVO_API_KEY || '');
const brevoEndpoint = () => String(process.env.BREVO_API_URL || 'https://api.brevo.com/v3/smtp/email');
const resendKey = () => String(process.env.RESEND_API_KEY || '');
const resendEndpoint = () => String(process.env.RESEND_API_URL || 'https://api.resend.com/emails');

const smtpConfigured = () => !!(sender() && smtpHost() && smtpUser() && smtpPass());
const smtpRequested = () => !!(smtpHost() || smtpUser() || smtpPass());
const brevoConfigured = () => !!(sender() && brevoKey());
const resendConfigured = () => !!(sender() && resendKey());
// SMTP is chosen as soon as any SMTP setting is present, so a half-filled SMTP setup never
// silently falls back to Brevo or Resend. Otherwise Brevo is preferred over Resend.
const mailConfigured = () => {
  if (smtpRequested()) return smtpConfigured();
  if (brevoKey()) return brevoConfigured();
  return resendConfigured();
};

/** Splits "Djournl <you@example.com>" into Brevo's { name, email } sender object. */
function senderParts() {
  const raw = sender().trim();
  const match = raw.match(/^(.*?)\s*<([^<>]+)>$/);
  if (!match) return { email: raw };
  const name = match[1].trim().replace(/^"(.*)"$/, '$1');
  return name ? { name, email: match[2].trim() } : { email: match[2].trim() };
}

let transport;
const smtpTransport = () => {
  if (!transport) {
    const port = smtpPort();
    transport = nodemailer.createTransport({
      host: smtpHost(),
      port,
      secure: port === 465, // 465 is implicit TLS; 587 uses STARTTLS
      auth: { user: smtpUser(), pass: smtpPass() },
      connectionTimeout: 10000,
      greetingTimeout: 10000,
      socketTimeout: 15000,
    });
  }
  return transport;
};

/** Sends one plain-text message. Throws when no provider is configured or the provider refuses it. */
async function sendMail({ to, subject, text }) {
  if (smtpRequested()) {
    if (!smtpConfigured()) {
      throw new Error('SMTP is incomplete: set SMTP_HOST, SMTP_USER, SMTP_PASS, and EMAIL_FROM');
    }
    const info = await smtpTransport().sendMail({ from: sender(), to, subject, text });
    return { id: info.messageId };
  }
  if (brevoKey()) {
    if (!brevoConfigured()) {
      throw new Error('Brevo is incomplete: set BREVO_API_KEY and EMAIL_FROM');
    }
    const res = await fetch(brevoEndpoint(), {
      method: 'POST',
      headers: {
        'api-key': brevoKey(),
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        sender: senderParts(),
        to: [{ email: to }],
        subject,
        textContent: text,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Brevo rejected the message (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    return res.json().catch(() => ({}));
  }
  if (resendConfigured()) {
    const res = await fetch(resendEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${resendKey()}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ from: sender(), to: [to], subject, text }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Resend rejected the message (${res.status})${detail ? `: ${detail.slice(0, 300)}` : ''}`);
    }
    return res.json().catch(() => ({}));
  }
  throw new Error('Email is not configured: set BREVO_API_KEY, SMTP_HOST/SMTP_USER/SMTP_PASS, or RESEND_API_KEY, plus EMAIL_FROM');
}

module.exports = { sendMail, mailConfigured };
