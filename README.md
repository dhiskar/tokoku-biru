# TokoKu — Kasir & Pembukuan Toko Kelontong

Aplikasi web untuk toko kelontong (kelontong, pulsa, paket data, transfer) yang
berjalan di laptop dan HP Android. Menampilkan laba/rugi (omzet, HPP, biaya
operasional, laba bersih) dan kasbon pelanggan. Data tersimpan di Firebase
Firestore per akun pengguna, bisa offline, dan bisa dipasang sebagai aplikasi
(PWA).

- URL produksi: https://tokoku-biru.web.app
- Project Firebase: `tokoku-biru`
- GitHub: https://github.com/dhiskar/tokoku-biru

## Fitur utama

- Kasir (POS) produk + layanan digital (pulsa, data, token listrik, transfer, e-wallet)
- Stok otomatis berkurang saat penjualan; restok tercatat terpisah (tidak double count)
- Riwayat transaksi, detail, cetak nota thermal 58/80mm, kirim WA
- Kasbon & pelanggan, cicilan, pengingat jatuh tempo
- Pengeluaran operasional (listrik, sewa, gaji, transport, dll.)
- Laporan: omzet, HPP, biaya, laba bersih, arus kas, produk terlaris, grafik
- Dashboard dengan target laba bulanan
- Cadangan data (ekspor/impor JSON), muat/hapus data contoh, reset data
- Pengaturan profil toko, tema, nota, akun
- Offline-first (Firestore persistent cache) + sinkronisasi otomatis

## Teknologi

- Vanilla JavaScript ES modules, tanpa build step
- Firebase v13.2.0 (Auth, Firestore, Hosting) via CDN
- Service Worker (app shell cache) + Web App Manifest (PWA)

## Menjalankan lokal

Tidak perlu build. Cukup static server dari folder `public`:

```sh
cd tokoku/public
npx serve .   # atau python -m http.server 5173
```

Lalu buka http://localhost:5173.

> Firebase Auth memerlukan origin yang diizinkan. Pastikan `localhost` dan domain
> Hosting sudah masuk daftar Authorized domains pada project `tokoku-biru`.

## Melanjutkan pekerjaan di laptop lain

Pasang Git, Node.js, dan Firebase CLI, lalu clone repository:

```sh
git clone https://github.com/dhiskar/tokoku-biru.git
cd tokoku-biru
npm i -g firebase-tools
firebase login
```

Konfigurasi Firebase web sudah tersedia di `public/firebase-config.js`.
Setelah mengedit aplikasi, simpan dan kirim perubahan ke GitHub:

```sh
git add .
git commit -m "Jelaskan perubahan"
git push
```

Untuk menerbitkan perubahan ke Firebase Hosting:

```sh
firebase deploy --only hosting --project tokoku-biru
```

## Setup Firebase (Firebase Console)

1. Buka https://console.firebase.google.com/ dan pilih project `tokoku-biru`.
2. **Authentication → Sign-in method**: aktifkan **Email/Password**.
   (Google sign-in opsional — set `googleSignIn: true` di `firebase-config.js`
   setelah provider diaktifkan.)
3. **Authentication → Settings → Authorized domains**: tambahkan domain hosting
   Anda (`tokoku-biru.web.app`) dan `localhost`.
4. **Firestore Database**: buat database (mode production). Aturan keamanan ada di
   `firestore.rules` — setiap pengguna hanya bisa akses data di bawah
   `users/{uid}`.
5. **Hosting**: site default `tokoku-biru` digunakan untuk deploy aplikasi.

## Deploy dengan Firebase CLI

```sh
npm i -g firebase-tools
firebase login
cd tokoku

# Deploy rules + hosting
firebase deploy --only firestore:rules --project tokoku-biru
firebase deploy --only hosting --project tokoku-biru
```

Untuk menambah site Hosting lain:

```sh
firebase hosting:sites:create nama-site
```

lalu ubah `site` di `firebase.json` dan deploy ulang.

## Konfigurasi aplikasi

Edit `public/firebase-config.js`:

```js
window.FIREBASE_CONFIG = {
  apiKey: "...",
  authDomain: "...",
  projectId: "...",
  storageBucket: "...",
  messagingSenderId: "...",
  appId: "...",
  googleSignIn: false
};
window.APP_INFO = { name: "TokoKu", version: "1.0.0", site: "tokoku-kelontong.web.app" };
```

## Struktur data (Firestore)

```
users/{uid}/settings/store          # profil toko, nota, target
users/{uid}/products/{id}
users/{uid}/transactions/{id}
users/{uid}/expenses/{id}
users/{uid}/customers/{id}
users/{uid}/debts/{id}
users/{uid}/purchases/{id}
```

## Cadangan & pemulihan

- Ekspor: Pengaturan → Data & cadangan → Ekspor semua data (file JSON).
- Impor: pilih file cadangan TokoKu (mengganti seluruh data).
- Reset: hapus semua data toko (profil toko tetap).
- Data contoh: muat/hapus data demo yang ditandai `source: 'demo'`.

## Offline & PWA

- Firestore menggunakan `persistentLocalCache` + `persistentMultipleTabManager`.
- Penjualan memakai batched write (bukan transaction) agar tetap berfungsi offline.
- Service worker menyimpan app shell; saat offline, aplikasi tetap bisa dibuka.
- Pasang ke layar utama lewat browser (Chrome/Edge) atau tombol "Pasang".

## Troubleshooting

- **Login gagal di domain baru**: pastikan domain sudah masuk Authorized domains.
- **Data tidak sinkron**: cek koneksi; Firestore akan menyinkronkan otomatis saat online.
- **Cache lama setelah deploy**: service worker memakai version string. Naikkan
  `VERSION` di `public/sw.js` lalu deploy ulang.
- **Nota tidak tercetak**: pastikan printer thermal terpasang dan pilih ukuran kertas
  (58/80mm) di Pengaturan → Nota.
- **Profit negatif pada demo**: data contoh diprorata sesuai bulan berjalan; muat ulang
  data contoh setelah reset.

## Lisensi

Dibuat untuk penggunaan toko kecil Indonesia. Silakan dimodifikasi sesuai kebutuhan.
EOF