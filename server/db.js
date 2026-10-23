// Database layer: a real SQLite file on disk (./data/djournl.sqlite), not localStorage.
// Several people can share one server: every journal row belongs to a user, and nothing but
// "did they write today" is ever shared between them (see circles, below).
const path = require('path');
const fs = require('fs');
const Database = require('better-sqlite3');

// DATA_DIR lets a deploy point this at its persistent disk (and lets tests use a throwaway one).
const dataDir = process.env.DATA_DIR ? path.resolve(process.env.DATA_DIR) : path.join(__dirname, '..', 'data');
fs.mkdirSync(dataDir, { recursive: true });

// The journal used to be stored under the app's previous name. Renaming the app must not strand
// the data on an existing disk, so an existing database file is moved into place (with its WAL
// sidecars) before the database is opened.
const dbFile = path.join(dataDir, 'djournl.sqlite');
if (!fs.existsSync(dbFile)) {
  const legacyName = fs.readdirSync(dataDir).find((name) => name.endsWith('.sqlite'));
  if (legacyName) {
    const legacyDbFile = path.join(dataDir, legacyName);
    for (const suffix of ['', '-wal', '-shm']) {
      if (fs.existsSync(legacyDbFile + suffix)) fs.renameSync(legacyDbFile + suffix, dbFile + suffix);
    }
  }
}

const db = new Database(dbFile);
db.pragma('journal_mode = WAL');
// WAL plus NORMAL is the usual fast-and-safe pair for a small single-file app; the busy timeout
// makes two requests that write at the same instant wait for each other instead of throwing.
db.pragma('synchronous = NORMAL');
db.pragma('busy_timeout = 5000');

db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL UNIQUE,
    email TEXT,
    name TEXT NOT NULL,
    pass_hash TEXT NOT NULL,
    pass_salt TEXT NOT NULL,
    created_at INTEGER NOT NULL,
    secret_question TEXT,
    secret_hash TEXT,
    secret_salt TEXT
  );
  CREATE TABLE IF NOT EXISTS sessions (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  -- A circle is a group of people keeping a streak together.
  CREATE TABLE IF NOT EXISTS circles (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    code TEXT NOT NULL UNIQUE,
    created_at INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS circle_members (
    circle_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    joined_at INTEGER NOT NULL,
    joined_day TEXT,
    PRIMARY KEY (circle_id, user_id)
  );
  -- Pictures attached to notes. Kept in the database itself so one file is still the whole
  -- journal: backing up or moving djournl.sqlite takes the pictures with it.
  CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    mime TEXT NOT NULL,
    data BLOB NOT NULL,
    attached INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS photos_by_user ON photos (user_id, attached);

  -- Optional second factor. The secret is only trusted once the person proves they can make a
  -- code from it (enabled = 1), so an abandoned setup cannot lock anyone out.
  CREATE TABLE IF NOT EXISTS totp (
    user_id INTEGER PRIMARY KEY,
    secret TEXT NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL
  );
  -- Recovery codes are shown once and stored as SHA-256 hashes, like session tokens.
  CREATE TABLE IF NOT EXISTS recovery_codes (
    user_id INTEGER NOT NULL,
    code_hash TEXT NOT NULL,
    used_at INTEGER,
    PRIMARY KEY (user_id, code_hash)
  );
  -- A short-lived ticket between "password was right" and "second factor was right".
  CREATE TABLE IF NOT EXISTS login_tickets (
    token_hash TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at INTEGER NOT NULL
  );
  CREATE INDEX IF NOT EXISTS login_tickets_expiry ON login_tickets (expires_at);
`);

const columnsOf = (table) => db.prepare(`PRAGMA table_info(${table})`).all().map((c) => c.name);

// The personal question for a forgotten password, and the hash of its answer (see auth.js).
// Accounts made before it existed have none until their owner sets one from Profil.
// recovery_hash belonged to a short-lived recovery-code scheme that the question replaced.
const userColumns = columnsOf('users');
['secret_question', 'secret_hash', 'secret_salt', 'email'].forEach((column) => {
  if (!userColumns.includes(column)) db.exec(`ALTER TABLE users ADD COLUMN ${column} TEXT`);
});
if (userColumns.includes('recovery_hash')) db.exec('ALTER TABLE users DROP COLUMN recovery_hash');

// New accounts sign in with an email. Accounts made before emails existed keep a NULL email
// until their owner adds one from Profil; a partial index keeps those NULLs from colliding while
// still making every real address unique.
db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_email ON users (email) WHERE email IS NOT NULL');

// joined_day is the member's own local date when they joined; rows from before it existed
// fall back to the UTC date of joined_at (see circles.js).
if (!columnsOf('circle_members').includes('joined_day')) {
  db.exec('ALTER TABLE circle_members ADD COLUMN joined_day TEXT');
}

// entries and settings are keyed per user. Databases from the single-user version have no
// user_id column: rebuild those tables with their rows parked on user_id 0, which the first
// account to register then inherits (see /api/auth/register).
const TABLES = {
  entries: {
    columns: ['date', 'mood', 'prompt', 'text', 'notes', 'day_summary', 'updated_at'],
    create: `CREATE TABLE entries (
      user_id INTEGER NOT NULL DEFAULT 0,
      date TEXT NOT NULL,
      mood TEXT NOT NULL,
      prompt TEXT NOT NULL,
      text TEXT NOT NULL,
      notes TEXT,
      day_summary TEXT,
      updated_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, date)
    )`,
  },
  settings: {
    columns: ['key', 'value'],
    create: `CREATE TABLE settings (
      user_id INTEGER NOT NULL DEFAULT 0,
      key TEXT NOT NULL,
      value TEXT,
      PRIMARY KEY (user_id, key)
    )`,
  },
};
Object.entries(TABLES).forEach(([table, def]) => {
  const existing = columnsOf(table);
  if (existing.length === 0) { db.exec(def.create); return; }
  if (existing.includes('user_id')) return;
  // Older single-user tables may also predate notes/day_summary — copy only what they have.
  const shared = def.columns.filter((c) => existing.includes(c)).join(', ');
  db.transaction(() => {
    db.exec(`ALTER TABLE ${table} RENAME TO ${table}_single_user`);
    db.exec(def.create);
    db.exec(`INSERT INTO ${table} (user_id, ${shared}) SELECT 0, ${shared} FROM ${table}_single_user`);
    db.exec(`DROP TABLE ${table}_single_user`);
  })();
});

module.exports = db;
