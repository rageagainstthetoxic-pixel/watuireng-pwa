# Watuireng Poultry — Sistem Input Harian Hybrid (PWA + GAS)

Aplikasi Web & Progressive Web App (PWA) untuk pencatatan harian peternakan ayam layer Watuireng. Menggunakan arsitektur hybrid:
- Backend: Google Apps Script (`Code.gs`) sebagai REST JSON API aman yang mem-posting data secara presisi ke 7 file master Google Sheets tanpa pernah menimpa sel berumus.
- Frontend: Hosting statis (Vercel / GitHub Pages) dengan desain sistem **Plus UI** yang bersih, profesional, bebas emoji, dan dilengkapi kapabilitas **Offline PWA** (IndexedDB).

---

## Fitur & Keunggulan Sistem

1. **Desain Sistem Plus UI (Bersih, Rapi & Bebas Emoji)**:
   - Mengadopsi palet warna Slate dan Emerald khas Plus UI yang modern, berwibawa, dan kontras tinggi.
   - Menggunakan ikon vektor SVG murni tanpa emoji di seluruh antarmuka.
   - Tipografi Plus Jakarta Sans dengan tata letak informasi yang lapang dan mudah dipahami.
2. **Alur Kerja Khusus 1 Petugas Input (Fokus & Bebas Gangguan)**:
   - Disesuaikan dengan kenyataan lapangan di mana hanya ada 1 operator/admin yang bertugas menginput data, sedangkan pekerja lain bertugas fisik di kandang.
   - Menghilangkan tombol pemilih multi-petugas yang tidak perlu; nama petugas terpasang rapi di bilah status atas.
3. **100% Offline-First (Penyimpanan di Perangkat)**:
   - Data yang diinput di area tanpa sinyal tersimpan aman di IndexedDB perangkat. Begitu mendeteksi jaringan, sistem otomatis mengirimkan data ke Google Sheets.
4. **Ergonomi Input Cepat**:
   - Stepper tombol besar dan chip angka cepat (`+1 Krat (15 kg)`, `+2 Krat (30 kg)`, `+1.000 Butir`, `0 (Nihil)`).
   - Dikte suara berbahasa Indonesia via Web Speech API untuk kolom catatan keterangan.
   - Kartu ringkasan berat telur otomatis (`kg` total dan `gram/butir`) dengan evaluasi status (Normal / Kecil / Jumbo / Tidak Wajar).
5. **CORS Bebas Masalah & Keamanan Token API**:
   - Menggunakan transport JSON berbasis `text/plain` dari frontend untuk menghindari preflight `OPTIONS` pada Google Apps Script.
   - Dilindungi API Token rahasia yang dikelola langsung lewat menu master spreadsheet.

---

## 📋 Langkah Pasang & Deployment

### Bagian 1: Backend (Google Apps Script)
1. Buka spreadsheet master **"Input Harian Watuireng"**.
2. Buka menu **Extensions ▸ Apps Script**.
3. Pastikan file script berisi:
   - `Code.gs`: Berisi kode backend API & logika posting ke 7 file sheets.
   - `appsscript.json`: Pastikan `"access": "ANYONE"` agar petugas tanpa akun Google bisa mengakses API.
4. Kembali ke spreadsheet master dan refresh halaman:
   - Jalankan menu **Watuireng ▸ 1. Setup awal**.
   - Isi kolom C pada sheet `CONFIG` dengan link/ID dari 7 file Google Sheets target.
   - Jalankan menu **Watuireng ▸ 2. Cek koneksi file** (semua harus bertanda ✓).
   - Jalankan menu **Watuireng ▸ 3. Atur API Token (untuk Vercel/PWA)** lalu masukkan token rahasia (contoh: `watuireng-secret-2026`).
5. Lakukan Deployment Web App:
   - Klik **Deploy ▸ New deployment**.
   - Pilih jenis: **Web app**.
   - **Execute as**: `Me` (Akun pemilik spreadsheet).
   - **Who has access**: `Anyone`.
   - Klik **Deploy**, lalu salin **Web app URL** (yang berakhiran `/exec`).

---

### Bagian 2: Frontend (Deploy ke Vercel atau GitHub Pages)

Repo ini siap dideploy langsung sebagai situs statis:

#### Opsi A: Deploy ke Vercel (Rekomendasi - 1 Menit)
1. Upload folder ini ke repository GitHub Anda (atau import langsung di dashboard [vercel.com](https://vercel.com)).
2. Pilih Framework Preset: **Other** (atau biarkan default, file `vercel.json` sudah terkonfigurasi).
3. Klik **Deploy**.
4. Website PWA Anda akan aktif di URL seperti `https://watuireng.vercel.app`.

#### Opsi B: Deploy ke GitHub Pages
1. Push repository ini ke GitHub.
2. Buka **Settings ▸ Pages ▸ Source: Deploy from a branch ▸ main / (root)**.
3. Website PWA Anda akan aktif di `https://username.github.io/repository`.

---

### Bagian 3: Hubungkan Aplikasi ke HP Petugas

1. Buka aplikasi yang sudah ter-deploy di browser HP.
2. Buka menu **Setelan (ikon roda gigi di pojok kanan atas atau bawah)**:
   - Masukkan **Google Apps Script Web App URL**.
   - Masukkan **API Token** yang dibuat pada Langkah 1.
   - Klik **Simpan Pengaturan**, lalu klik **Tes Koneksi Server** (akan muncul respon waktu latensi dalam milidetik).
3. **Membagikan Link Instan ke Petugas**:
   - Di menu Setelan, klik **"Salin Link Konfigurasi Otomatis (WhatsApp)"**.
   - Kirimkan link tersebut ke grup WhatsApp pekerja peternakan.
   - Saat petugas mengklik link tersebut, HP mereka akan **otomatis terkonfigurasi** tanpa perlu mengisi URL atau Token lagi!
4. **Pasang sebagai Aplikasi HP (PWA)**:
   - Di Android (Chrome): Ketuk menu titik tiga ▸ **Tambahkan ke Layar Utama** (*Add to Home Screen*).
   - Di iOS (Safari): Ketuk tombol Share ▸ **Add to Home Screen**.

---

## 📑 7 Tab Input & Alur Pencatatan

| Tab Form | Data yang Dicatat | Sheet Tujuan |
|---|---|---|
| **Harian Kandang** | Deplesi, Butir telur, Kg Bagus, Putih, Bucek, Pakan keluar, Obat keluar, Biaya operasional | `RECORDING_LAYER_K1/K2/K3`, `RECAP_TELUR`, `STOK_PAKAN`, `DATA_OBAT_KANDANG` |
| **Stok & Kirim Telur** | Kirim armada, Bawa Mas Aji, Penjualan kandang, Sisa kotak 15kg/10kg | `STOK TELUR` |
| **Pakan Masuk** | Faktur nota pakan, supplier, kg masuk, harga, diskon | `NOTA PAKAN`, `STOK_PAKAN` |
| **Obat Masuk** | Faktur obat, jatuh tempo, qty masuk, supplier, PPN, diskon | `FAKTUR`, `STOK OBAT` |
| **Kas Operasional** | Kas masuk / kas keluar, nominal, kategori, sub, metode bayar | `KAS OPERASIONAL` |
| **Jual Telur** | Penjualan telur bagus, putih, bucek, plastik, lap. uang telur | `PENJUALAN TELUR`, `LAPORAN UANG TELUR` |
| **Jual Lain** | Penjualan sak karung, ayam afkir, belek pupuk kandang | `PENJUALAN SAK`, `PENJUALAN AYAM AFKIR`, `PENJUALAN BELEK` |

---

## 🛡️ Jaminan Integritas Data & Anti-Dobel

- **UUID Idempotent**: Setiap input lokal diberikan ID acak unik (`wtu_...`). Jika sinyal terputus saat mengirim dan petugas menekan kirim ulang, server mendeteksi ID tersebut dan tidak akan membuat baris ganda di spreadsheet.
- **Formula Protection**: Seluruh kolom rumus spreadsheet (`Total`, `Sisa`, `Persentase`, formula tanggal) diproteksi dan tidak pernah ditimpa oleh skrip.
- **Mode Koreksi Otomatis**: Jika tanggal & kandang yang sama dibuka kembali, form otomatis memuat data sebelumnya dengan penanda visual **"Mode Koreksi Data"**.
