---
name: cmps
description: Commit dan push semua perubahan di repo LMS_Harmoni ke origin/main. Hanya dijalankan saat pengguna mengetik /cmps.
disable-model-invocation: true
---

# /cmps — commit & push LMS_Harmoni

Jalankan semua langkah di folder proyek ini saja (`/home/rraangga/projects/LMS_Harmoni`); jangan commit di repo lain.

1. Lihat apa yang akan masuk: `git status --short` dan `git diff --stat`.
   - Tidak ada perubahan dan tidak ada commit yang belum di-push (`git status -sb` tidak menunjukkan `ahead`): beri tahu pengguna bahwa tidak ada yang perlu di-commit, lalu berhenti.
   - Ada commit lokal yang belum di-push tetapi tidak ada perubahan baru: langsung ke langkah 5.
2. Periksa sebelum commit:
   - Jangan ikutkan rahasia atau file lokal: `.env*`, `.deploy.env`, `uploads/`, `data/`, file sementara (mis. `scripts/_tmp_*`). Bila ada, keluarkan dari staging dan sebutkan ke pengguna.
   - Jalankan `npx tsc --noEmit`. Bila gagal, jangan commit: tampilkan errornya dan tanyakan apakah perlu diperbaiki dulu.
3. `git add -A` (setelah memastikan langkah 2).
4. Commit dengan pesan berbahasa Indonesia, gaya yang sama dengan riwayat repo (`git log --oneline -5`):
   - Baris pertama: ringkasan singkat perubahan (mis. "Ujian: tulis ulang satu soal dengan AI").
   - Lalu baris kosong dan beberapa butir `- ...` yang menjelaskan apa yang berubah.
   - Akhiri dengan baris atribusi commit yang diminta harness (Co-Authored-By) bila ada.
   - Kirim pesan lewat heredoc (`git commit -F - <<'EOF' ... EOF`) agar format terjaga.
5. `git push` ke `origin main`. Bila ditolak karena remote lebih baru, jangan force-push: laporkan ke pengguna dan tanyakan langkah berikutnya.
6. Laporkan singkat: hash commit, ringkasannya, dan bahwa sudah di-push. Ingatkan bahwa deploy dijalankan pengguna sendiri dari laptop:
   ```
   cd ~/projects/LMS_Harmoni
   ./deploy.sh
   ```
   Sebutkan bila commit ini memuat migrasi baru di `drizzle/` (berjalan otomatis saat container start, AUTO_MIGRATE=1).
