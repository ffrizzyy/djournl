// Outgoing mail, through Resend (https://resend.com). Only password-reset links are sent, so a
// plain HTTPS call is enough and no SDK is needed. Both settings must be present before the
// forgot-password screen offers to send anything:
//
//   RESEND_API_KEY  an API key from the Resend dashboard
//   EMAIL_FROM      a verified sender, e.g. "Djournl <no-reply@example.com>"
//
// RESEND_API_URL exists so the tests can point this at a local stand-in; leave it unset in
// production.
const endpoint = () => String(process.env.RESEND_API_URL || 'https://api.resend.com/emails');
const apiKey = () => String(process.env.RESEND_API_KEY || '');
const sender = () => String(process.env.EMAIL_FROM || '');

const mailConfigured = () => !!apiKey() && !!sender();

/** Sends one plain-text message. Throws when Resend is not configured or refuses the message. */
async function sendMail({ to, subject, text }) {
  if (!mailConfigured()) {
    throw new Error('Email is not configured: set RESEND_API_KEY and EMAIL_FROM');
  }
  const res = await fetch(endpoint(), {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey()}`,
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

module.exports = { sendMail, mailConfigured };
