/* ==========================================================================
   TokoKu — App shell, auth, router
   ========================================================================== */

import {
  auth, db, isConfigured, googleEnabled, fb, authErrorMessage
} from './firebase.js';
import * as store from './store.js';
import { state, subscribe, start, stop, saveStore, seedDemoData } from './store.js';
import { toast, openModal, confirmDialog, initMoneyInputs } from './ui.js';
import { currentRoute, navigate, goWithQuery, ROUTE_META } from './nav.js';
import {
  esc, icon, fmtRp, dateKey, startOfDay, addDays, toDate, debounce,
  initials, greeting, fmtDate, download
} from './utils.js';

import dashboardView from './views/dashboard.js';
import posView from './views/pos.js';
import productsView from './views/products.js';
import transactionsView from './views/transactions.js';
import reportsView from './views/reports.js';
import debtsView from './views/debts.js';
import expensesView from './views/expenses.js';
import settingsView from './views/settings.js';

const VIEWS = {
  dashboard: dashboardView,
  kasir: posView,
  produk: productsView,
  transaksi: transactionsView,
  laporan: reportsView,
  kasbon: debtsView,
  pengeluaran: expensesView,
  pengaturan: settingsView
};

const $ = (sel, root = document) => root.querySelector(sel);
const authEl = $('#auth-screen');
const appEl = $('#app-shell');
let viewEl = $('#view');
const sidebar = $('#sidebar');
const backdrop = $('#sidebar-backdrop');
const fab = $('#fab');

let authMode = 'login';
let currentView = null;
let currentName = null;
let routeRendered = false;
let onboardingEl = null;
let deferredInstall = null;
let notifPanel = null;
let accountPopover = null;
let searchTimer = null;
let booted = false;

/* ==========================================================================
   Theme
   ========================================================================== */
function applyTheme(theme, persist = true) {
  const t = theme === 'dark' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', t);
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', t === 'dark' ? '#071611' : '#0b3b2e');
  if (persist) {
    try { localStorage.setItem('tokoku.theme', t); } catch (e) {}
  }
}
function toggleTheme() {
  applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark');
}

/* ==========================================================================
   Splash
   ========================================================================== */
let splashHidden = false;
function hideSplash() {
  if (splashHidden) return;
  splashHidden = true;
  const splash = $('#splash');
  if (!splash) return;
  splash.classList.add('out');
  setTimeout(() => splash.remove(), 420);
}

/* ==========================================================================
   Auth screen
   ========================================================================== */
function renderSetupScreen() {
  authEl.hidden = false;
  appEl.hidden = true;
  authEl.innerHTML = `
    <div class="auth-brand">
      <div class="auth-logo">
        <svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0d8a67"/><path d="M17 25h30l-2.5-7h-25L17 25Z" fill="#fff"/><path d="M20 25v20h24V25" fill="none" stroke="#fff" stroke-width="3.2"/></svg>
        <div><strong>TokoKu</strong><span>Kasir & Pembukuan</span></div>
      </div>
      <div class="auth-hero">
        <h1 class="auth-title">Satu aplikasi untuk <em>toko Anda.</em></h1>
        <p class="auth-lead">Firebase belum dikonfigurasi. Buka file <b>public/firebase-config.js</b> lalu masukkan konfigurasi project Firebase Anda.</p>
      </div>
      <div class="auth-preview"><div class="ap-card"><div class="ap-label">Status</div><div class="ap-value">Butuh konfigurasi</div></div></div>
    </div>
    <div class="auth-panel">
      <div class="auth-card">
        <div class="auth-head"><h2>Hubungkan Firebase</h2><p>Ikuti langkah singkat berikut untuk mengudarakan TokoKu.</p></div>
        <div class="list-gap mt-20">
          <div class="info-callout">${icon('info')}<span>1. Buka Firebase Console, buat project, lalu daftarkan aplikasi Web.</span></div>
          <div class="info-callout">${icon('info')}<span>2. Aktifkan Authentication (Email/Password) dan Cloud Firestore.</span></div>
          <div class="info-callout">${icon('info')}<span>3. Salin <b>firebaseConfig</b> ke <b>public/firebase-config.js</b>.</span></div>
          <div class="info-callout">${icon('info')}<span>4. Jalankan <b>firebase deploy</b> dari folder project.</span></div>
        </div>
        <a class="btn btn-primary btn-block btn-lg mt-20" href="https://console.firebase.google.com/" target="_blank" rel="noopener">${icon('external')}Buka Firebase Console</a>
        <div class="auth-foot">Panduan lengkap ada di file README.md.</div>
      </div>
    </div>`;
}

function authTemplate() {
  const isLogin = authMode === 'login';
  return `
  <div class="auth-brand">
    <div class="auth-logo">
      <svg viewBox="0 0 64 64" aria-hidden="true"><rect width="64" height="64" rx="16" fill="#0d8a67"/><path d="M17 25h30l-2.5-7h-25L17 25Z" fill="#fff" opacity=".96"/><path d="M20 25v20h24V25" fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"/><path d="M27 45V34h10v11" fill="none" stroke="#fff" stroke-width="3.2" stroke-linejoin="round"/></svg>
      <div><strong>TokoKu</strong><span>Kasir & Pembukuan</span></div>
    </div>
    <div class="auth-hero">
      <span class="auth-eyebrow">${icon('sparkles', 'ic-sm')} Dibuat untuk toko kecil Indonesia</span>
      <h1 class="auth-title">Toko rapi,<br><em>laba terlihat.</em></h1>
      <p class="auth-lead">Catat penjualan kelontong, pulsa, paket data, dan transfer dalam satu tempat. Ketahui untung rugi usaha Anda setiap hari — tanpa ribet dan tanpa buku catatan.</p>
      <div class="auth-features">
        <div class="auth-feature"><span class="af-ic">${icon('cart')}</span><span><strong>Kasir cepat</strong> — produk, pulsa, paket data, transfer, dan kasbon.</span></div>
        <div class="auth-feature"><span class="af-ic">${icon('chart')}</span><span><strong>Laba otomatis</strong> — omzet, HPP, biaya, dan laba bersih dihitung.</span></div>
        <div class="auth-feature"><span class="af-ic">${icon('smartphone')}</span><span><strong>Laptop & HP</strong> — data tersinkron lewat cloud Firebase.</span></div>
      </div>
    </div>
    <div class="auth-preview">
      <div class="auth-preview-head"><span>Ringkasan hari ini</span><span class="ap-live"><i></i>LIVE</span></div>
      <div class="auth-preview-grid">
        <div class="ap-card">
          <div class="ap-label">Laba bersih</div>
          <div class="ap-value">Rp 187.500 <small>+12%</small></div>
          <div class="ap-bars"><i></i><i></i><i></i><i></i><i></i><i></i><i></i></div>
        </div>
        <div class="ap-card">
          <div class="ap-list">
            <div class="ap-row"><span>Omzet</span><span>Rp 1.240.000</span></div>
            <div class="ap-row"><span>Transaksi</span><span>38</span></div>
            <div class="ap-row"><span>Kasbon</span><span>Rp 75.000</span></div>
          </div>
        </div>
      </div>
      <div class="ap-foot"><span>Semua data aman di cloud</span><strong>Firebase</strong></div>
    </div>
  </div>

  <div class="auth-panel">
    <div class="auth-card">
      <div class="auth-mobile-logo">
        <svg viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#0d8a67"/><path d="M17 25h30l-2.5-7h-25L17 25Z" fill="#fff"/><path d="M20 25v20h24V25" fill="none" stroke="#fff" stroke-width="3.2"/><path d="M27 45V34h10v11" fill="none" stroke="#fff" stroke-width="3.2"/></svg>
        <div><strong>TokoKu</strong><span>Kasir & Pembukuan</span></div>
      </div>
      <div class="auth-head">
        <h2>${isLogin ? 'Masuk ke toko Anda' : 'Buat akun toko baru'}</h2>
        <p>${isLogin ? 'Kelola penjualan dan pantau laba dari mana saja.' : 'Gratis, data tersimpan aman di cloud Firebase.'}</p>
      </div>
      <div class="auth-tabs">
        <button class="auth-tab ${isLogin ? 'active' : ''}" data-auth-mode="login">Masuk</button>
        <button class="auth-tab ${!isLogin ? 'active' : ''}" data-auth-mode="register">Daftar</button>
      </div>
      <div class="auth-msg" id="auth-msg"></div>
      <form class="auth-form" id="auth-form" novalidate>
        <div class="field">
          <label class="label" for="auth-email">Email</label>
          <div class="input-icon">
            ${icon('mail')}
            <input class="input input-lg" id="auth-email" type="email" autocomplete="email" placeholder="nama@email.com" required>
          </div>
        </div>
        <div class="field">
          <label class="label" for="auth-password">Password</label>
          <div class="input-icon">
            ${icon('lock')}
            <input class="input input-lg" id="auth-password" type="password" autocomplete="${isLogin ? 'current-password' : 'new-password'}" placeholder="Minimal 6 karakter" required minlength="6" style="padding-right:44px">
            <button type="button" class="icon-btn" data-toggle-pass="auth-password" aria-label="Tampilkan password" style="position:absolute;right:3px;top:50%;transform:translateY(-50%);width:34px;height:34px">${icon('eye')}</button>
          </div>
        </div>
        ${!isLogin ? `
        <div class="field">
          <label class="label" for="auth-confirm">Ulangi password</label>
          <div class="input-icon">
            ${icon('shield')}
            <input class="input input-lg" id="auth-confirm" type="password" autocomplete="new-password" placeholder="Ulangi password" required minlength="6">
          </div>
        </div>` : ''}
        ${isLogin ? `<div class="auth-forgot"><a href="#" id="forgot-link">Lupa password?</a></div>` : ''}
        <button class="btn btn-primary btn-lg btn-block" type="submit" id="auth-submit">
          ${icon(isLogin ? 'lock' : 'user')}<span>${isLogin ? 'Masuk ke TokoKu' : 'Daftar & mulai'}</span>
        </button>
        ${googleEnabled ? `<div class="auth-divider">atau</div>
        <button class="btn btn-secondary btn-lg btn-block" type="button" id="google-btn">${icon('mail')}Lanjutkan dengan Google</button>` : ''}
      </form>
      <div class="auth-foot">
        ${isLogin ? 'Belum punya akun? <a href="#" data-auth-mode="register">Daftar gratis</a>' : 'Sudah punya akun? <a href="#" data-auth-mode="login">Masuk di sini</a>'}
        <br>Dengan melanjutkan, Anda menyetujui data disimpan di Firebase milik Anda.
      </div>
    </div>
  </div>`;
}

function renderAuth() {
  authEl.hidden = false;
  appEl.hidden = true;
  authEl.innerHTML = authTemplate();
  const form = $('#auth-form');
  const msg = $('#auth-msg');
  const showMsg = (text, type = 'error') => {
    msg.textContent = text;
    msg.className = `auth-msg show ${type}`;
  };

  authEl.querySelectorAll('[data-auth-mode]').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      authMode = btn.getAttribute('data-auth-mode');
      renderAuth();
    });
  });

  authEl.querySelectorAll('[data-toggle-pass]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = document.getElementById(btn.getAttribute('data-toggle-pass'));
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.innerHTML = icon(show ? 'eye-off' : 'eye');
    });
  });

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    msg.className = 'auth-msg';
    const email = $('#auth-email').value.trim();
    const password = $('#auth-password').value;
    const confirm = isModeRegister() ? $('#auth-confirm').value : password;
    if (!email) return showMsg('Email wajib diisi.');
    if (password.length < 6) return showMsg('Password minimal 6 karakter.');
    if (password !== confirm) return showMsg('Konfirmasi password tidak sama.');
    const btn = $('#auth-submit');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span><span>Memproses…</span>`;
    try {
      if (isModeRegister()) {
        const cred = await fb.createUserWithEmailAndPassword(auth, email, password);
        if (cred.user) {
          try { await fb.updateProfile(cred.user, { displayName: email.split('@')[0] }); } catch (err) {}
        }
        showMsg('Akun berhasil dibuat. Menyiapkan toko Anda…', 'ok');
      } else {
        await fb.signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      btn.disabled = false;
      btn.innerHTML = `${icon(isModeRegister() ? 'user' : 'lock')}<span>${isModeRegister() ? 'Daftar & mulai' : 'Masuk ke TokoKu'}</span>`;
      showMsg(authErrorMessage(err), 'error');
    }
  });

  const forgot = $('#forgot-link');
  if (forgot) {
    forgot.addEventListener('click', (e) => {
      e.preventDefault();
      openForgot();
    });
  }

  const googleBtn = $('#google-btn');
  if (googleBtn) {
    googleBtn.addEventListener('click', async () => {
      googleBtn.disabled = true;
      googleBtn.innerHTML = `<span class="spinner"></span>Menghubungkan…`;
      try {
        const provider = new fb.GoogleAuthProvider();
        await fb.signInWithPopup(auth, provider);
      } catch (err) {
        showMsg(authErrorMessage(err), 'error');
      } finally {
        googleBtn.disabled = false;
        googleBtn.innerHTML = `${icon('mail')}Lanjutkan dengan Google`;
      }
    });
  }

  $('#auth-email')?.focus();
}

function isModeRegister() {
  return authMode === 'register';
}

function openForgot() {
  const email = ($('#auth-email')?.value || '').trim();
  openModal({
    title: 'Atur ulang password',
    subtitle: 'Kami akan mengirim tautan reset ke email Anda.',
    size: 'narrow',
    body: `<div class="field"><label class="label">Email</label><input class="input" id="reset-email" type="email" value="${esc(email)}" placeholder="nama@email.com"></div>`,
    footer: `<button class="btn btn-secondary" data-cancel>Batal</button><button class="btn btn-primary" data-send>${icon('send')}Kirim tautan</button>`,
    onMount: ({ body, foot, close }) => {
      foot.querySelector('[data-cancel]').addEventListener('click', close);
      foot.querySelector('[data-send]').addEventListener('click', async () => {
        const value = body.querySelector('#reset-email').value.trim();
        if (!value) return toast('Masukkan email terlebih dahulu.', 'warn');
        try {
          await fb.sendPasswordResetEmail(auth, value);
          close();
          toast('Tautan reset password sudah dikirim. Periksa kotak masuk email Anda.', 'success', 'Email terkirim');
        } catch (err) {
          toast(authErrorMessage(err), 'error');
        }
      });
    }
  });
}

/* ==========================================================================
   App shell / navigation
   ========================================================================== */
function showApp() {
  authEl.hidden = true;
  appEl.hidden = false;
  document.body.classList.remove('no-scroll');
  updateUserUI();
  renderNav();
  updateSyncUI();
}

function hideApp() {
  appEl.hidden = true;
  authEl.hidden = false;
  viewEl.innerHTML = '';
  currentView = null;
  currentName = null;
  routeRendered = false;
}

function updateUserUI() {
  const user = state.user || auth.currentUser;
  if (!user) return;
  const name = (state.store && state.store.owner) || user.displayName || (user.email || '').split('@')[0] || 'Pemilik';
  const email = user.email || '';
  const ini = initials(name);
  const sidebarUser = $('#sidebar-user');
  if (sidebarUser) {
    sidebarUser.innerHTML = `
      <div class="avatar">${esc(ini)}</div>
      <div class="sidebar-user-text"><strong>${esc(name)}</strong><span>${esc(email)}</span></div>
      ${icon('settings')}`;
  }
  const avatarBtn = $('#avatar-btn');
  if (avatarBtn) avatarBtn.innerHTML = `<div class="avatar">${esc(ini)}</div>`;
  const storeNameEl = $('#sidebar-store-name');
  if (storeNameEl) storeNameEl.textContent = (state.store && state.store.name) || 'Pembukuan toko';
}

function navLink(name, { badge = '', badgeClass = '' } = {}) {
  const meta = ROUTE_META[name];
  return `<a class="nav-link" href="#/${name}" data-nav-link="${name}">
    ${icon(meta.icon)}<span>${meta.title}</span>
    ${badge ? `<span class="nav-badge ${badgeClass}">${badge}</span>` : ''}
  </a>`;
}

function renderNav() {
  const low = store.lowStock().length;
  const open = store.openDebts().length;
  const overdue = store.overdueDebts().length;
  const navMain = $('#nav-main');
  const navExtra = $('#nav-extra');
  if (navMain) {
    navMain.innerHTML = `
      <div class="nav-label">Utama</div>
      ${navLink('dashboard')}
      ${navLink('kasir')}
      ${navLink('produk', { badge: low ? String(low) : '', badgeClass: 'warn' })}
      ${navLink('transaksi')}
      ${navLink('laporan')}`;
  }
  if (navExtra) {
    navExtra.innerHTML = `
      <div class="nav-label">Kelola</div>
      ${navLink('kasbon', { badge: open ? String(open) : '', badgeClass: overdue ? 'danger' : '' })}
      ${navLink('pengeluaran')}
      ${navLink('pengaturan')}`;
  }
  const mobile = $('#mobile-nav');
  if (mobile) {
    mobile.innerHTML = `
      <a class="mn-item" href="#/dashboard" data-nav-link="dashboard">${icon('home')}<span>Beranda</span></a>
      <a class="mn-item" href="#/kasir" data-nav-link="kasir">${icon('cart')}<span>Kasir</span></a>
      <a class="mn-item" href="#/produk" data-nav-link="produk">${icon('box')}<span>Produk</span>${low ? `<span class="nav-badge">${low}</span>` : ''}</a>
      <a class="mn-item" href="#/laporan" data-nav-link="laporan">${icon('chart')}<span>Laporan</span></a>
      <button class="mn-item" id="mobile-more">${icon('menu')}<span>Lainnya</span>${overdue ? '<span class="nav-badge">!</span>' : ''}</button>`;
    $('#mobile-more')?.addEventListener('click', openSidebar);
  }
  updateActiveNav();
}

function updateActiveNav() {
  const { name } = currentRoute();
  document.querySelectorAll('[data-nav-link]').forEach((el) => {
    el.classList.toggle('active', el.getAttribute('data-nav-link') === name);
  });
}

function openSidebar() {
  sidebar.classList.add('open');
  backdrop.classList.add('show');
  document.body.classList.add('no-scroll');
}
function closeSidebar() {
  sidebar.classList.remove('open');
  backdrop.classList.remove('show');
  if (!document.querySelector('.overlay')) document.body.classList.remove('no-scroll');
}

function updateTopbar(name) {
  const meta = ROUTE_META[name] || ROUTE_META.dashboard;
  const t = $('#topbar-title');
  const s = $('#topbar-sub');
  if (t) t.textContent = meta.title;
  if (s) s.textContent = meta.sub;
  document.title = `${meta.title} · ${store.storeName()}`;
}

function updateSyncUI() {
  const el = $('#sync-status');
  const bar = $('#offline-bar');
  if (!el) return;
  const online = navigator.onLine && state.online;
  el.className = 'sync-dot';
  if (!online) {
    el.classList.add('offline');
    el.innerHTML = `<i></i><span>Offline</span>`;
    el.title = 'Offline — data akan disinkronkan saat kembali online';
    if (bar) bar.hidden = false;
  } else if (state.pending) {
    el.classList.add('pending');
    el.innerHTML = `<i></i><span>Menyinkron</span>`;
    el.title = 'Menyinkronkan data ke cloud…';
    if (bar) bar.hidden = true;
  } else {
    el.innerHTML = `<i></i><span>Tersinkron</span>`;
    el.title = 'Semua data tersinkron dengan cloud';
    if (bar) bar.hidden = true;
  }
}

/* ==========================================================================
   Router
   ========================================================================== */
function pageLoading() {
  return `<div class="page-loading">
    <div class="sk-row"><div class="skeleton sk-card"></div><div class="skeleton sk-card"></div><div class="skeleton sk-card"></div><div class="skeleton sk-card"></div></div>
    <div class="skeleton sk-main"></div>
  </div>`;
}

async function renderRoute() {
  if (!state.user) return;
  if (!state.storeLoaded) {
    viewEl.innerHTML = pageLoading();
    return;
  }
  if (!state.store) {
    showOnboarding();
    return;
  }
  const info = currentRoute();
  const view = VIEWS[info.name] || VIEWS.dashboard;
  if (currentView && typeof currentView.destroy === 'function') {
    try { currentView.destroy(); } catch (e) {}
  }
  // Pasang host baru setiap pindah halaman. Ini membuang semua listener yang
  // menempel pada elemen host lama sehingga klik tidak terpicu berulang kali.
  const freshView = viewEl.cloneNode(false);
  viewEl.replaceWith(freshView);
  viewEl = freshView;
  currentName = info.name;
  currentView = view;
  updateTopbar(info.name);
  updateActiveNav();
  closeSidebar();
  closeFab();
  closeNotifPanel();
  closeAccountPopover();
  viewEl.innerHTML = `<div class="page-loading"><div class="skeleton" style="height:60px;border-radius:14px"></div><div class="skeleton" style="height:360px;border-radius:14px"></div></div>`;
  try {
    await view.render(viewEl, { query: info.query, route: info.name });
    routeRendered = true;
    if (window.innerWidth <= 1023) window.scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  } catch (err) {
    console.error(err);
    viewEl.innerHTML = `<div class="card"><div class="empty">
      <div class="empty-ic">${icon('alert-circle')}</div>
      <h3>Gagal memuat halaman</h3>
      <p>${esc(err.message || 'Terjadi kesalahan.')}</p>
      <button class="btn btn-primary btn-sm" onclick="location.reload()">${icon('refresh')}Muat ulang</button>
    </div></div>`;
  }
  updateNavBadges();
}

function updateNavBadges() {
  const low = store.lowStock().length;
  const open = store.openDebts().length;
  const overdue = store.overdueDebts().length;
  const navMain = $('#nav-main');
  if (navMain) {
    const produkLink = navMain.querySelector('[data-nav-link="produk"]');
    if (produkLink) {
      let b = produkLink.querySelector('.nav-badge');
      if (low) {
        if (!b) { b = document.createElement('span'); b.className = 'nav-badge warn'; produkLink.appendChild(b); }
        b.textContent = low;
      } else if (b) b.remove();
    }
  }
  const navExtra = $('#nav-extra');
  if (navExtra) {
    const kasbonLink = navExtra.querySelector('[data-nav-link="kasbon"]');
    if (kasbonLink) {
      let b = kasbonLink.querySelector('.nav-badge');
      if (open) {
        if (!b) { b = document.createElement('span'); b.className = 'nav-badge'; kasbonLink.appendChild(b); }
        b.textContent = open;
        b.className = `nav-badge ${overdue ? 'danger' : ''}`;
      } else if (b) b.remove();
    }
  }
  const notifCount = $('#notif-count');
  if (notifCount) {
    const total = low + overdue;
    notifCount.hidden = total === 0;
    notifCount.textContent = total > 9 ? '9+' : String(total);
  }
}

/* ==========================================================================
   Onboarding
   ========================================================================== */
function showOnboarding() {
  if (onboardingEl || !state.user) return;
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal narrow onboarding-modal" role="dialog" aria-modal="true" aria-label="Siapkan toko">
      <div class="modal-handle"></div>
      <div class="modal-body" style="padding:0">
        <div class="onboarding">
          <div class="onboarding-hero">
            <div class="ob-logo">${icon('store')}</div>
            <h2>Selamat datang di TokoKu</h2>
            <p>Isi data toko Anda. Bisa diubah kapan saja di menu Pengaturan.</p>
            <div class="ob-steps">
              <span class="ob-step active"><i>1</i>Profil toko</span>
              <span class="ob-step-line"></span>
              <span class="ob-step"><i>2</i>Mulai jualan</span>
            </div>
          </div>
          <form class="onboarding-body" id="ob-form">
            <div class="field">
              <label class="label" for="ob-name">Nama toko <span class="req">*</span></label>
              <input class="input input-lg" id="ob-name" placeholder="Contoh: Toko Berkah Jaya" maxlength="80" required>
            </div>
            <div class="form-grid">
              <div class="field">
                <label class="label" for="ob-owner">Nama pemilik</label>
                <input class="input" id="ob-owner" placeholder="Nama Anda" maxlength="80">
              </div>
              <div class="field">
                <label class="label" for="ob-phone">No. HP toko</label>
                <input class="input" id="ob-phone" placeholder="08xxxxxxxxxx" inputmode="tel" maxlength="30">
              </div>
            </div>
            <div class="field">
              <label class="label" for="ob-target">Target laba bulanan <span class="dim">(opsional)</span></label>
              <div class="input-group">
                <span class="ig-prefix">Rp</span>
                <input class="input" id="ob-target" data-money inputmode="numeric" placeholder="Contoh: 2.000.000">
              </div>
              <span class="hint">Dipakai untuk progress target di Beranda.</span>
            </div>
            <label class="demo-toggle">
              ${icon('sparkles')}
              <span>
                <strong>Isi contoh data toko</strong>
                <span>14 produk, pelanggan, transaksi, kasbon, dan pengeluaran contoh. Bisa dihapus nanti.</span>
              </span>
              <span class="switch"><input type="checkbox" id="ob-demo" checked><span class="sw-track"></span></span>
            </label>
            <button class="btn btn-primary btn-lg btn-block" type="submit" id="ob-submit">${icon('sparkles')}Mulai gunakan TokoKu</button>
            <button type="button" class="btn btn-ghost btn-sm btn-block" id="ob-logout">${icon('logout')}Keluar dari akun ini</button>
          </form>
        </div>
      </div>
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');
  onboardingEl = overlay;
  const form = overlay.querySelector('#ob-form');
  form.querySelector('#ob-owner').value = (state.user && state.user.displayName) || '';
  const close = () => {
    overlay.remove();
    onboardingEl = null;
    if (!document.querySelector('.overlay')) document.body.classList.remove('no-scroll');
  };
  overlay.querySelector('#ob-logout').addEventListener('click', async () => {
    close();
    await fb.signOut(auth);
  });
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const name = form.querySelector('#ob-name').value.trim();
    const owner = form.querySelector('#ob-owner').value.trim();
    const phone = form.querySelector('#ob-phone').value.trim();
    const target = form.querySelector('#ob-target').value.replace(/\D/g, '');
    const demo = form.querySelector('#ob-demo').checked;
    if (!name) return toast('Nama toko wajib diisi.', 'warn');
    const btn = form.querySelector('#ob-submit');
    btn.disabled = true;
    btn.innerHTML = `<span class="spinner"></span>Menyiapkan toko…`;
    try {
      const payload = await saveStore({
        name, owner: owner || (state.user.displayName || ''), phone,
        monthlyTarget: Number(target) || 0, tagline: 'Kelontong · Pulsa · Paket Data · Transfer',
        receiptFooter: 'Terima kasih sudah berbelanja 🙏'
      });
      state.store = { id: 'store', ...payload };
      state.storeLoaded = true;
      updateUserUI();
      renderNav();
      if (state.user) {
        try { await fb.updateProfile(state.user, { displayName: owner || state.user.displayName || name }); } catch (err) {}
      }
      if (demo) {
        try { await seedDemoData(); } catch (err) { console.warn(err); toast('Toko dibuat, tetapi data contoh gagal dimuat: ' + err.message, 'warn'); }
      }
      close();
      toast('Toko Anda siap digunakan. Selamat berjualan!', 'success', 'Toko berhasil dibuat');
      routeRendered = false;
      renderRoute();
      updateUserUI();
    } catch (err) {
      console.error(err);
      toast(err.message || 'Gagal menyiapkan toko.', 'error');
      btn.disabled = false;
      btn.innerHTML = `${icon('sparkles')}Mulai gunakan TokoKu`;
    }
  });
  setTimeout(() => form.querySelector('#ob-name')?.focus(), 120);
}

function closeOnboarding() {
  if (onboardingEl) {
    onboardingEl.remove();
    onboardingEl = null;
    if (!document.querySelector('.overlay')) document.body.classList.remove('no-scroll');
  }
}

/* ==========================================================================
   Search
   ========================================================================== */
function setupSearch() {
  const input = $('#global-search');
  const results = $('#search-results');
  if (!input || !results) return;
  const run = () => {
    const q = input.value.trim().toLowerCase();
    if (!q) { results.hidden = true; results.innerHTML = ''; return; }
    const pages = Object.entries(ROUTE_META)
      .filter(([, m]) => m.title.toLowerCase().includes(q))
      .slice(0, 4);
    const products = state.products
      .filter((p) => p.active !== false)
      .filter((p) => `${p.name} ${p.category} ${p.barcode || ''}`.toLowerCase().includes(q))
      .slice(0, 5);
    const customers = state.customers
      .filter((c) => `${c.name} ${c.phone}`.toLowerCase().includes(q))
      .slice(0, 3);
    const txs = state.recent
      .filter((t) => !t.voided)
      .filter((t) => `${t.invoice} ${t.customerName || ''} ${(t.items || []).map((i) => i.name).join(' ')}`.toLowerCase().includes(q))
      .slice(0, 4);
    let html = '';
    if (pages.length) {
      html += `<div class="search-group-label">Menu</div>`;
      html += pages.map(([name, m]) => `<button class="search-item" data-search-page="${name}">
        <span class="si-ic">${icon(m.icon)}</span>
        <span class="si-text"><strong>${esc(m.title)}</strong><span>${esc(m.sub)}</span></span>
        ${icon('chevron-right', 'si-meta')}
      </button>`).join('');
    }
    if (products.length) {
      html += `<div class="search-group-label">Produk</div>`;
      html += products.map((p) => `<button class="search-item" data-search-product="${esc(p.id)}" data-q="${esc(p.name)}">
        <span class="si-ic" style="font-size:15px;background:var(--bg-soft)">${esc(p.emoji || '📦')}</span>
        <span class="si-text"><strong>${esc(p.name)}</strong><span>Stok ${p.stock} ${esc(p.unit || '')} · ${esc(p.category || '')}</span></span>
        <span class="si-meta">${fmtRp(p.price)}</span>
      </button>`).join('');
    }
    if (customers.length) {
      html += `<div class="search-group-label">Pelanggan</div>`;
      html += customers.map((c) => `<button class="search-item" data-search-customer="${esc(c.id)}">
        <span class="si-ic">${icon('user')}</span>
        <span class="si-text"><strong>${esc(c.name)}</strong><span>${esc(c.phone || 'Tanpa nomor HP')}</span></span>
        ${icon('chevron-right', 'si-meta')}
      </button>`).join('');
    }
    if (txs.length) {
      html += `<div class="search-group-label">Transaksi</div>`;
      html += txs.map((t) => `<button class="search-item" data-search-tx="${esc(t.id)}" data-q="${esc(t.invoice)}">
        <span class="si-ic">${icon('receipt')}</span>
        <span class="si-text"><strong>${esc(t.invoice || 'Tanpa nomor')}</strong><span>${esc(t.customerName || 'Pelanggan umum')} · ${fmtDate(t.date, 'long')}</span></span>
        <span class="si-meta">${fmtRp(t.total)}</span>
      </button>`).join('');
    }
    if (!html) html = `<div class="search-empty">Tidak ditemukan hasil untuk “${esc(input.value.trim())}”.</div>`;
    results.innerHTML = html;
    results.hidden = false;
  };
  input.addEventListener('input', debounce(run, 140));
  input.addEventListener('focus', () => { if (input.value.trim()) run(); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { results.hidden = true; input.blur(); }
    if (e.key === 'Enter') {
      const first = results.querySelector('.search-item');
      if (first) { e.preventDefault(); first.click(); }
    }
  });
  document.addEventListener('click', (e) => {
    if (!e.target.closest('#global-search-wrap')) results.hidden = true;
  });
  results.addEventListener('click', (e) => {
    const page = e.target.closest('[data-search-page]');
    const prod = e.target.closest('[data-search-product]');
    const cust = e.target.closest('[data-search-customer]');
    const tx = e.target.closest('[data-search-tx]');
    if (page) navigate(page.getAttribute('data-search-page'));
    else if (prod) goWithQuery('produk', { q: prod.getAttribute('data-q') });
    else if (cust) goWithQuery('kasbon', { customer: cust.getAttribute('data-search-customer') });
    else if (tx) goWithQuery('transaksi', { q: tx.getAttribute('data-q') });
    input.value = '';
    results.hidden = true;
    results.innerHTML = '';
  });
  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      if (window.innerWidth > 767) { input.focus(); input.select(); }
    }
    if (e.key === '/' && !/input|textarea|select/i.test((document.activeElement && document.activeElement.tagName) || '')) {
      e.preventDefault();
      if (window.innerWidth > 767) input.focus();
    }
  });
}

/* ==========================================================================
   Notifications & account
   ========================================================================== */
function closeNotifPanel() {
  if (notifPanel) { notifPanel.remove(); notifPanel = null; }
}
function closeAccountPopover() {
  if (accountPopover) { accountPopover.remove(); accountPopover = null; }
}

function toggleNotifications() {
  closeAccountPopover();
  if (notifPanel) { closeNotifPanel(); return; }
  const low = store.lowStock();
  const overdue = store.overdueDebts();
  let items = '';
  low.slice(0, 5).forEach((p) => {
    items += `<button class="notif-item" data-notif-go="produk">
      <span class="notif-ic">${icon('box')}</span>
      <span class="notif-text"><strong>Stok ${p.name} menipis</strong><span>Sisa ${p.stock} ${esc(p.unit || 'pcs')} — segera restok.</span></span>
    </button>`;
  });
  overdue.slice(0, 5).forEach((d) => {
    items += `<button class="notif-item" data-notif-go="kasbon">
      <span class="notif-ic red">${icon('users')}</span>
      <span class="notif-text"><strong>Kasbon ${d.customerName} lewat jatuh tempo</strong><span>Sisa ${fmtRp(store.debtRemaining(d))} — kirim pengingat.</span></span>
    </button>`;
  });
  if (!items) items = `<div class="notif-empty">Tidak ada notifikasi baru. Toko Anda aman 👍</div>`;
  const panel = document.createElement('div');
  panel.className = 'notif-panel';
  panel.innerHTML = `
    <div class="notif-head"><strong>Notifikasi</strong><span class="badge ${low.length + overdue.length ? 'amber' : 'green'}">${low.length + overdue.length} perhatian</span></div>
    <div class="notif-list">${items}</div>`;
  document.body.appendChild(panel);
  notifPanel = panel;
  panel.addEventListener('click', (e) => {
    const go = e.target.closest('[data-notif-go]');
    if (go) navigate(go.getAttribute('data-notif-go'));
    closeNotifPanel();
  });
  setTimeout(() => {
    document.addEventListener('click', onOutside, { once: true });
  }, 10);
  function onOutside(e) {
    if (!e.target.closest('.notif-panel') && !e.target.closest('#notif-btn')) closeNotifPanel();
  }
}

function toggleAccount() {
  closeNotifPanel();
  if (accountPopover) { closeAccountPopover(); return; }
  const user = state.user || auth.currentUser;
  if (!user) return;
  const pop = document.createElement('div');
  pop.className = 'popover';
  pop.style.top = '62px';
  pop.style.right = '18px';
  pop.innerHTML = `
    <div class="popover-label">Akun</div>
    <div style="padding:4px 9px 9px">
      <div style="font-size:12px;font-weight:800">${esc(user.displayName || (state.store && state.store.owner) || 'Pemilik Toko')}</div>
      <div style="font-size:10px;color:var(--muted);margin-top:1px">${esc(user.email || '')}</div>
    </div>
    <div class="popover-sep"></div>
    <button class="popover-item" data-acc="settings">${icon('settings')}Pengaturan toko</button>
    <button class="popover-item" data-acc="install">${icon('download')}Pasang aplikasi</button>
    <div class="popover-sep"></div>
    <button class="popover-item danger" data-acc="logout">${icon('logout')}Keluar</button>`;
  document.body.appendChild(pop);
  accountPopover = pop;
  pop.addEventListener('click', async (e) => {
    const btn = e.target.closest('[data-acc]');
    if (!btn) return;
    const action = btn.getAttribute('data-acc');
    closeAccountPopover();
    if (action === 'settings') navigate('pengaturan');
    if (action === 'install') promptInstall();
    if (action === 'logout') {
      const ok = await confirmDialog({
        title: 'Keluar dari akun?',
        message: 'Data tetap tersimpan di cloud. Anda bisa masuk kembali kapan saja.',
        confirmText: 'Ya, keluar', danger: true, iconName: 'logout'
      });
      if (ok) await fb.signOut(auth);
    }
  });
  setTimeout(() => {
    document.addEventListener('click', function onOutside(e) {
      if (!e.target.closest('.popover') && !e.target.closest('#avatar-btn')) closeAccountPopover();
    }, { once: true });
  }, 10);
}

/* ==========================================================================
   FAB
   ========================================================================== */
function closeFab() {
  if (!fab) return;
  fab.classList.remove('open');
  const menu = $('#fab-menu');
  if (menu) menu.hidden = true;
}
function toggleFab() {
  if (!fab) return;
  const open = fab.classList.toggle('open');
  const menu = $('#fab-menu');
  if (menu) menu.hidden = !open;
}

/* ==========================================================================
   PWA
   ========================================================================== */
function setupPWA() {
  if ('serviceWorker' in navigator) {
    const secure = location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname);
    if (secure) {
      window.addEventListener('load', () => {
        navigator.serviceWorker.register('./sw.js').catch((err) => console.warn('SW:', err));
      });
    }
  }
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferredInstall = e;
    const btn = $('#install-btn');
    if (btn && !window.matchMedia('(display-mode: standalone)').matches) btn.hidden = false;
  });
  window.addEventListener('appinstalled', () => {
    deferredInstall = null;
    const btn = $('#install-btn');
    if (btn) btn.hidden = true;
    toast('TokoKu berhasil dipasang di perangkat Anda.', 'success', 'Aplikasi terpasang');
  });
  if (window.matchMedia('(display-mode: standalone)').matches) {
    const btn = $('#install-btn');
    if (btn) btn.hidden = true;
  }
}

async function promptInstall() {
  if (!deferredInstall) {
    toast('Untuk memasang di HP: buka menu browser lalu pilih “Tambahkan ke layar utama”.', 'info', 'Pasang TokoKu');
    return;
  }
  deferredInstall.prompt();
  try { await deferredInstall.userChoice; } catch (e) {}
  deferredInstall = null;
  const btn = $('#install-btn');
  if (btn) btn.hidden = true;
}

/* ==========================================================================
   Bind shell
   ========================================================================== */
function bindShell() {
  initMoneyInputs();
  setupSearch();
  setupPWA();

  $('#theme-btn')?.addEventListener('click', toggleTheme);
  $('#notif-btn')?.addEventListener('click', toggleNotifications);
  $('#avatar-btn')?.addEventListener('click', toggleAccount);
  $('#menu-btn')?.addEventListener('click', openSidebar);
  $('#sidebar-close')?.addEventListener('click', closeSidebar);
  backdrop?.addEventListener('click', closeSidebar);
  $('#sidebar-user')?.addEventListener('click', () => navigate('pengaturan'));
  $('#install-btn')?.addEventListener('click', promptInstall);
  $('#fab-btn')?.addEventListener('click', toggleFab);
  $('#fab-menu')?.addEventListener('click', (e) => {
    const btn = e.target.closest('[data-fab]');
    if (!btn) return;
    const action = btn.getAttribute('data-fab');
    closeFab();
    if (action === 'sale') navigate('kasir');
    if (action === 'expense') goWithQuery('pengeluaran', { add: '1' });
    if (action === 'debt') goWithQuery('kasbon', { add: '1' });
    if (action === 'product') goWithQuery('produk', { add: '1' });
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#fab')) closeFab();
    if (e.target.closest('a[href^="#/"]')) {
      if (window.innerWidth <= 1023) closeSidebar();
    }
  });

  window.addEventListener('hashchange', () => {
    if (!state.user) return;
    if (!state.store) {
      if (state.storeLoaded) showOnboarding();
      return;
    }
    closeOnboarding();
    renderRoute();
  });

  window.addEventListener('online', () => {
    store.setOnline(true);
    updateSyncUI();
    toast('Kembali online. Data akan disinkronkan otomatis.', 'success', 'Tersambung');
  });
  window.addEventListener('offline', () => {
    store.setOnline(false);
    updateSyncUI();
    toast('Anda sedang offline. Transaksi tetap bisa dicatat.', 'warn', 'Tidak ada koneksi');
  });

  window.addEventListener('resize', debounce(() => {
    if (window.innerWidth > 1023) closeSidebar();
  }, 150));

  window.addEventListener('error', (e) => {
    if (e && e.message && !/ResizeObserver/.test(e.message)) console.warn(e.message);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.warn('Unhandled promise:', e.reason);
  });
}

/* ==========================================================================
   Store subscription
   ========================================================================== */
let lastOnboardingCheck = 0;
subscribe((keys) => {
  updateSyncUI();
  updateNavBadges();
  updateUserUI();
  if (state.user && state.storeLoaded) {
    if (state.store) {
      updateUserUI();
      const nameEl = $('#sidebar-store-name');
      if (nameEl) nameEl.textContent = state.store.name || 'Pembukuan toko';
      if (onboardingEl) closeOnboarding();
      if (!routeRendered) renderRoute();
    } else {
      showOnboarding();
    }
  }
  if (currentView && typeof currentView.onChange === 'function' && state.store) {
    try { currentView.onChange(keys, viewEl, { query: currentRoute().query, route: currentName }); } catch (e) { console.warn(e); }
  }
  if (keys.has('products') || keys.has('debts')) updateNavBadges();
});

/* ==========================================================================
   Boot
   ========================================================================== */
function boot() {
  if (booted) return;
  booted = true;
  bindShell();

  if (!isConfigured) {
    hideSplash();
    renderSetupScreen();
    return;
  }

  let authSettled = false;
  const settle = () => {
    authSettled = true;
    setTimeout(hideSplash, 350);
  };
  setTimeout(() => { if (!authSettled) hideSplash(); }, 3500);

  fb.onAuthStateChanged(auth, async (user) => {
    settle();
    if (user) {
      state.user = user;
      authEl.hidden = true;
      appEl.hidden = false;
      showApp();
      start(user.uid);
      state.user = user;
      updateUserUI();
      if (state.storeLoaded && state.store) {
        renderRoute();
      } else if (state.storeLoaded && !state.store) {
        showOnboarding();
      } else {
        viewEl.innerHTML = pageLoading();
      }
      if (location.hash === '' || location.hash === '#') {
        navigate('dashboard', { replace: true });
      }
    } else {
      stop();
      state.user = null;
      hideApp();
      renderAuth();
      closeOnboarding();
    }
  });
}

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
else boot();

window.TokoKu = {
  navigate,
  state,
  store,
  toast,
  refresh: () => renderRoute(),
  setTheme: applyTheme,
  install: promptInstall
};
