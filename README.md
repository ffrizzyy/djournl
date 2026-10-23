# Djournl

Akses hasil deploy disini: https://djournl.up.railway.app/

Jurnal harian dengan mood tracker (beberapa catatan per hari), dashboard tren mood, pengamatan pola AI mingguan, dan rangkuman kegiatan AI — versi standalone yang bisa dijalankan sendiri atau di-deploy ke server mana pun.

## Fitur

- **Hari ini** — halaman dibuka langsung pada **kartu tulis**, fitur utamanya: kartu terbesar di halaman, berisi pilihan mode, pertanyaan, kotak tulis, foto, perasaan hari ini, dan tombol simpan. Tulis dengan mode Harian (empat langkah tetap + rangkuman AI; ini yang terbuka duluan) atau Check Up (pertanyaan acak). Tiap catatan bisa diberi **foto** dari kamera atau galeri (maksimal 4 per catatan; catatan boleh hanya berisi foto). Kartu **Hari ini di masa lalu** menampilkan catatanmu seminggu, sebulan, 3 dan 6 bulan lalu, serta tanggal yang sama di tahun-tahun sebelumnya.
- **Dashboard** — streak, grafik mood 7/30 hari, pengamatan AI mingguan, **kalender mood** per bulan (ketuk tanggal untuk membuka catatannya), dan **streak bareng**.
- **Riwayat** — **pencarian**, saringan mood, **#tag** (tulis `#kerja` di catatan, otomatis jadi tag), **favorit** (bintang per catatan), rangkuman AI, ekspor `.txt`, cetak/PDF, serta **cadangan `.json`** yang bisa dipulihkan lagi.
- **Tur fitur** — saat pertama kali masuk, tiap akun diajak keliling langkah demi langkah (sekitar 13 langkah, bisa dilewati) melewati semua fitur di keempat halaman. Langkah yang tidak relevan dilewati sendiri, misalnya penjelasan kotak tulis saat empat langkah Harian sudah selesai. Tur bisa dibuka lagi kapan saja dari halaman Profil.
- **Profil** — satu halaman untuk profil dan pengaturan: nama panggilan, **email**, ganti kata sandi, **verifikasi dua langkah (TOTP)**, pengingat harian, tema, mode menulis, tur fitur, tombol keluar, **keluar dari perangkat lain**, dan hapus akun.
- **Lupa kata sandi** — di halaman masuk, "Lupa kata sandi?" meminta email akun (akun lama bisa memakai nama pengguna), lalu mengirim **tautan sekali pakai lewat email** untuk membuat kata sandi baru. Tautannya berlaku 30 menit. Kalau verifikasi dua langkah aktif, mengatur ulang kata sandi tetap meminta kode authenticator atau kode pemulihan.
- **Sapaan dan pertanyaan yang berganti** — sapaan berbeda untuk tiap bagian hari dan hari tertentu, 56 pertanyaan Check Up, dan enam susunan kata untuk tiap langkah Harian. Pilihannya tetap sepanjang satu hari dan berganti keesokan harinya.
- **Akun** — satu server bisa dipakai beberapa orang. Tiap akun punya jurnal sendiri yang tidak bisa dibaca akun lain.

### Email dan masuk

Akun baru dibuat dengan **email + kata sandi**. Email disimpan dalam huruf kecil dan harus unik; nama pengguna internal dibuat otomatis dari bagian sebelum `@` (mis. `farrel`), jadi kamu tidak perlu memilih nama pengguna saat mendaftar. Masuk bisa memakai email itu, sedangkan akun lama tetap bisa memakai nama penggunanya.

Email bisa diganti dari **Profil → Keamanan** dengan memasukkan kata sandi sekarang. Lupa kata sandi memakai **tautan reset sekali pakai yang dikirim lewat email** (SMTP atau Resend; lihat variabel `SMTP_*`, `RESEND_API_KEY`, dan `EMAIL_FROM`); belum ada verifikasi alamat email, jadi pastikan alamatnya benar saat mendaftar atau menggantinya.

### Streak bareng

Dua orang atau lebih bisa menjaga streak bersama. Buat grup di Dashboard, bagikan kode undangannya (6 karakter), lalu teman bergabung dengan kode itu dari akunnya sendiri di server yang sama.

- Streak grup naik satu untuk setiap hari **semua** anggotanya menulis.
- Hari ini yang belum lengkap tidak langsung memutus streak; streak baru putus kalau satu hari penuh terlewat.
- Hari sebelum seseorang bergabung tidak dihitung untuk orang itu, dan streak baru mulai berjalan setelah grup punya minimal dua anggota.
- Yang terlihat anggota lain hanya **nama panggilan** dan **sudah atau belum menulis hari ini**. Isi catatan dan mood tidak pernah dibagikan.
- Pergantian hari mengikuti **tanggal lokal** tiap anggota (tengah malam di perangkatnya), sama seperti bagian aplikasi lainnya. Anggota di zona waktu yang sama berbagi batas hari yang sama; kalau zona waktunya berbeda, masing-masing dihitung menurut harinya sendiri.

### Verifikasi dua langkah

Verifikasi dua langkah bersifat opsional dan diaktifkan dari **Profil**. Setelah kata sandi dimasukkan, aplikasi menampilkan kunci yang bisa ditambahkan ke aplikasi authenticator apa pun (Google Authenticator, Authy, 1Password, dan sejenisnya), lalu meminta satu kode untuk memastikan pengaturannya benar.

- Setelah aktif, masuk memakai kata sandi **dan** kode 6 angka yang berganti setiap 30 detik.
- Saat aktivasi, aplikasi menampilkan **10 kode pemulihan sekali pakai**. Simpan di tempat aman: kode itu hanya ditampilkan sekali, dan masing-masing hanya bisa dipakai satu kali.
- Kata sandi yang diatur ulang lewat tautan email tidak melewati verifikasi dua langkah; kode tetap diminta.
- Kalau authenticator dan semua kode pemulihan hilang, pemilik server bisa menjalankan `npm run reset-password -- <email-atau-nama-pengguna>`. Perintah itu memberi kata sandi sementara sekaligus mematikan verifikasi dua langkah akun tersebut, jadi pemilik akun bisa masuk dan mengaktifkannya lagi.
- Rahasia TOTP disimpan di database; kode pemulihan hanya disimpan sebagai hash SHA-256, sama seperti token sesi.

## Menjalankan lokal

```bash
npm install
cp .env.example .env
npm start
```

Buka `http://localhost:3000`.

Fitur AI (pengamatan mingguan di Dashboard, rangkuman kegiatan di Riwayat, rangkuman harian di mode Harian) bersifat opsional — tanpa kunci API di `.env`, seluruh aplikasi tetap jalan normal, dan kotak-kotak itu menjelaskan sendiri bahwa AI belum diaktifkan (tanpa tombol yang pasti gagal, tanpa pesan error teknis).

```bash
npm test   # menjalankan server sungguhan dengan database sementara, lalu mengujinya lewat HTTP
```

### Variabel lingkungan

| Variabel | Default | Fungsi |
|---|---|---|
| `PORT` | `3000` | Port server |
| `DATA_DIR` | `./data` | Folder tempat `djournl.sqlite` disimpan. Arahkan ke disk persisten saat deploy |
| `ALLOW_SIGNUP` | `true` | `false` menutup pendaftaran akun baru (akun pertama selalu bisa dibuat) |
| `SIGNUPS_PER_HOUR` | `10` | Batas pembuatan akun per jam dari satu alamat IP |
| `AI_DAILY_LIMIT` | `30` | Batas permintaan AI per akun per hari, karena semua akun memakai kunci API yang sama |
| `PHOTO_LIMIT` | `2000` | Jumlah foto maksimal per akun |
| `RESEND_API_KEY` | kosong | Alternatif pengiriman lewat Resend; butuh `EMAIL_FROM` dengan domain terverifikasi. Kalau SMTP lengkap, SMTP yang dipakai |
| `SMTP_HOST` | kosong | Server SMTP, mis. `smtp.gmail.com`. Isi bersama `SMTP_USER`, `SMTP_PASS`, dan `EMAIL_FROM` untuk mengaktifkan email reset tanpa domain |
| `SMTP_PORT` | `465` | Port SMTP. `465` memakai TLS langsung; `587` memakai STARTTLS |
| `SMTP_USER` | kosong | Alamat email untuk login SMTP, mis. alamat Gmail |
| `SMTP_PASS` | kosong | App Password SMTP, bukan kata sandi email biasa. Untuk Gmail: 2-Step Verification lalu buat App Password |
| `EMAIL_FROM` | kosong | Pengirim untuk SMTP atau Resend, mis. `Djournl <alamat@gmail.com>` (Gmail) atau `Djournl <no-reply@domainmu.com>` (Resend) |
| `APP_URL` | alamat permintaan | Alamat publik aplikasi untuk tautan di email, mis. `https://jurnal.contoh.com`. Biasanya tidak perlu diisi |
| `TRUST_PROXY` | kosong | Jumlah proxy di depan aplikasi (biasanya `1` di hosting). Kosongkan saat dijalankan langsung |
| `AI_PROVIDER` dan kuncinya | `anthropic` | Lihat bagian di bawah |

## Pakai AI dari provider lain

`AI_PROVIDER` di `.env` menentukan provider mana yang dipanggil server. Kodenya satu abstraksi (`server/ai.js`), jadi ganti provider = ganti `.env`, bukan ganti kode.

| `AI_PROVIDER` | Butuh diisi | Contoh |
|---|---|---|
| `anthropic` (default) | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` | Claude |
| `openai` | `OPENAI_API_KEY`, `OPENAI_MODEL` | GPT |
| `openai_compatible` | `AI_BASE_URL`, `AI_MODEL`, `AI_API_KEY` (opsional) | Groq, Together AI, Mistral, atau model lokal (mis. Ollama) lewat proxy yang meniru endpoint `chat/completions` OpenAI |

Lihat `.env.example` untuk daftar lengkap variabelnya.

## Deploy

**Panduan lengkap memasang di internet ada di [DEPLOY.md](DEPLOY.md)** (Fly.io, Railway, Render, atau VPS sendiri dengan HTTPS otomatis), termasuk pengaturan email reset dan cadangan rutin. Ringkasnya:

**Docker (cara termudah):**
```bash
cp .env.example .env   # isi provider AI kalau mau
docker compose up -d --build
```
Data SQLite tersimpan di volume bernama `djournl-data`, jadi tetap ada walau container dihapus dan dibuat ulang.

**VPS / server sendiri (tanpa Docker):**
```bash
npm ci --omit=dev
cp .env.example .env
npm start   # pakai pm2 atau systemd supaya tetap jalan setelah SSH ditutup
```

**Platform dengan disk persisten (Render, Railway, Fly.io, dll.):** set environment variables lewat dashboard platform tersebut, lalu pastikan folder `data/` dipetakan ke volume/disk persisten (atau set `DATA_DIR` ke lokasi disk itu) — bukan sekadar filesystem sementara, atau riwayat jurnal akan hilang saat container di-restart.

**Yang TIDAK akan berfungsi:** platform serverless/edge murni (Vercel Functions, Netlify Functions, Cloudflare Workers). Djournl memakai file SQLite di disk, dan platform-platform itu tidak punya filesystem persisten antar request. Kalau memang butuh serverless, itu berarti mengganti `server/db.js` ke database terkelola (Postgres, Turso, dsb.) — perubahan arsitektur, bukan sekadar konfigurasi.

Ada endpoint `GET /healthz` yang mengembalikan `{ok:true}` untuk health check platform deploy.

## Arsitektur

- **Frontend** (`public/index.html`) — satu file HTML/CSS/JS vanilla, tidak ada build step. Bicara ke backend lewat `fetch()` biasa.
- **Backend** (`server/index.js`) — Express, menyajikan file statis dari `public/` sekaligus REST API di `/api/*`.
- **AI** (`server/ai.js`) — satu fungsi `generateText(prompt)` yang menyembunyikan provider mana yang sebenarnya dipanggil.
- **Akun** (`server/auth.js`) — daftar, masuk, keluar. Email adalah identitas masuk; akun lama tetap bisa memakai nama pengguna, dan nama pengguna untuk akun baru dibuat otomatis dari email. Kata sandi di-hash dengan scrypt + salt per akun; sesi berupa token acak di cookie `HttpOnly`, dan database hanya menyimpan hash SHA-256 dari token itu. Masuk dengan verifikasi dua langkah memakai tiket sementara 5 menit sebelum sesi dibuat.
- **Verifikasi dua langkah** (`server/twofactor.js`) — TOTP RFC 6238 (SHA-1, 6 angka, 30 detik) dan kode pemulihan sekali pakai, tanpa dependensi tambahan.
- **Streak bareng** (`server/circles.js`) — grup, kode undangan, dan perhitungan streak grup.
- **Tanggal** (`server/day.js`) — "hari ini" adalah tanggal lokal penulisnya, bukan jam server. Browser mengirimnya di header `X-Local-Date` pada setiap permintaan; server hanya menerimanya kalau selisihnya paling banyak satu hari dari tanggal UTC server (tidak ada zona waktu yang lebih jauh dari itu), selain itu server memakai tanggal UTC-nya sendiri.
- **Keamanan dasar** — semua masukan catatan dibersihkan di server sebelum disimpan (tanggal harus nyata, mood harus dikenal, catatan hanya membawa field yang dipakai aplikasi, teks maksimal 20.000 karakter per catatan), respons API memakai `Cache-Control: no-store` dan tidak bisa diubah dari situs lain (pemeriksaan `Origin`), respons halaman membawa `Content-Security-Policy`, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, dan `Permissions-Policy`, dan semua error dijawab dalam JSON.
- **Database** (`server/db.js`) — SQLite lewat `better-sqlite3`, satu file di `data/djournl.sqlite`. Skema di-migrasi otomatis: database dari versi satu-pengguna dibangun ulang dengan kolom `user_id`, kolom `email` ditambahkan ke database lama (akun lama tetap `NULL` sampai pemiliknya mengisi dari Profil), dan seluruh catatan lamanya diwarisi oleh **akun pertama yang mendaftar**.

```
djournl-app/
├── Dockerfile
├── docker-compose.yml
├── package.json
├── .env.example
├── server/
│   ├── index.js    # Express app + route jurnal, pengaturan, ekspor, AI
│   ├── auth.js     # akun + sesi + reset lewat email
│   ├── email.js    # kirim tautan reset lewat Resend
│   ├── twofactor.js # TOTP + kode pemulihan
│   ├── circles.js  # streak bareng
│   ├── photos.js   # foto di catatan
│   ├── day.js      # tanggal lokal penulis
│   ├── ai.js       # abstraksi provider AI
│   └── db.js       # koneksi SQLite + skema tabel + migrasi
├── test/           # npm test
├── public/
│   └── index.html  # seluruh frontend
└── data/           # dibuat otomatis, isi: djournl.sqlite (jangan di-commit)
```

## API

Semua route `/api/*` selain `/api/auth/*` butuh sesi masuk (cookie) dan hanya menyentuh data akun yang sedang masuk; tanpa sesi jawabannya `401`.

| Method | Path | Fungsi |
|---|---|---|
| GET | `/api/auth/config` | `{signup, firstAccount, emailReset}` — apakah pendaftaran dibuka, apakah server ini belum punya akun, dan apakah pengiriman email reset sudah dikonfigurasi |
| POST | `/api/auth/register` | Buat akun `{email, name?, password}` lalu langsung masuk. Nama pengguna dibuat otomatis dari email; `username` masih diterima kalau ingin menentukan sendiri |
| POST | `/api/auth/login` | Masuk dengan `{email, password}` atau `{username, password}` untuk akun lama; `{identifier, password}` juga diterima. 8 kali gagal = terkunci 10 menit. Kalau 2FA aktif, jawabannya `{twoFactor:true}` dan belum ada sesi |
| POST | `/api/auth/2fa` | Langkah kedua masuk: `{code}` berisi 6 angka authenticator atau satu kode pemulihan. Butuh tiket 5 menit dari langkah pertama |
| POST | `/api/auth/forgot` | Kirim tautan reset ke email akun `{identifier}` (email atau nama pengguna lama). Jawabannya selalu `{ok:true}` supaya tidak membocorkan akun mana yang ada; `503` kalau email belum dikonfigurasi. Paling banyak 5 permintaan per 15 menit dari satu alamat |
| POST | `/api/auth/reset` | Selesaikan reset dengan tautan email: `{token, password}`. Token sekali pakai dan berlaku 30 menit; semua sesi lama dihapus. Kalau 2FA aktif, langkah kedua tetap diminta |
| POST | `/api/auth/logout` | Keluar; sesi dan tiket 2FA dihapus di server |
| GET | `/api/me` | Akun yang sedang masuk: `{id, username, email, name, createdAt, twoFactor, recoveryCodesLeft}` |
| PATCH | `/api/account/profile` | Ganti nama panggilan `{name}` |
| POST | `/api/account/email` | Atur atau ganti email `{email, password}`; email harus unik dan kata sandi sekarang wajib benar |
| POST | `/api/account/password` | Ganti kata sandi `{current, next}`. Sesi di perangkat lain dihapus |
| GET | `/api/account/security` | `{twoFactor, recoveryCodesLeft}` untuk halaman Profil |
| POST | `/api/account/2fa/setup` | Mulai pengaturan 2FA `{password}`; jawabannya `{secret, uri}` untuk aplikasi authenticator |
| POST | `/api/account/2fa/enable` | Konfirmasi dengan `{code}` dan dapatkan 10 kode pemulihan sekali tampil |
| POST | `/api/account/2fa/disable` | Matikan 2FA `{password, code}`; kode boleh dari authenticator atau kode pemulihan |
| POST | `/api/account/2fa/recovery-codes` | Buat 10 kode pemulihan baru `{password, code}`; kode lama langsung tidak berlaku |
| DELETE | `/api/account/sessions` | Keluar dari semua perangkat lain, sesi perangkat ini tetap hidup |
| DELETE | `/api/account` | Hapus akun `{password}` beserta catatan, foto, pengaturan, keanggotaan grup, dan data 2FA-nya |
| GET | `/api/circles` | Grup streak yang kamu ikuti: streak, anggota, siapa yang sudah menulis hari ini |
| POST | `/api/circles` | Buat grup `{name}` |
| POST | `/api/circles/join` | Gabung dengan kode undangan `{code}` |
| DELETE | `/api/circles/:id/membership` | Keluar dari grup (grup terhapus kalau anggotanya habis) |
| POST | `/api/photos` | Unggah satu foto (isi permintaan = byte gambar JPEG/PNG/WebP, maksimal 4 MB). Jawabannya `{id}`, yang lalu dimasukkan ke `photos` sebuah catatan |
| GET | `/api/photos/:id` | Ambil foto. Hanya pemiliknya yang bisa; untuk akun lain jawabannya `404` |
| GET | `/api/entries` | Ambil 2000 hari terbaru, masing-masing dengan array `notes` |
| GET | `/api/export.json` | Unduh cadangan lengkap (catatan, favorit, rangkuman harian) |
| POST | `/api/import` | Pulihkan cadangan `{entries:[...], photos:[...]}`. Tanggal yang sama ditimpa, tanggal lain dibiarkan; foto tetap dibatasi kuota album |
| PUT | `/api/entries/:date` | Simpan seluruh catatan tanggal tsb (`{mood, notes, daySummary}`). `400` kalau tanggalnya tidak nyata atau tidak ada catatan berisi teks. Teks per catatan dipotong di 20.000 karakter |
| DELETE | `/api/entries/:date` | Hapus seluruh catatan tanggal tsb |
| GET | `/api/settings` | Pengaturan pengingat, cache pengamatan/rangkuman, dan `ai: {configured, label}` |
| PUT | `/api/settings` | Perbarui `reminderEnabled`, `reminderTime`, `summaryRange`, `dayMode`, `tourDone`. Kunci lain diabaikan |
| GET | `/api/export.txt` | Unduh seluruh riwayat + rangkuman (kalau ada) sebagai teks polos |
| POST | `/api/insight` | Pengamatan pola mingguan dari 14 catatan terakhir (butuh AI provider terkonfigurasi) |
| POST | `/api/summary` | Rangkuman kegiatan `{range: 7\|30}` hari terakhir (butuh AI provider terkonfigurasi) |
| POST | `/api/entries/:date/day-summary` | Rangkuman satu hari itu saja (mode "Harian"), tersimpan di baris entri itu sendiri (butuh AI provider terkonfigurasi) |
| GET | `/healthz` | `{ok:true}` kalau database bisa dibaca, `503` kalau tidak — untuk health check |

Satu hari kini bisa punya beberapa catatan terpisah (kolom `notes`, JSON array `{prompt, text, at, fav?, photos?}`; `fav` menandai favorit, `photos` berisi id foto, dan tag tidak disimpan terpisah melainkan dibaca dari `#kata` di dalam `text`). Baris yang dibuat sebelum kolom ini ada tetap terbaca sebagai satu catatan, dari kolom `prompt`/`text` lama — tidak ada migrasi manual yang perlu dijalankan.

## Catatan jujur soal keterbatasan

- **Lupa kata sandi memakai email.** Tautan reset sekali pakai dikirim lewat SMTP atau Resend. Untuk SMTP, isi `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, dan `EMAIL_FROM`; untuk Gmail pakai App Password, bukan kata sandi biasa. Untuk Resend, isi `RESEND_API_KEY` dan `EMAIL_FROM` dengan domain terverifikasi. Kalau email tidak bisa diakses atau pengiriman belum dikonfigurasi, pemilik server bisa menjalankan `npm run reset-password -- <email-atau-nama-pengguna>` untuk memberi kata sandi sementara.
- **Email belum diverifikasi.** Siapa pun bisa mendaftar dengan alamat yang bukan miliknya selama alamat itu belum dipakai akun lain. Email adalah identitas masuk dan kanal reset, tetapi Djournl tidak membuktikan bahwa alamat itu benar-benar milik pendaftar. Pastikan alamatnya benar saat mendaftar atau menggantinya.
- **Verifikasi dua langkah bisa mengunci diri sendiri kalau kuncinya hilang.** Kode pemulihan hanya ditampilkan sekali saat aktivasi; simpan sebelum menutup halaman. Kalau authenticator dan semua kode pemulihan hilang, pemilik server harus menjalankan `npm run reset-password -- <email-atau-nama-pengguna>`, yang juga mematikan 2FA untuk akun itu. Tautan reset lewat email tetap meminta kode 2FA, jadi tautan itu saja tidak bisa membuka akun.
- **Hapus akun bersifat permanen.** Tidak ada masa tunggu atau tempat sampah. Cadangkan dulu lewat Riwayat kalau catatannya masih diinginkan.
- **Pendaftaran terbuka secara default.** Siapa pun yang tahu alamat server bisa membuat akun (jurnal tiap akun tetap terpisah). Set `ALLOW_SIGNUP=false` setelah semua orang yang kamu ajak sudah mendaftar. Kode pendaftaran sudah dihapus; tutup pendaftaran lewat variabel itu.
- **Pakai HTTPS kalau di-deploy.** Kata sandi dikirim saat masuk; tanpa HTTPS ia lewat jaringan tanpa enkripsi. Di balik reverse proxy HTTPS, cookie sesi otomatis diberi tanda `Secure`.
- **Streak bareng hanya antar akun di server yang sama.** Dua instalasi Djournl yang terpisah tidak bisa saling terhubung.
- **Kunci AI dipakai bersama.** Semua akun memakai provider AI yang sama dari `.env`, jadi biayanya ditanggung pemilik server.
- **Input suara** pakai Web Speech API bawaan browser — tidak jalan di Firefox, dan tetap butuh koneksi internet meski datanya sendiri sudah lokal.
- **Pengingat** cuma aktif kalau tab browser masih terbuka (pakai Notification API bawaan browser), dan muncul saat tab itu sedang tidak dilihat. Sapaan di dalam aplikasi tetap jadi jaring pengaman kalau notifikasi tidak didukung/ditolak.
- **Catatan lama memakai tanggal UTC.** Versi awal menentukan "hari ini" dengan UTC, jadi catatan yang ditulis sebelum pukul 07.00 WIB tersimpan di tanggal sehari sebelumnya. Catatan baru memakai tanggal lokal; catatan lama tidak digeser otomatis.
- **Satu hari disimpan utuh.** Kalau jurnal yang sama dibuka di dua perangkat sekaligus dan keduanya menyimpan catatan untuk hari yang sama, simpanan terakhir yang menang.
- **Draf tersimpan di browser.** Tulisan yang belum disimpan diingat di perangkat itu (bukan di server) sampai disimpan atau sampai keluar akun.
- **Foto disimpan di dalam database.** Sebelum diunggah, browser mengecilkan tiap foto (sisi terpanjang 1600 px, JPEG), yang sekaligus membuang data lokasi dari kamera. Foto tersimpan di `djournl.sqlite` bersama catatannya, jadi memindahkan satu file itu sudah membawa semuanya, tapi ukuran file ikut membesar. Foto ikut terhapus saat catatannya dihapus, dan ikut masuk ke cadangan `.json`.
- **Kamera butuh HTTPS atau localhost.** Tombol Kamera menyalakan kamera langsung di halaman (pratinjau, tombol jepret, ganti kamera) di ponsel maupun komputer, tapi browser hanya mengizinkannya lewat HTTPS atau `localhost`. Kalau Djournl dibuka lewat alamat `http://` biasa (misalnya IP di jaringan rumah), tombol itu jatuh ke pemilih bawaan perangkat: di ponsel tetap membuka aplikasi kamera, di komputer membuka pemilih file.
- **Foto tidak dikirim ke AI.** Rangkuman dan pengamatan hanya membaca teks catatan.

## Pengujian

`npm test` menjalankan server sungguhan dengan database sementara dan mengujinya lewat HTTP: akun dan sesi, **pendaftaran dan masuk dengan email**, nama pengguna otomatis yang unik, **mengganti email dari Profil**, isolasi jurnal antar akun, validasi catatan, tanggal lokal, cadangan dan pemulihan, aturan streak grup, foto (unggah, privasi antar akun, pembersihan, cadangan), jawaban saat AI belum diaktifkan, header keamanan, **2FA (setup, masuk, kode pemulihan sekali pakai, matikan)**, **lupa kata sandi lewat tautan email** (termasuk tautan sekali pakai dan penggantian tautan lama), **reset kata sandi yang tetap meminta 2FA**, **keluar dari perangkat lain**, **penolakan permintaan lintas situs**, dan **batas panjang catatan**. Pengiriman email diuji lewat jalur Resend tiruan di dalam test; jalur SMTP diuji saat konfigurasi server.

Di luar itu, halaman utama sudah dijalankan di Chrome headless (ponsel dan desktop, terang dan gelap) untuk memeriksa alur daftar/masuk, ketiga tab, pemulihan draf, perubahan mood, foto dan kamera (dengan perangkat kamera simulasi), seluruh langkah tur fitur, tanggal di beberapa zona waktu, dan bahwa tidak ada pelanggaran Content-Security-Policy. UI 2FA yang baru diuji lewat HTTP end-to-end; pemeriksaan visual terakhirnya dilakukan saat deploy.

Yang **belum** diuji: fitur AI dengan kunci API sungguhan, input suara, notifikasi pengingat, kamera di perangkat sungguhan, dan deploy lewat Docker.
