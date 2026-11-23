# Pemulihan ke server baru

Panduan ini dipakai kalau VPS lama (srv2045269, 31.97.109.199) hilang dan aplikasi harus dipindah ke server baru dari backup di laptop. Satu VPS menjalankan dua aplikasi:

| Aplikasi | Domain | Folder di server | Backup di laptop |
|---|---|---|---|
| LMS Harmoni | musicclass.tech | `/opt/harmoni` | `~/harmoni-backups/harian/harmoni-lms/` |
| Harmoni Gitar | harmoniclass.tech | `/opt/harmoni-gitar` | `~/harmoni-backups/harian/harmoni-gitar/` |

Pakai cara ini hanya kalau VPS lama **tidak bisa kembali**. Kalau VPS lama hidup lagi, datanya lebih baru daripada backup, jadi jangan dipulihkan.

## Yang hilang dan yang aman

- **Aman:** semua akun, kelas, materi, soal, kuis, nilai, pengerjaan siswa, skor latihan, dan file upload sampai waktu backup terakhir. Kode ada di GitHub.
- **Hilang:** semua perubahan setelah backup terakhir. Backup harian dibuat pukul 02.30 WIB (LMS) dan 02.00 WIB (Gitar). Nama filenya memakai jam server (UTC), jadi `…-2026-11-20-1930` artinya 21 November pukul 02.30 WIB.
- **Harus diisi ulang:** file `.env.docker` produksi hanya ada di VPS lama. Server baru memakai kunci rahasia baru, sehingga:
  - semua pengguna perlu masuk lagi;
  - **API key AI yang disimpan di aplikasi** (milik setiap guru, dan pengaturan AI Super Admin) tidak bisa dibaca lagi, jadi harus dimasukkan ulang di **Pengaturan AI**. Password pengguna **tidak** terpengaruh;
  - login Google (Client ID/Secret), SMTP, dan login Claude Code di server perlu diisi atau dilakukan lagi.

## 1. Siapkan server baru

1. Beli atau aktifkan VPS (Ubuntu 22.04/24.04, minimal 2 GB RAM). Catat IP-nya.
2. Pasang kunci SSH laptop ke server, lalu pastikan bisa masuk tanpa password:
   ```bash
   ssh-copy-id -i ~/.ssh/id_ed25519.pub root@IP-BARU
   ssh root@IP-BARU 'echo ok'
   ```

## 2. Pasang Docker dan atur jaringan Docker

Jalankan di server (`ssh root@IP-BARU`):

```bash
curl -fsSL https://get.docker.com | sh
# Harmoni Gitar diteruskan Caddy ke 172.16.0.1:3001 (alamat jembatan docker0 di VPS lama).
# Samakan di server baru supaya Caddyfile dan konfigurasi Gitar tidak perlu diubah:
echo '{ "bip": "172.16.0.1/24" }' > /etc/docker/daemon.json
systemctl restart docker
ip -4 addr show docker0 | grep inet     # harus 172.16.0.1
```

## 3. Arahkan domain ke server baru

Di pengelola DNS (hPanel Hostinger → Domain → DNS), ubah record **A** untuk `musicclass.tech`, `www.musicclass.tech`, `harmoniclass.tech`, dan `www.harmoniclass.tech` ke **IP baru**.

Perubahan DNS bisa butuh beberapa menit sampai beberapa jam. HTTPS dari Caddy baru aktif setelah domain mengarah ke server baru; sebelum itu Caddy terus mencoba ulang sendiri.

## 4. Pulihkan LMS Harmoni

Di laptop:

```bash
cd ~/projects/LMS_Harmoni
# Arahkan ke server baru:
sed -i 's/^VPS_HOST=.*/VPS_HOST=root@IP-BARU/' .deploy.env
./restore.sh
```

`restore.sh` memakai backup terbaru dan meminta konfirmasi dulu. Langkahnya:

1. memeriksa file backup;
2. mengirim kode ke `/opt/harmoni`;
3. membuat `.env.docker` dengan kunci rahasia baru (kalau belum ada);
4. menyalakan database dan memulihkan isinya. Skrip **menolak** kalau database di server sudah berisi, supaya data tidak tertimpa;
5. build dan menyalakan aplikasi lewat `./deploy.sh`. Commit perubahan lokal dulu, karena deploy hanya menerima kode yang sudah di-commit;
6. mengembalikan file upload;
7. memasang backup harian otomatis di server.

Kalau ingin memakai backup tertentu: `./restore.sh <file-db.sql.gz> <file-uploads.tar.gz>`.

## 5. Pulihkan Harmoni Gitar

Di laptop:

```bash
cd ~/projects/Harmoni_Gitar
sed -i 's/^VPS_HOST=.*/VPS_HOST=root@IP-BARU/' .deploy.env
B=~/harmoni-backups/harian/harmoni-gitar
DB=$(ls -1t $B/harmoni-gitar-db-*.sql.gz | head -1)
UP=$(ls -1t $B/harmoni-gitar-uploads-*.tar.gz | head -1)
scp "$DB" root@IP-BARU:/root/gitar-db.sql.gz
scp "$UP" root@IP-BARU:/root/gitar-uploads.tar.gz
rsync -az --exclude node_modules --exclude .next --exclude uploads --exclude backups \
  --exclude .env.local --exclude .env.docker --exclude .deploy.env --exclude .git \
  ./ root@IP-BARU:/opt/harmoni-gitar/
```

Lalu di server (`ssh root@IP-BARU`):

```bash
cd /opt/harmoni-gitar
umask 077
cat > .env.docker <<EOF
POSTGRES_PASSWORD=$(openssl rand -hex 24)
BETTER_AUTH_SECRET=$(openssl rand -base64 32)
BETTER_AUTH_URL=https://harmoniclass.tech
APP_PORT=3001
DB_PORT=5433
EOF
C="docker compose --env-file .env.docker -f docker-compose.yml -f docker-compose.vps.yml"
$C up -d db
sleep 15   # tunggu database baru siap (menyala, mati sebentar, lalu menyala lagi)
gunzip -c /root/gitar-db.sql.gz | $C exec -T db psql -q -U harmoni-gitar -d harmoni_gitar -v ON_ERROR_STOP=1
$C up -d --build
$C exec -T -u 0 app sh -c 'tar -xzf - -C /data && chown -R 1001:1001 /data/uploads' < /root/gitar-uploads.tar.gz
mkdir -p /opt/harmoni-gitar/backups
echo "0 19 * * * root /opt/harmoni-gitar/scripts/backup.sh >> /opt/harmoni-gitar/backups/backup.log 2>&1" > /etc/cron.d/harmoni-gitar-backup
rm /root/gitar-db.sql.gz /root/gitar-uploads.tar.gz
```

Kalau `psql` mengeluh database sedang menyala atau dimatikan, tunggu beberapa detik lalu ulangi baris `gunzip …`.

## 6. Periksa setelah pemulihan

- [ ] https://musicclass.tech dan https://harmoniclass.tech terbuka dengan HTTPS (gembok).
- [ ] Super Admin bisa masuk. Di **Kelola Guru**, guru dan jumlah kelas/siswanya sesuai.
- [ ] Buka satu kuis: daftar siswa yang sudah mengerjakan dan nilainya muncul.
- [ ] Gambar, audio, dan video di materi bisa dibuka (file upload kembali).
- [ ] **Pengaturan AI:** Super Admin memasukkan ulang API key server. Beri tahu para guru untuk memasukkan ulang API key mereka.
- [ ] Kalau memakai Claude Code di server: login lagi dengan `./claude-login.sh` dari laptop (membaca `.deploy.env`, jadi sudah mengarah ke server baru).
- [ ] Kalau memakai login Google atau email reset password: isi `GOOGLE_CLIENT_ID`/`GOOGLE_CLIENT_SECRET` dan `SMTP_*` di `/opt/harmoni/.env.docker`, lalu jalankan `./deploy.sh` lagi. Di Google Cloud Console, alamat redirect tetap `https://musicclass.tech/api/auth/callback/google`, jadi tidak perlu diubah.
- [ ] Backup harian berjalan: besok pagi cek `/var/backups/harmoni-lms/backup.log` dan `/opt/harmoni-gitar/backups/backup.log`.
- [ ] Penarikan backup ke laptop berjalan lagi (`~/harmoni-backups/harian/pull.log`). Penarikan ini membaca `VPS_HOST` di `~/projects/Harmoni_Gitar/.deploy.env`, yang sudah diubah di langkah 5.
