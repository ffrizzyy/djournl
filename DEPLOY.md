# Memasang Djournl di internet

Panduan ini untuk memindahkan Djournl dari `localhost` ke alamat yang bisa dibuka dari mana saja.

## Tiga hal yang wajib ada di tempat hosting

1. **Disk yang tidak hilang saat restart.** Seluruh jurnal, akun, dan foto ada di satu file, `data/djournl.sqlite`. Hosting yang "serverless" atau yang disknya sementara (Vercel, Netlify, Cloudflare Workers, paket gratis tanpa disk) akan menghapus semuanya setiap kali aplikasi dinyalakan ulang.
2. **HTTPS.** Tanpa HTTPS, kata sandi lewat tanpa enkripsi dan tombol Kamera tidak bisa menyalakan kamera. Semua pilihan di bawah memberi HTTPS otomatis.
3. **Tepat satu salinan aplikasi yang berjalan.** Karena databasenya satu file, jangan menambah jumlah instance; salinan kedua akan punya database kosong sendiri.

## Pengaturan yang perlu disiapkan

| Variabel | Isi | Kenapa |
|---|---|---|
| `RESEND_API_KEY` | kunci API dari https://resend.com | Supaya tautan "Lupa kata sandi?" bisa dikirim lewat email. **Isi ini** (bersama `EMAIL_FROM`) kalau ingin reset mandiri. |
| `EMAIL_FROM` | pengirim yang domainnya sudah diverifikasi di Resend, mis. `Djournl <no-reply@namadomain.com>` | Alamat pengirim tautan reset. |
| `TRUST_PROXY` | `1` | Supaya aplikasi tahu alamat asli pengunjung dan bahwa mereka datang lewat HTTPS. Sudah diisi di berkas konfigurasi di bawah. |
| `ANTHROPIC_API_KEY` | kunci API-mu | Opsional. Tanpa ini semua tetap jalan, hanya rangkuman AI yang tidak aktif. |
| `ALLOW_SIGNUP` | `false` | Opsional, untuk nanti: menutup pendaftaran sepenuhnya setelah semua orang yang kamu ajak sudah punya akun. |

Daftar lengkapnya ada di `.env.example`.

## Pilihan tempat hosting

| Pilihan | Cocok kalau | Berkas yang dipakai |
|---|---|---|
| **Fly.io** | Mau cepat, lewat terminal, tanpa mengurus server | `fly.toml` |
| **Railway** | Mau serba klik di browser | `Dockerfile` (terdeteksi otomatis) |
| **Render** | Mau serba klik di browser | `render.yaml` |
| **VPS sendiri** | Sudah punya server dan domain, mau kendali penuh | `docker-compose.prod.yml` + `Caddyfile` |

Semua platform itu berbayar atau meminta kartu untuk disk persisten. Cek harga terbarunya di situs masing-masing sebelum memilih.

---

## A. Fly.io

1. Pasang `flyctl` (petunjuk: https://fly.io/docs/flyctl/install/), lalu masuk:
   ```bash
   fly auth login
   ```
2. Dari folder proyek, daftarkan aplikasinya memakai `fly.toml` yang sudah ada. Nama aplikasi harus unik; ganti kalau `djournl` sudah dipakai orang.
   ```bash
   fly launch --copy-config --no-deploy
   ```
3. Buat disk 1 GB untuk database di Singapura:
   ```bash
   fly volumes create djournl_data --region sin --size 1
   ```
4. Isi rahasianya (tidak pernah masuk ke git):
   ```bash
   fly secrets set RESEND_API_KEY="re_..." EMAIL_FROM="Djournl <no-reply@namadomain.com>"
   fly secrets set ANTHROPIC_API_KEY="sk-ant-..."   # opsional
   ```
5. Pasang dan buka:
   ```bash
   fly deploy
   fly open
   ```

Memperbarui setelah ada perubahan kode: `fly deploy` lagi. Datanya aman karena ada di volume.

`fly.toml` mengatur aplikasi supaya tidur saat tidak dipakai dan bangun saat ada yang membuka, jadi kunjungan pertama setelah lama sepi butuh beberapa detik.

## B. Railway

1. Di https://railway.app pilih **New Project → Deploy from GitHub repo**, lalu pilih repo `djournl`. Railway membangun dari `Dockerfile` secara otomatis.
2. Di layanan itu, tambahkan **Volume** dengan mount path `/app/data`.
3. Di tab **Variables**, isi `RESEND_API_KEY`, `EMAIL_FROM`, `TRUST_PROXY=1`, `PORT=3000`, dan (opsional) `ANTHROPIC_API_KEY`.
4. Di **Settings → Networking**, buat domain publik (port `3000`).

Setiap `git push` ke `main` akan memasang versi baru.

## C. Render

1. Di https://render.com pilih **New → Blueprint**, lalu pilih repo `djournl`. Render membaca `render.yaml`: satu layanan Docker dengan disk 1 GB di `/app/data`.
2. Saat diminta, isi `RESEND_API_KEY`, `EMAIL_FROM`, dan (opsional) `ANTHROPIC_API_KEY`.
3. Tunggu sampai statusnya *Live*, lalu buka alamat `onrender.com` yang diberikan.

Disk di Render butuh paket berbayar; `render.yaml` sudah memilih paket `starter`.

## D. VPS sendiri (Docker + Caddy)

Yang dibutuhkan: server Linux dengan Docker, dan sebuah domain yang record **A**-nya menunjuk ke IP server itu. Port 80 dan 443 harus terbuka.

```bash
git clone https://github.com/ffrizzyy/djournl.git
cd djournl
cp .env.example .env
```

Buka `.env`, lalu isi minimal:

```
DOMAIN=jurnal.contoh.com
RESEND_API_KEY=re_...
EMAIL_FROM=Djournl <no-reply@namadomain.com>
```

Jalankan:

```bash
docker compose -f docker-compose.prod.yml up -d --build
```

Caddy mengambil sertifikat HTTPS sendiri dan memperpanjangnya otomatis. Aplikasinya tidak dibuka langsung ke internet; hanya Caddy yang bisa menjangkaunya.

Memperbarui: `git pull`, lalu perintah `up -d --build` yang sama.

---

## Setelah terpasang

1. **Langsung buat akunmu.** Akun pertama dibuat lewat halaman daftar seperti biasa (dengan email dan kata sandi). Email itu yang nanti dipakai untuk masuk.
2. **Bagikan alamatnya** hanya ke orang yang kamu ajak. Minta mereka mendaftar dengan email masing-masing. Email belum diverifikasi oleh server, jadi pastikan alamatnya memang benar. Kalau tidak ingin ada orang asing mendaftar, set `ALLOW_SIGNUP=false` setelah semua orang masuk.
3. **Aktifkan verifikasi dua langkah dari Profil** kalau mau. Simpan 10 kode pemulihan yang muncul sekali itu di tempat aman; tanpa kode itu, pemilik server harus membantu membuka akun.
4. **Coba tombol Kamera.** Di HTTPS, kamera sekarang bisa menyala langsung di halaman, termasuk di ponsel.
5. **Kalau semua sudah mendaftar**, set `ALLOW_SIGNUP=false` supaya pendaftaran tertutup.

## Memindahkan catatan dari komputermu

Catatan yang sudah kamu tulis di `localhost` tidak ikut terpasang. Untuk membawanya:

1. Di Djournl lokal: **Riwayat → Cadangkan .json**.
2. Di Djournl yang sudah terpasang, masuk ke akunmu: **Riwayat → Pulihkan cadangan**, pilih file tadi.

Foto ikut di dalam file cadangan itu.

## Cadangan rutin

Database hidup di satu disk; kalau disk itu rusak atau terhapus, semuanya ikut hilang. Buat salinan berkala:

```bash
# Fly.io
fly ssh console -C "npm run backup"

# VPS
docker compose -f docker-compose.prod.yml exec djournl npm run backup
```

Perintah itu membuat salinan utuh di `data/backups/` yang aman dijalankan saat aplikasi sedang dipakai. Salinan itu masih di disk yang sama, jadi **unduh ke tempat lain** secara berkala (misalnya dengan `fly ssh sftp get` atau `docker cp`).

Setiap orang juga bisa mencadangkan jurnalnya sendiri lewat **Riwayat → Cadangkan .json**.

## Kalau ada yang lupa kata sandi

Yang masih bisa membuka emailnya bisa mengatur ulang sendiri lewat "Lupa kata sandi?" di halaman masuk: masukkan email akun (atau nama pengguna untuk akun lama), lalu buka tautan sekali pakai yang dikirim Resend. Tautannya berlaku 30 menit.

Kalau email tidak bisa diakses, atau pengiriman email belum dikonfigurasi, pemilik server bisa memberi kata sandi sementara:

```bash
# Fly.io
fly ssh console -C "npm run reset-password -- alamat@email.com"

# VPS
docker compose -f docker-compose.prod.yml exec djournl npm run reset-password -- alamat@email.com
```

Perintah itu juga menerima nama pengguna lama kalau akunnya belum punya email. Ia mencetak kata sandi sementara, mengeluarkan akun itu dari semua perangkat, dan **mematikan verifikasi dua langkah** kalau akun itu memakainya. Berikan kata sandinya ke pemilik akun, lalu minta ia menggantinya dan mengaktifkan lagi verifikasi dua langkah di halaman Profil. Di Railway, jalankan perintah yang sama lewat shell layanannya.

Kalau pemilik akun masih bisa masuk dengan kata sandi tetapi kehilangan authenticator, ia bisa memakai salah satu **kode pemulihan** di halaman masuk, lalu membuat kode baru atau mematikan 2FA dari Profil. Kode pemulihan hanya bisa dipakai sekali.

## Yang sudah dan belum diuji

- **Sudah:** image Docker dibangun dan dijalankan sungguhan (daftar, simpan catatan, unggah foto, cadangan, mati dengan bersih, data tetap ada setelah restart, health check sehat). Susunan VPS dengan Caddy dijalankan di `localhost`: HTTPS aktif dan HTTP dialihkan ke HTTPS.
- **Belum:** pemasangan sungguhan di Fly.io, Railway, dan Render. Berkas konfigurasinya ditulis mengikuti dokumentasi tiap platform tapi belum pernah dijalankan di sana, jadi langkah di dashboard bisa sedikit berbeda dari yang tertulis.
