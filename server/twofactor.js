// Time-based one-time passwords (RFC 6238) and one-time recovery codes, with no extra
// dependency: the app already has crypto, and a 6-digit TOTP is a small amount of math.
const crypto = require('crypto');

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
const RECOVERY_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789'; // no 0/O, 1/I/L
const RECOVERY_COUNT = 10;
const RECOVERY_LENGTH = 8;

function base32Encode(buf) {
  let bits = 0;
  let value = 0;
  let out = '';
  for (const byte of buf) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      out += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) out += BASE32[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(text) {
  let bits = 0;
  let value = 0;
  const out = [];
  for (const char of String(text || '').toUpperCase().replace(/[^A-Z2-7]/g, '')) {
    const index = BASE32.indexOf(char);
    if (index < 0) continue;
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(out);
}

/** A fresh 160-bit secret, the size RFC 4226 recommends. */
const newSecret = () => base32Encode(crypto.randomBytes(20));

/** The 6-digit code for one secret at one 30-second step. */
function codeAt(secret, step = Math.floor(Date.now() / (STEP_SECONDS * 1000))) {
  const key = base32Decode(secret);
  const counter = Buffer.alloc(8);
  counter.writeBigUInt64BE(BigInt(step));
  const digest = crypto.createHmac('sha1', key).update(counter).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary = ((digest[offset] & 0x7f) << 24)
    | ((digest[offset + 1] & 0xff) << 16)
    | ((digest[offset + 2] & 0xff) << 8)
    | (digest[offset + 3] & 0xff);
  return String(binary % (10 ** DIGITS)).padStart(DIGITS, '0');
}

/** True when the code belongs to now, or the step before/after (clocks drift a little). */
function verifyCode(secret, code, window = 1) {
  const given = String(code || '').replace(/\s+/g, '');
  if (!/^\d{6}$/.test(given) || !secret) return false;
  const step = Math.floor(Date.now() / (STEP_SECONDS * 1000));
  for (let offset = -window; offset <= window; offset += 1) {
    const expected = codeAt(secret, step + offset);
    if (crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))) return true;
  }
  return false;
}

/** The URI an authenticator app understands, so the secret can be added with one tap. */
function otpauthUri(secret, username) {
  const label = encodeURIComponent(`Djournl:${username}`);
  const params = new URLSearchParams({
    secret,
    issuer: 'Djournl',
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}

/** Ten codes in XXXX-XXXX shape; only their hashes are ever stored. */
function newRecoveryCodes() {
  return Array.from({ length: RECOVERY_COUNT }, () => {
    let raw = '';
    for (const byte of crypto.randomBytes(RECOVERY_LENGTH)) raw += RECOVERY_ALPHABET[byte % RECOVERY_ALPHABET.length];
    return `${raw.slice(0, 4)}-${raw.slice(4)}`;
  });
}

/** Case, spaces and dashes do not matter when someone retypes a recovery code. */
const normalizeRecoveryCode = (code) => String(code || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
const hashRecoveryCode = (code) => crypto.createHash('sha256').update(normalizeRecoveryCode(code)).digest('hex');

module.exports = {
  newSecret,
  codeAt,
  verifyCode,
  otpauthUri,
  newRecoveryCodes,
  normalizeRecoveryCode,
  hashRecoveryCode,
  RECOVERY_COUNT,
};
