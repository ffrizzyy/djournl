// Outgoing mail, for password-reset links only. Two ways to send:
//
//   SMTP    SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS
//           e.g. Gmail with an app password. Works without owning a domain.
//   Resend  RESEND_API_KEY
//           Needs a sender domain verified in Resend.
//
// EMAIL_FROM is required for both, e.g. "Djournl <you@gmail.com>" for Gmail or
// "Djournl <no-reply@example.com>" for a verified domain. When SMTP is fully configured it wins.
//
// RESEND_API_URL exists so the tests can point the Resend path at a local stand-in; leave it
// unset in production.
const nodemailer = require('nodemailer');

const sender = () => String(process.env.EMAIL_FROM || '');
const smtpHost = () => String(process.env.SMTP_HOST || '');
const smtpPort = () => Number(process.env.SMTP_PORT || 465);
const smtpUser = () => String(process.env.SMTP_USER || '');
const smtpPass = () => String(process.env.SMTP_PASS || '');
const resendKey = () => String(process.env.RESEND_API_KEY || '');
const resendEndpoint = () => String(process.env.RESEND_API_URL || 'https://api.resend.com/emails');

const smtpConfigured = () => !!(sender() && smtpHost() && smtpUser() && smtpPass());
const resendConfigured = () => !!(sender() && resendKey());
const mailConfigured = () => smtpConfigured() || resendConfigured();

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
  if (smtpConfigured()) {
    const info = await smtpTransport().sendMail({ from: sender(), to, subject, text });
    return { id: info.messageId };
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
  throw new Error('Email is not configured: set SMTP_HOST/SMTP_USER/SMTP_PASS or RESEND_API_KEY, plus EMAIL_FROM');
}

module.exports = { sendMail, mailConfigured };
