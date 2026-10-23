// For whoever runs the server: gives an account a new temporary password when its owner cannot
// use the emailed reset link. Everyone signed in to that account is signed out.
//
//   npm run reset-password -- <email-atau-nama-pengguna>
const crypto = require('crypto');
const db = require('../server/db');
const { setPassword } = require('../server/auth');

// The database is always closed before the process ends, and the script never calls
// process.exit(): exiting with the database still open makes its native module abort.
async function main() {
  const identifier = String(process.argv[2] || '').trim().toLowerCase();
  if (!identifier) return 'Pakai: npm run reset-password -- <email-atau-nama-pengguna>';
  const user = identifier.includes('@')
    ? db.prepare('SELECT id, username, name, email FROM users WHERE email = ?').get(identifier)
    : db.prepare('SELECT id, username, name, email FROM users WHERE username = ?').get(identifier);
  if (!user) return `Tidak ada akun dengan email atau nama pengguna "${identifier}".`;
  const temporary = crypto.randomBytes(9).toString('base64url');
  await setPassword(user.id, temporary);
  db.prepare('DELETE FROM sessions WHERE user_id = ?').run(user.id);
  // An owner-run reset is the last way back in, so it also removes a second factor the owner
  // can no longer produce. Doing it here is explicit and leaves a trail in the terminal.
  const hadTwoFactor = !!db.prepare('SELECT 1 FROM totp WHERE user_id = ? AND enabled = 1').get(user.id);
  db.prepare('DELETE FROM totp WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM recovery_codes WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM login_tickets WHERE user_id = ?').run(user.id);
  db.prepare('DELETE FROM password_resets WHERE user_id = ?').run(user.id);
  console.log(`Kata sandi sementara untuk ${user.email || `@${user.username}`} (${user.name}): ${temporary}`);
  if (hadTwoFactor) console.log('Verifikasi dua langkah akun ini ikut dimatikan. Minta pemiliknya mengaktifkannya lagi setelah masuk.');
  console.log('Minta pemilik akun masuk dengan kata sandi ini, lalu menggantinya di halaman Profil.');
  return null;
}

main()
  .catch((e) => e.message)
  .then((problem) => {
    db.close();
    if (problem) { console.error(problem); process.exitCode = 1; }
  });
