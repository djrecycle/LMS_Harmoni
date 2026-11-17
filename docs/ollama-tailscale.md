# Ollama di laptop, dipakai aplikasi di VPS (lewat Tailscale)

Aplikasi di VPS memanggil Ollama dari **server**, jadi `http://localhost:11434` di Pengaturan AI berarti Ollama di dalam container VPS, bukan di laptop. Tailscale membuat jaringan pribadi antara VPS dan laptop tanpa membuka Ollama ke internet.

Ollama hanya bisa dipakai **selama laptop menyala dan online**, dan hanya oleh Super Admin.

## Langkah 1 — di laptop (direktori bebas, sebaiknya terminal biasa)

```bash
curl -fsSL https://tailscale.com/install.sh | sh
sudo tailscale up          # buka tautan login yang muncul, masuk dengan akun Google/GitHub
tailscale ip -4            # catat alamatnya: 100.x.y.z
```

Buka Ollama hanya ke jaringan Tailscale (Ollama tetap mendengarkan di 127.0.0.1, tidak terbuka ke WiFi/internet):

```bash
sudo tailscale serve --bg --tcp 11434 tcp://localhost:11434
```

> Bila versi Tailscale menolak perintah `serve` ini, cara cadangan: jalankan Ollama di semua alamat
> (`sudo systemctl edit ollama` → `[Service]` `Environment="OLLAMA_HOST=0.0.0.0:11434"` → `sudo systemctl restart ollama`)
> dan batasi port 11434 dengan firewall agar hanya bisa diakses dari antarmuka `tailscale0`.

## Langkah 2 — di VPS

```bash
ssh root@31.97.109.199
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up               # login dengan AKUN TAILSCALE YANG SAMA
```

Uji dari dalam container aplikasi (harus di `/opt/harmoni`; ganti `100.x.y.z` dengan alamat laptop):

```bash
cd /opt/harmoni
docker compose --env-file .env.docker exec app node -e "fetch('http://100.x.y.z:11434/api/tags').then(r=>r.text()).then(console.log)"
```

Bila berhasil, keluar daftar model (mis. `granite3.2-vision:2b`).

## Langkah 3 — di aplikasi

Pengaturan AI → bagian **Ollama**:

1. **Alamat server**: `http://100.x.y.z:11434`
2. Pilih model dari daftar.
3. Klik **Tes koneksi**.

## Catatan

- Saat laptop mati, Ollama tampil "tidak tersedia"; pilihan **Otomatis** memakai Ollama paling akhir, jadi provider lain tetap jalan.
- Model kecil seperti `granite3.2-vision:2b` bisa membaca foto, tetapi hasil untuk Modul Ajar atau soal panjang jauh di bawah Gemini atau Claude.
- Ollama di VPS itu sendiri (bukan laptop): alamatnya `http://host.docker.internal:11434`, dan Ollama di VPS harus mendengarkan di `0.0.0.0`.
