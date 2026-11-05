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
  - Cek instan via nomor WhatsApp.
  - Menampilkan status **PENDING** jika menunggu verifikasi panitia.
  - Menampilkan kartu tiket resmi dan tombol hijau **"Unduh E-Ticket (PDF)"** yang membuka link `linkPdf` di tab baru jika **APPROVED**.
  - Tombol Bantuan CS WhatsApp: `https://wa.me/6281285589413`.

---

### 2. Dashboard Admin Panitia (`admin.html`)
- **Proteksi PIN Keamanan**:
  - Modal login PIN saat pertama kali dibuka.
  - **PIN Default**: `2026`
  - Sesi tersimpan di `sessionStorage` dengan opsi kunci/logout.
- **Tabel Verifikasi Pembayaran**:
  - Menampilkan seluruh antrean pemesanan berstatus `PENDING`.
  - Kolom lengkap: Nomor, Waktu Masuk, Nama, WhatsApp (link direct chat), Varian & Qty, Total Bayar, dan tautan bukti transfer `Lihat Struk ↗`.
  - Tombol **"✔ ACC & Terbitkan"**: Langsung mengubah status pemesanan di Google Spreadsheet menjadi `APPROVED` dan menerbitkan akses unduh E-Ticket PDF bagi peserta.
  - Tombol **"Segarkan Data"** untuk sinkronisasi live data secara instan.

---

## 🌐 Endpoint Backend Google Apps Script
```javascript
const SCRIPT_URL = "https://script.google.com/macros/s/AKfycbxXvOR1OG8aFXSg7yoQ1TcyAZNRqGOiq2PeB-l9_X3arDJ6P0kbhaog3gNhIlMF6edC/exec";
```

---

## 📂 Struktur Berkas Proyek
```
tiketdigital/
├── index.html        # Portal publik pemesanan & cek tiket
├── admin.html        # Dashboard verifikasi panitia (PIN: 2026)
├── Code.gs           # Backend Google Apps Script
├── README.md         # Dokumentasi sistem
└── asset/
    ├── LOGO_BINGKAI_BISU.png
    ├── LOGO_FIXFEST_TEKS_BAWAH_PUTIH.png
    └── qris.jpeg
```
