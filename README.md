# PEMILUSYSTEM — Pemilu OSIS Digital (Vercel + Supabase Realtime + Google Sheets Sync)

Aplikasi Pemilihan Umum OSIS Digital berbasis Web yang modern, aman, ultra-cepat (< 10ms), dan siap digunakan untuk pemilu onsite multi-station paralel.

Sistem ini mendukung **dua metode deployment**:
1. **🚀 Vercel + Supabase Realtime + Google Sheets API (Rekomendasi Utama - Instan < 10ms)**
2. **📄 Google Apps Script Iframe (Metode Klasik Google Drive)**

---

## 🌟 Arsitektur & Teknologi

* **Frontend**: HTML5, CSS3 (Custom HSL Dark/Light Glassmorphism), Pure SVG Pie/Donut Chart Generator, Web Audio API Alarm & Sound Synthesis, GFM Print PDF Report Export.
* **Realtime Engine**: Supabase PostgreSQL + Realtime WebSockets (`postgres_changes` event channel).
* **Backup & Storage**: Google Sheets API v4 via `googleapis` Node.js package (Otomatis Sync ke Google Drive).
* **Hosting**: Vercel Serverless Functions / Node.js Runtime (100% Gratis di Vercel Hobby Plan).

---

## 📁 Struktur Proyek Vercel

```
PEMILUSYSTEM/
├── api/                     # Vercel Serverless API Routes
│   ├── setup.js             # Skema SQL Supabase & Inisialisasi Google Sheets
│   ├── auth.js              # Login Admin & Verifikasi Sesi
│   ├── candidates.js        # CRUD Pasangan Calon & Upload Foto
│   ├── stations.js          # Kontrol Sesi Multi-Station (Lanjut Sesi, Hapus Bilik)
│   ├── vote.js              # Submit Vote (Instant Supabase + Async Google Sheets Sync)
│   ├── stats.js             # Live Count & Pie Chart Data Generator
│   └── status.js            # Kontrol Mulai, Stop, Reset, Jadwal
├── lib/                     # Server Modules
│   ├── supabase.js          # Helper Supabase Admin Client
│   └── googleSheets.js      # Helper Google Sheets API v4 Sync
├── public/                  # Asset Statis
├── vercel.json              # Konfigurasi Routing Vercel
├── package.json             # Dependensi Node.js (@supabase/supabase-js, googleapis)
├── Code.gs                  # Backend Fallback untuk Google Apps Script
├── Index.html               # Frontend Hybrid (WebSockets Supabase + GAS Fallback)
└── README.md                # Dokumentasi & Panduan Deployment
```

---

## 🚀 Panduan Deployment ke Vercel (Rekomendasi Utama)

### Langkah 1: Buat Project Supabase (Gratis 100%)
1. Buka [supabase.com](https://supabase.com) dan buat akun gratis.
2. Buat project baru, beri nama **`pemilu-osis`**.
3. Buka menu **Project Settings -> API**, salin `URL` dan `anon public key`.
4. Buka menu **SQL Editor**, jalankan perintah SQL berikut:

```sql
CREATE TABLE IF NOT EXISTS candidates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  number INT NOT NULL,
  chairman TEXT NOT NULL,
  vice TEXT NOT NULL,
  pair_image_url TEXT,
  active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS sessions (
  station_id TEXT PRIMARY KEY,
  status TEXT DEFAULT 'READY',
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS votes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  candidate_id TEXT NOT NULL,
  station_id TEXT NOT NULL,
  session_token TEXT DEFAULT 'NO_TOKEN',
  voted_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER PUBLICATION supabase_realtime ADD TABLE sessions;
```

---

### Langkah 2: Persiapan Google Sheets API Sync (Gratis)
1. Buka [Google Cloud Console](https://console.cloud.google.com).
2. Buat project baru, lalu aktifkan **Google Sheets API**.
3. Buat **Service Account**, lalu unduh JSON Key (dapatkan `client_email` dan `private_key`).
4. Buka file Google Sheets Anda di Google Drive.
5. Klik **Bagikan (Share)** -> Masukkan email Service Account tersebut sebagai **Editor**.
6. Salin Spreadsheet ID dari URL browser (teks acak di antara `/d/` dan `/edit`).

---

### Langkah 3: Deploy ke Vercel
1. Upload folder proyek ini ke GitHub atau langsung deploy via Vercel CLI (`vercel`).
2. Di Dashboard [vercel.com](https://vercel.com), buat Project Baru dari repo ini.
3. Di bagian **Environment Variables**, isi konfigurasi berikut:
   * `NEXT_PUBLIC_SUPABASE_URL` = `https://your-project.supabase.co`
   * `NEXT_PUBLIC_SUPABASE_ANON_KEY` = `your-supabase-anon-key`
   * `SUPABASE_SERVICE_ROLE_KEY` = `your-supabase-service-role-key`
   * `GOOGLE_SERVICE_ACCOUNT_EMAIL` = `pemilu-bot@your-gcp-project.iam.gserviceaccount.com`
   * `GOOGLE_PRIVATE_KEY` = `"-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"`
   * `SPREADSHEET_ID` = `your-spreadsheet-id-from-google-drive`
   * `ADMIN_PASSWORD` = `siriyadh2026`
4. Klik **Deploy**!

---

## 📄 Panduan Deployment ke Google Apps Script (Metode Klasik)

Jika Anda ingin menjalankan aplikasi secara 100% di dalam Google Drive tanpa Vercel:

1. Buka [script.google.com](https://script.google.com) dan buat proyek Apps Script baru.
2. Salin seluruh isi [Code.gs](file:///b:/PEMILUSYSTEM/Code.gs) ke file `Code.gs`.
3. Buat file HTML bernama `Index`, lalu salin seluruh isi [Index.html](file:///b:/PEMILUSYSTEM/Index.html).
4. Klik **Run -> setupSystem** untuk membuat sheet dan header otomatis.
5. Klik **Deploy -> New Deployment -> Web App** (Execute as: **Me**, Access: **Anyone**).
6. Salin URL Web App yang dihasilkan.

---

## 🔒 Otentikasi & Keamanan bawaan
- **Admin Password**: Default `siriyadh2026` (Dapat diubah via `ADMIN_PASSWORD` Environment Variable di Vercel).
- **Anti Double-Voting**: Dilengkapi *Client-Side Session Storage Lock* & *Backend Mutex Lock*.
