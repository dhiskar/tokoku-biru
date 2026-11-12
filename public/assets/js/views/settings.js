/* ==========================================================================
   TokoKu — Pengaturan toko, nota, dan data
   ========================================================================== */

import {
  esc, icon, fmtNum, fmtDate, initials, parseMoney, download, safeParse
} from '../utils.js';
import {
  state, saveStore, seedDemoData, clearDemoOnly, resetData, exportAllData,
  importAllData
} from '../store.js';
import { auth, fb } from '../firebase.js';
import {
  toast, confirmDialog, receiptPreview, printReceipt
} from '../ui.js';
import { pageHead } from './common.js';
import { navigate } from '../nav.js';

const SECTIONS = [
  { id: 'toko', label: 'Profil toko', icon: 'store' },
  { id: 'tampilan', label: 'Tampilan', icon: 'sun' },
  { id: 'nota', label: 'Nota & struk', icon: 'receipt' },
  { id: 'data', label: 'Data & cadangan', icon: 'database' },
  { id: 'akun', label: 'Akun', icon: 'user' }
];

const ui = { section: 'toko' };
let root = null;
let importInput = null;
let clickHandler = null;

function storeData() {
  return state.store || {};
}

function themeNow() {
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function sampleTransaction() {
  const existing = state.recent.find((tx) => !tx.voided);
  if (existing) return existing;
  return {
    invoice: 'INV-CONTOH-001',
    date: new Date(),
    items: [
      { name: 'Indomie Goreng', qty: 2, price: 3500, cost: 2800, unit: 'bungkus', emoji: '🍜', kind: 'product' },
      { name: 'Pulsa Telkomsel 10.000', qty: 1, price: 12000, cost: 10000, unit: 'transaksi', emoji: '📱', kind: 'digital', target: '0812xxxxxxx' }
    ],
    subtotal: 19000,
    discount: 0,
    total: 19000,
    cost: 15600,
    profit: 3400,
    paymentMethod: 'cash',
    cashReceived: 20000,
    change: 1000,
    customerName: '',
    cashier: (state.store && state.store.owner) || 'Pemilik Toko'
  };
}

function dataStats() {
  return [
    { label: 'Produk', value: state.products.length, icon: 'box' },
    { label: 'Transaksi', value: state.recent.length, icon: 'receipt' },
    { label: 'Pelanggan', value: state.customers.length, icon: 'users' },
    { label: 'Kasbon', value: state.debts.length, icon: 'wallet' },
    { label: 'Pengeluaran', value: state.expenses.length, icon: 'banknote' },
    { label: 'Restok', value: state.purchases.length, icon: 'package' }
  ];
}

/* ---------------- markup ---------------- */
function profilePanel() {
  const s = storeData();
  return `
    <div class="card settings-card" data-panel="toko">
      <div class="card-head">
        <div><h3>Profil toko</h3><p>Nama dan kontak ini tampil di nota serta halaman aplikasi.</p></div>
        <span class="badge green">${icon('check-circle')}Aktif</span>
      </div>
      <form class="card-body" id="store-form" novalidate>
        <div class="form-grid">
          <div class="field span-2">
            <label class="label" for="set-name">Nama toko <span class="req">*</span></label>
            <input class="input input-lg" id="set-name" value="${esc(s.name || '')}" maxlength="80" placeholder="Contoh: Toko Berkah Jaya" required>
          </div>
          <div class="field">
            <label class="label" for="set-owner">Nama pemilik</label>
            <input class="input" id="set-owner" value="${esc(s.owner || '')}" maxlength="80" placeholder="Nama Anda">
          </div>
          <div class="field">
            <label class="label" for="set-phone">No. HP toko</label>
            <input class="input" id="set-phone" type="tel" inputmode="tel" value="${esc(s.phone || '')}" maxlength="30" placeholder="08xxxxxxxxxx">
          </div>
          <div class="field span-2">
            <label class="label" for="set-address">Alamat toko</label>
            <textarea class="textarea" id="set-address" rows="2" maxlength="300" placeholder="Alamat lengkap toko (opsional)">${esc(s.address || '')}</textarea>
            <span class="hint">Alamat akan dicetak di bagian atas nota.</span>
          </div>
          <div class="field span-2">
            <label class="label" for="set-tagline">Slogan toko</label>
            <input class="input" id="set-tagline" value="${esc(s.tagline || 'Kelontong · Pulsa · Paket Data · Transfer')}" maxlength="120" placeholder="Kelontong · Pulsa · Paket Data · Transfer">
          </div>
          <div class="field">
            <label class="label" for="set-target">Target laba bulanan</label>
            <div class="input-group">
              <span class="ig-prefix">Rp</span>
              <input class="input" id="set-target" data-money inputmode="numeric" value="${s.monthlyTarget ? fmtNum(s.monthlyTarget) : ''}" placeholder="Contoh: 2.000.000">
            </div>
            <span class="hint">Dipakai untuk progress target di Beranda.</span>
          </div>
          <div class="field">
            <label class="label">Status toko</label>
            <div class="input" style="display:flex;align-items:center;gap:7px;background:var(--bg-soft);color:var(--muted)">
              ${icon('shield')}<span style="font-size:11.5px">Data tersimpan di cloud</span>
            </div>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-primary" type="submit" data-save-store>${icon('check')}Simpan perubahan</button>
        </div>
      </form>
    </div>`;
}

function displayPanel() {
  const theme = themeNow();
  const online = navigator.onLine && state.online;
  return `
    <div class="card settings-card" data-panel="tampilan">
      <div class="card-head">
        <div><h3>Tema aplikasi</h3><p>Pilih tampilan yang nyaman untuk mata Anda.</p></div>
        <span class="badge">${icon(theme === 'dark' ? 'moon' : 'sun')}${theme === 'dark' ? 'Gelap' : 'Terang'}</span>
      </div>
      <div class="card-body">
        <div class="theme-picker">
          <button class="theme-opt ${theme === 'light' ? 'active' : ''}" data-theme-opt="light">
            ${icon('sun')}<span>Terang</span>
          </button>
          <button class="theme-opt ${theme === 'dark' ? 'active' : ''}" data-theme-opt="dark">
            ${icon('moon')}<span>Gelap</span>
          </button>
        </div>
        <div class="settings-note mt-16">
          ${icon('info')}
          <span>Tema disimpan di perangkat ini. Di HP dan laptop, Anda bisa memilih tema yang berbeda.</span>
        </div>
      </div>
    </div>

    <div class="card settings-card" data-panel="tampilan">
      <div class="card-head"><div><h3>Aplikasi</h3><p>Pasang TokoKu di layar utama agar lebih cepat dibuka.</p></div></div>
      <div class="card-body" style="padding-top:2px;padding-bottom:2px">
        <div class="settings-row">
          <div class="sr-main">
            <strong>Pasang di perangkat</strong>
            <span>Bisa dibuka seperti aplikasi biasa, termasuk saat offline.</span>
          </div>
          <div class="sr-action"><button class="btn btn-secondary btn-sm" data-act="install">${icon('download')}Pasang</button></div>
        </div>
        <div class="settings-row">
          <div class="sr-main">
            <strong>Status koneksi</strong>
            <span>${online ? 'Tersambung ke internet dan cloud Firebase.' : 'Sedang offline — data tetap tersimpan dan disinkronkan otomatis.'}</span>
          </div>
          <div class="sr-action"><span class="badge ${online ? 'green' : 'amber'}">${icon(online ? 'wifi' : 'wifi-off')}${online ? 'Online' : 'Offline'}</span></div>
        </div>
        <div class="settings-row">
          <div class="sr-main">
            <strong>Versi aplikasi</strong>
            <span>TokoKu ${esc((window.APP_INFO && window.APP_INFO.version) || '1.0.0')} · ${esc((window.APP_INFO && window.APP_INFO.site) || 'tokoku-kelontong.web.app')}</span>
          </div>
          <div class="sr-action"><span class="badge">${icon('sparkles')}Terbaru</span></div>
        </div>
      </div>
    </div>`;
}

function receiptPanel() {
  const s = storeData();
  const tx = sampleTransaction();
  return `
    <div class="card settings-card" data-panel="nota">
      <div class="card-head">
        <div><h3>Pengaturan nota</h3><p>Sesuaikan ukuran kertas dan pesan di bagian bawah struk.</p></div>
      </div>
      <form class="card-body" id="receipt-form" novalidate>
        <div class="form-grid">
          <div class="field">
            <label class="label" for="set-receipt-width">Ukuran kertas</label>
            <select class="select" id="set-receipt-width">
              <option value="58" ${s.receiptWidth !== '80' ? 'selected' : ''}>58 mm (printer kecil)</option>
              <option value="80" ${s.receiptWidth === '80' ? 'selected' : ''}>80 mm (printer kasir)</option>
            </select>
            <span class="hint">Pilih sesuai printer thermal yang dipakai.</span>
          </div>
          <div class="field">
            <label class="label">Pratinjau</label>
            <div class="settings-note" style="height:38px;align-items:center">
              ${icon('printer')}<span>Nota dicetak lewat dialog cetak browser.</span>
            </div>
          </div>
          <div class="field span-2">
            <label class="label" for="set-receipt-footer">Pesan penutup nota</label>
            <textarea class="textarea" id="set-receipt-footer" rows="2" maxlength="220" placeholder="Terima kasih sudah berbelanja 🙏">${esc(s.receiptFooter || 'Terima kasih sudah berbelanja 🙏')}</textarea>
            <span class="hint">Tampil di bagian paling bawah setiap nota.</span>
          </div>
        </div>
        <div class="form-actions">
          <button class="btn btn-secondary" type="button" data-act="test-print">${icon('printer')}Cetak contoh</button>
          <button class="btn btn-primary" type="submit">${icon('check')}Simpan nota</button>
        </div>
      </form>
    </div>

    <div class="card settings-card" data-panel="nota">
      <div class="card-head">
        <div><h3>Contoh nota</h3><p>Perkiraan tampilan struk dengan pengaturan saat ini.</p></div>
        <span class="badge">${esc((s.receiptWidth === '80' ? '80' : '58') + ' mm')}</span>
      </div>
      <div class="card-body">
        ${receiptPreview(tx, s)}
        <div class="settings-note mt-12">
          ${icon('info')}
          <span>Gunakan tombol <b>Cetak contoh</b> untuk mencoba printer. Pastikan printer thermal sudah terpasang di perangkat.</span>
        </div>
      </div>
    </div>`;
}

function dataPanel() {
  const stats = dataStats();
  const hasProducts = state.products.length > 0;
  return `
    <div class="card settings-card" data-panel="data">
      <div class="card-head">
        <div><h3>Ringkasan data</h3><p>Data milik akun <b>${esc((auth.currentUser && auth.currentUser.email) || '')}</b>.</p></div>
        <span class="badge green">${icon('shield')}Aman</span>
      </div>
      <div class="card-body">
        <div class="stat-strip" id="set-stats" style="margin:0">
          ${stats.map((row) => `<div class="stat-box"><div class="sb-label">${icon(row.icon)}${esc(row.label)}</div><div class="sb-value">${fmtNum(row.value)}</div></div>`).join('')}
        </div>
      </div>
    </div>

    <div class="card settings-card" data-panel="data">
      <div class="card-head"><div><h3>Cadangan data</h3><p>Unduh seluruh data toko ke satu file, atau pulihkan dari cadangan.</p></div></div>
      <div class="card-body" style="padding-top:2px;padding-bottom:2px">
        <div class="settings-row">
          <div class="sr-main">
            <strong>Ekspor semua data</strong>
            <span>Produk, transaksi, pelanggan, kasbon, pengeluaran, dan restok dalam format JSON.</span>
          </div>
          <div class="sr-action"><button class="btn btn-secondary btn-sm" data-act="export">${icon('download')}Unduh</button></div>
        </div>
        <div class="settings-row">
          <div class="sr-main">
            <strong>Impor cadangan</strong>
            <span>Ganti seluruh data saat ini dengan isi file cadangan TokoKu.</span>
          </div>
          <div class="sr-action"><button class="btn btn-secondary btn-sm" data-act="import">${icon('upload')}Pilih file</button></div>
        </div>
      </div>
    </div>

    <div class="card settings-card" data-panel="data">
      <div class="card-head"><div><h3>Data contoh</h3><p>Coba aplikasi dengan data toko kelontong yang sudah terisi.</p></div></div>
      <div class="card-body" style="padding-top:2px;padding-bottom:2px">
        <div class="settings-row">
          <div class="sr-main">
            <strong>Muat data contoh</strong>
            <span>${hasProducts ? 'Belum bisa dimuat karena sudah ada produk. Kosongkan data terlebih dahulu.' : '14 produk, pelanggan, transaksi, kasbon, pengeluaran, dan restok contoh.'}</span>
          </div>
          <div class="sr-action"><button class="btn btn-soft btn-sm" data-act="seed" ${hasProducts ? 'disabled' : ''}>${icon('sparkles')}Muat</button></div>
        </div>
        <div class="settings-row">
          <div class="sr-main">
            <strong>Hapus data contoh</strong>
            <span>Menghapus baris yang ditandai sebagai data contoh, tanpa mengganggu data asli Anda.</span>
          </div>
          <div class="sr-action"><button class="btn btn-secondary btn-sm" data-act="clear-demo">${icon('trash')}Hapus</button></div>
        </div>
      </div>
    </div>

    <div class="card settings-card danger-zone" data-panel="data">
      <div class="card-head"><div><h3>Zona berbahaya</h3><p>Tindakan di bawah ini tidak dapat dibatalkan.</p></div></div>
      <div class="card-body">
        <div class="settings-row">
          <div class="sr-main">
            <strong>Hapus semua data toko</strong>
            <span>Produk, transaksi, kasbon, pengeluaran, restok, dan pelanggan akan dihapus permanen. Profil toko tetap disimpan.</span>
          </div>
          <div class="sr-action"><button class="btn btn-danger-soft btn-sm" data-act="reset">${icon('trash')}Hapus semua</button></div>
        </div>
        <div class="settings-note mt-12">
          ${icon('alert')}
          <span>Disarankan mengunduh cadangan terlebih dahulu sebelum menghapus data.</span>
        </div>
      </div>
    </div>`;
}

function accountPanel() {
  const user = auth.currentUser || state.user || {};
  const s = storeData();
  const name = s.owner || user.displayName || 'Pemilik Toko';
  return `
    <div class="card settings-card" data-panel="akun">
      <div class="card-head"><div><h3>Akun Anda</h3><p>Akun ini menyimpan seluruh data toko di cloud Firebase.</p></div></div>
      <div class="card-body">
        <div class="profile-mini">
          <div class="avatar">${esc(initials(name))}</div>
          <div class="grow">
            <strong>${esc(name)}</strong>
            <span>${esc(user.email || '-')}</span>
            <span class="badge green mt-4">${icon('shield')}Terverifikasi</span>
          </div>
        </div>
        <div class="settings-row mt-12">
          <div class="sr-main">
            <strong>Email login</strong>
            <span>${esc(user.email || '-')}</span>
          </div>
          <div class="sr-action"><span class="badge">${icon('mail')}Email</span></div>
        </div>
        <div class="settings-row">
          <div class="sr-main">
            <strong>ID pengguna</strong>
            <span style="font-family:var(--mono);font-size:9px;word-break:break-all">${esc(user.uid || '-')}</span>
          </div>
        </div>
        <div class="settings-row">
          <div class="sr-main">
            <strong>Reset password</strong>
            <span>Kami akan mengirim tautan untuk membuat password baru ke email Anda.</span>
          </div>
          <div class="sr-action"><button class="btn btn-secondary btn-sm" data-act="reset-pass">${icon('lock')}Kirim tautan</button></div>
        </div>
        <div class="settings-row">
          <div class="sr-main">
            <strong>Pasang aplikasi</strong>
            <span>Tambahkan TokoKu ke layar utama HP atau desktop.</span>
          </div>
          <div class="sr-action"><button class="btn btn-secondary btn-sm" data-act="install">${icon('download')}Pasang</button></div>
        </div>
      </div>
    </div>

    <div class="card settings-card danger-zone" data-panel="akun">
      <div class="card-head"><div><h3>Keluar dari akun</h3><p>Data tetap tersimpan di cloud dan bisa dibuka lagi kapan saja.</p></div></div>
      <div class="card-body">
        <div class="settings-row">
          <div class="sr-main">
            <strong>Keluar dari TokoKu</strong>
            <span>Anda perlu memasukkan email dan password untuk masuk kembali.</span>
          </div>
          <div class="sr-action"><button class="btn btn-danger-soft btn-sm" data-act="logout">${icon('logout')}Keluar</button></div>
        </div>
      </div>
    </div>`;
}

function markup() {
  return `
    ${pageHead({
      title: 'Pengaturan',
      desc: 'Atur profil toko, tampilan, nota, dan cadangan data Anda.'
    })}
    <div class="settings-layout">
      <nav class="settings-nav" id="set-nav" aria-label="Bagian pengaturan">
        ${SECTIONS.map((sec) => `<button type="button" data-section="${sec.id}" class="${ui.section === sec.id ? 'active' : ''}">${icon(sec.icon)}${esc(sec.label)}</button>`).join('')}
      </nav>
      <div class="settings-section" id="set-panels">
        ${profilePanel()}
        ${displayPanel()}
        ${receiptPanel()}
        ${dataPanel()}
        ${accountPanel()}
      </div>
    </div>`;
}

/* ---------------- behaviour ---------------- */
function showSection(id) {
  if (!SECTIONS.some((sec) => sec.id === id)) id = 'toko';
  ui.section = id;
  if (!root) return;
  root.querySelectorAll('[data-section]').forEach((btn) => {
    btn.classList.toggle('active', btn.getAttribute('data-section') === id);
  });
  root.querySelectorAll('[data-panel]').forEach((panel) => {
    panel.hidden = panel.getAttribute('data-panel') !== id;
  });
}

function refreshStats() {
  const el = root && root.querySelector('#set-stats');
  if (!el) return;
  el.innerHTML = dataStats().map((row) => `<div class="stat-box"><div class="sb-label">${icon(row.icon)}${esc(row.label)}</div><div class="sb-value">${fmtNum(row.value)}</div></div>`).join('');
}

async function saveProfile(form) {
  const name = form.querySelector('#set-name').value.trim();
  const owner = form.querySelector('#set-owner').value.trim();
  const phone = form.querySelector('#set-phone').value.trim();
  const address = form.querySelector('#set-address').value.trim();
  const tagline = form.querySelector('#set-tagline').value.trim();
  const target = parseMoney(form.querySelector('#set-target').value);
  if (!name) return toast('Nama toko wajib diisi.', 'warn');
  const btn = form.querySelector('[data-save-store]');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Menyimpan…`;
  try {
    const payload = await saveStore({ name, owner, phone, address, tagline, monthlyTarget: target });
    state.store = { ...(state.store || {}), ...payload };
    if (state.user && owner && state.user.displayName !== owner) {
      try { await fb.updateProfile(state.user, { displayName: owner }); } catch (err) {}
    }
    toast('Profil toko berhasil diperbarui.', 'success', 'Tersimpan');
    showSection('toko');
  } catch (err) {
    toast(err.message || 'Gagal menyimpan profil toko.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icon('check')}Simpan perubahan`;
  }
}

async function saveReceipt(form) {
  const width = form.querySelector('#set-receipt-width').value;
  const footer = form.querySelector('#set-receipt-footer').value.trim();
  const btn = form.querySelector('[type="submit"]');
  btn.disabled = true;
  btn.innerHTML = `<span class="spinner"></span>Menyimpan…`;
  try {
    const payload = await saveStore({
      ...storeData(),
      receiptWidth: width,
      receiptFooter: footer
    });
    state.store = { ...(state.store || {}), ...payload };
    toast('Pengaturan nota berhasil disimpan.', 'success', 'Tersimpan');
    rerender('nota');
  } catch (err) {
    toast(err.message || 'Gagal menyimpan pengaturan nota.', 'error');
  } finally {
    btn.disabled = false;
    btn.innerHTML = `${icon('check')}Simpan nota`;
  }
}

function rerender(section = ui.section) {
  if (!root) return;
  root.innerHTML = markup();
  bind(root);
  showSection(section);
  refreshStats();
}

async function importBackup(file) {
  if (!file) return;
  if (file.size > 12 * 1024 * 1024) {
    toast('Ukuran file terlalu besar (maksimal 12 MB).', 'error');
    return;
  }
  let parsed = null;
  try {
    const text = await file.text();
    parsed = safeParse(text, null);
  } catch (err) {
    toast('File tidak bisa dibaca.', 'error');
    return;
  }
  if (!parsed || parsed.app !== 'TokoKu') {
    toast('File ini bukan cadangan TokoKu yang valid.', 'error');
    return;
  }
  const rows = ['products', 'transactions', 'customers', 'debts', 'expenses', 'purchases']
    .reduce((acc, key) => acc + (Array.isArray(parsed[key]) ? parsed[key].length : 0), 0);
  const ok = await confirmDialog({
    title: 'Pulihkan data dari cadangan?',
    message: `Semua data saat ini akan <b>diganti</b> dengan isi cadangan (${fmtNum(rows)} baris). Tindakan ini tidak bisa dibatalkan.`,
    confirmText: 'Ya, pulihkan',
    danger: true,
    iconName: 'upload'
  });
  if (!ok) return;
  const btn = root && root.querySelector('[data-act="import"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Memulihkan…`;
  }
  try {
    await importAllData(parsed, { replace: true });
    toast('Cadangan berhasil dipulihkan. Memuat ulang data toko…', 'success', 'Selesai');
    setTimeout(() => window.location.reload(), 900);
  } catch (err) {
    toast(err.message || 'Gagal memulihkan cadangan.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${icon('upload')}Pilih file`;
    }
  }
}

function pickBackupFile() {
  if (!importInput) {
    importInput = document.createElement('input');
    importInput.type = 'file';
    importInput.accept = '.json,application/json';
    importInput.hidden = true;
    importInput.addEventListener('change', () => {
      const file = importInput.files && importInput.files[0];
      importInput.value = '';
      importBackup(file);
    });
    document.body.appendChild(importInput);
  }
  importInput.click();
}

async function exportBackup() {
  const btn = root && root.querySelector('[data-act="export"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Menyiapkan…`;
  }
  try {
    const data = await exportAllData();
    const date = fmtDate(new Date(), 'long').replace(/\s/g, '-');
    download(`tokoku-cadangan-${date}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    toast('File cadangan berhasil diunduh. Simpan di tempat yang aman.', 'success', 'Cadangan dibuat');
  } catch (err) {
    toast(err.message || 'Gagal membuat cadangan.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${icon('download')}Unduh`;
    }
  }
}

async function loadDemo() {
  if (state.products.length > 0) {
    toast('Kosongkan data produk terlebih dahulu sebelum memuat data contoh.', 'warn');
    return;
  }
  const ok = await confirmDialog({
    title: 'Muat data contoh?',
    message: 'Data contoh akan ditambahkan ke akun ini. Anda bisa menghapusnya lagi lewat tombol <b>Hapus data contoh</b>.',
    confirmText: 'Ya, muat',
    danger: false,
    iconName: 'sparkles'
  });
  if (!ok) return;
  const btn = root && root.querySelector('[data-act="seed"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Memuat…`;
  }
  try {
    await seedDemoData();
    toast('Data contoh berhasil dimuat. Selamat mencoba!', 'success', 'Selesai');
    refreshStats();
  } catch (err) {
    toast(err.message || 'Gagal memuat data contoh.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${icon('sparkles')}Muat`;
    }
  }
}

async function removeDemo() {
  const ok = await confirmDialog({
    title: 'Hapus data contoh?',
    message: 'Semua baris yang ditandai sebagai data contoh akan dihapus. Data asli Anda tidak tersentuh.',
    confirmText: 'Ya, hapus',
    danger: true,
    iconName: 'trash'
  });
  if (!ok) return;
  const btn = root && root.querySelector('[data-act="clear-demo"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Menghapus…`;
  }
  try {
    await clearDemoOnly();
    toast('Data contoh sudah dihapus.', 'success', 'Selesai');
    refreshStats();
  } catch (err) {
    toast(err.message || 'Gagal menghapus data contoh.', 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${icon('trash')}Hapus`;
    }
  }
}

async function wipeAll() {
  const ok = await confirmDialog({
    title: 'Hapus semua data toko?',
    message: 'Seluruh produk, transaksi, pelanggan, kasbon, pengeluaran, dan restok akan dihapus permanen. Profil toko tetap disimpan. Sebaiknya unduh cadangan terlebih dahulu.',
    confirmText: 'Ya, hapus semua',
    danger: true,
    iconName: 'alert'
  });
  if (!ok) return;
  const btn = root && root.querySelector('[data-act="reset"]');
  if (btn) {
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Menghapus…`;
  }
  try {
    await resetData();
    toast('Semua data toko sudah dihapus.', 'success', 'Data dikosongkan');
    refreshStats();
    setTimeout(() => navigate('dashboard'), 700);
  } catch (err) {
    toast(err.message || 'Gagal menghapus data.', 'error');
    if (btn) {
      btn.disabled = false;
      btn.innerHTML = `${icon('trash')}Hapus semua`;
    }
  }
}

async function sendReset() {
  const email = auth.currentUser && auth.currentUser.email;
  if (!email) return toast('Email akun tidak ditemukan.', 'error');
  const ok = await confirmDialog({
    title: 'Kirim tautan reset password?',
    message: `Tautan akan dikirim ke <b>${esc(email)}</b>. Buka email tersebut untuk membuat password baru.`,
    confirmText: 'Kirim tautan',
    danger: false,
    iconName: 'mail'
  });
  if (!ok) return;
  try {
    await fb.sendPasswordResetEmail(auth, email);
    toast('Tautan reset password sudah dikirim. Periksa kotak masuk email Anda.', 'success', 'Email terkirim');
  } catch (err) {
    toast(err.message || 'Gagal mengirim tautan reset password.', 'error');
  }
}

async function logout() {
  const ok = await confirmDialog({
    title: 'Keluar dari akun?',
    message: 'Data tetap tersimpan di cloud. Anda bisa masuk kembali kapan saja.',
    confirmText: 'Ya, keluar',
    danger: true,
    iconName: 'logout'
  });
  if (!ok) return;
  await fb.signOut(auth);
}

function testPrint() {
  printReceipt(sampleTransaction(), storeData());
  toast('Dialog cetak dibuka. Pilih printer nota Anda.', 'info');
}

function installApp() {
  if (window.TokoKu && typeof window.TokoKu.install === 'function') {
    window.TokoKu.install();
  } else {
    toast('Untuk memasang di HP: buka menu browser lalu pilih “Tambahkan ke layar utama”.', 'info', 'Pasang TokoKu');
  }
}

function bind(el) {
  if (clickHandler) el.removeEventListener('click', clickHandler);
  clickHandler = (e) => {
    const navBtn = e.target.closest('[data-section]');
    if (navBtn) {
      showSection(navBtn.getAttribute('data-section'));
      return;
    }
    const themeBtn = e.target.closest('[data-theme-opt]');
    if (themeBtn) {
      const theme = themeBtn.getAttribute('data-theme-opt');
      if (window.TokoKu && typeof window.TokoKu.setTheme === 'function') window.TokoKu.setTheme(theme);
      el.querySelectorAll('[data-theme-opt]').forEach((btn) => {
        btn.classList.toggle('active', btn.getAttribute('data-theme-opt') === theme);
      });
      toast(theme === 'dark' ? 'Mode gelap diaktifkan.' : 'Mode terang diaktifkan.', 'success', 'Tema diubah');
      return;
    }
    const action = e.target.closest('[data-act]');
    if (!action || action.disabled) return;
    const act = action.getAttribute('data-act');
    if (act === 'export') exportBackup();
    if (act === 'import') pickBackupFile();
    if (act === 'seed') loadDemo();
    if (act === 'clear-demo') removeDemo();
    if (act === 'reset') wipeAll();
    if (act === 'reset-pass') sendReset();
    if (act === 'logout') logout();
    if (act === 'install') installApp();
    if (act === 'test-print') testPrint();
  };
  el.addEventListener('click', clickHandler);

  const storeForm = el.querySelector('#store-form');
  if (storeForm) {
    storeForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveProfile(storeForm);
    });
  }

  const receiptForm = el.querySelector('#receipt-form');
  if (receiptForm) {
    receiptForm.addEventListener('submit', (e) => {
      e.preventDefault();
      saveReceipt(receiptForm);
    });
    receiptForm.querySelector('#set-receipt-width')?.addEventListener('change', () => {
      const badge = el.querySelector('[data-panel="nota"] .badge');
      const width = receiptForm.querySelector('#set-receipt-width').value;
      if (badge) badge.textContent = `${width} mm`;
    });
  }
}

export default {
  render(el, ctx) {
    root = el;
    const requested = ctx && ctx.query ? ctx.query.get('section') : '';
    if (requested && SECTIONS.some((sec) => sec.id === requested)) ui.section = requested;
    el.innerHTML = markup();
    bind(el);
    showSection(ui.section);
    refreshStats();
    if (ctx && ctx.query && ctx.query.get('print') === '1') setTimeout(testPrint, 300);
  },

  onChange(keys) {
    if (keys.has('products') || keys.has('transactions') || keys.has('customers') ||
      keys.has('debts') || keys.has('expenses') || keys.has('purchases')) {
      refreshStats();
    }
  },

  destroy() {
    if (root && clickHandler) root.removeEventListener('click', clickHandler);
    clickHandler = null;
    if (importInput) {
      importInput.remove();
      importInput = null;
    }
    root = null;
  }
};
