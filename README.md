# Bingkai Bisu - Fixlens Festival 2026 | Sistem E-Ticketing

Sistem Single Page Application (SPA) responsif, modern, dan estetik untuk pameran foto jurnalistik **"Bingkai Bisu - Fixlens Festival 2026"**.

---

## 🎨 Tampilan & Fitur Sistem

### 1. Portal Publik (`index.html`)
- **Hero & Identitas Acara**:
  - Logo Acara: `asset/LOGO_BINGKAI_BISU.png`
  - Logo Penyelenggara: `asset/LOGO_FIXFEST_TEKS_BAWAH_PUTIH.png`
  - Tanggal: 29 - 30 November 2026
  - Lokasi: Hetero Space Banyumas
  - Pass: 2 Day Pass (All Access)
- **Live Ticket Mockup**: Refleksi visual tiket fisik dengan nomor seri unik `#BB26-PASS`, nama pemesan dinamis, dan kotak QR code kuning.
- **Form Pemesanan (Step 1)**:
  - Varian 1: *2 Day Pass - Regular* (Rp 50.000)
  - Varian 2: *2 Day Pass + Special Treat* (Rp 60.000, Include Free 1 Cup Kopi Susu Gula Aren)
  - Stepper jumlah tiket (min 1).
  - Input Nama Lengkap & Nomor WhatsApp aktif.
- **Pembayaran QRIS & Bukti Transfer (Step 2)**:
  - Ringkasan tagihan otomatis.
  - Gambar QRIS pembayaran dari `asset/qris.jpeg`.
  - Area drag-and-drop file uploader dengan konversi otomatis ke Base64 murni.
  - Tombol submit dengan indikator loading spinner.
- **Tab Cek Status & Unduh Tiket**:
  - Cek instan via verifikasi ganda (Nomor WhatsApp + Nama Lengkap).
  - Menampilkan status **PENDING** jika menunggu verifikasi panitia.
  - Menampilkan kartu tiket resmi dan tombol hijau **"Unduh E-Ticket (PDF)"** jika **APPROVED**.
  - Tombol Bantuan CS WhatsApp: `https://wa.me/6281285589413`.

---

### 2. Dashboard Admin Panitia (`admin.html`)
- **Proteksi PIN Keamanan**:
  - Modal login PIN saat pertama kali dibuka.
  - **PIN Default**: `2026`
  - Sesi tersimpan di `sessionStorage` dengan opsi kunci/logout.
- **Tabel Verifikasi Pembayaran**:
  - Menampilkan seluruh antrean pemesanan berstatus `PENDING`.
  - Kolom lengkap: Nomor, Waktu Masuk, Nama, WhatsApp (link direct chat), Varian & Qty, Total Bayar, dan tombol *"🔍 Lihat Struk"*.
  - **Modal Pratinjau Bukti**: Cek struk transfer secara instan dengan tombol ACC langsung.
  - Tombol **"✔ ACC & Terbitkan Tiket"**: Mengubah status pemesanan di Google Spreadsheet menjadi `APPROVED`.
  - Tombol **"Segarkan Data"** untuk sinkronisasi live data secara instan.

---

### 3. Gate Scanner PWA Offline (`scanner.html`)
- **PWA & Offline-First**:
  - Dapat di-install ke layar utama HP (Add to Home Screen) via `manifest.json`.
  - Aset dicache secara offline via `sw.js` (Cache-First strategy).
- **Fitur Utama**:
  - Indikator status internet: Badge Hijau ("ONLINE") / Badge Merah ("OFFLINE").
  - Database HP: Menampilkan jumlah tiket offline tersimpan.
  - Counter Check-in: Menghitung pengunjung yang sudah masuk.
  - Pemindai Kamera QR (HTML5-QRCode) dengan switch kamera depan/belakang & fallback input manual.
  - **Validasi Tiket**:
    - 🟢 **HIJAU**: Check-in Berhasil (Belum pernah masuk + nada beep sukses).
    - 🟡 **KUNING**: Tiket Sudah Digunakan (Pernah masuk + waktu scan pertama).
    - 🔴 **MERAH**: Kode Tiket Tidak Valid / Belum Terdaftar.
  - **Sinkronisasi**:
    - Tombol *"📥 Unduh Database Tiket"*: Mengunduh daftar tiket approved ke `localStorage`.
    - Tombol *"☁️ Sinkronkan Hasil Scan ke Cloud"*: Mengunggah status check-in offline ke Google Sheets.

---

## 🌐 Endpoint Backend Google Apps Script
```javascript
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwRMLG227dO9VkqJh__-Prb6HGw_t1JMY14FLLeQHO6kMwq5jlClzXlkMTfMYOh31zw/exec";
```

---

## 📂 Struktur Berkas Proyek
```
tiketdigital/
├── index.html        # Portal publik pemesanan & cek tiket
├── admin.html        # Dashboard verifikasi panitia (PIN: 2026)
├── scanner.html      # Gate Scanner PWA Offline
├── manifest.json     # PWA Web App Manifest
├── sw.js             # Service Worker (Cache-First)
├── Code.gs           # Backend Google Apps Script
├── README.md         # Dokumentasi sistem
└── asset/
    ├── LOGO_BINGKAI_BISU.png
    ├── LOGO_FIXFEST_TEKS_BAWAH_PUTIH.png
    └── qris.jpeg
```
