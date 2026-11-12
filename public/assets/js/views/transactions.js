/* ==========================================================================
   TokoKu — Riwayat transaksi
   ========================================================================== */

import {
  esc, icon, fmtRp, fmtDate, fmtTime, fmtNum, downloadCsv, inputDate,
  parseLocalDate, addDays, paymentLabel, waLink
} from '../utils.js';
import {
  state, txDate, calcStats, fetchTransactions
} from '../store.js';
import { toast, paymentBadge, emptyState, printReceipt, waReceiptText } from '../ui.js';
import { openTxDetail } from './common.js';

const ui = {
  q: '',
  method: '',
  type: '',
  status: 'aktif',
  from: '',
  to: '',
  page: 1,
  pageSize: 20,
  remote: null,
  loading: false
};

let root = null;
let loadSeq = 0;

function filtered() {
  const q = ui.q.trim().toLowerCase();
  const list = (ui.remote || state.recent).filter((t) => {
    if (ui.status === 'aktif' && t.voided) return false;
    if (ui.status === 'void' && !t.voided) return false;
    if (ui.method && t.paymentMethod !== ui.method) return false;
    if (ui.type && t.type !== ui.type) return false;
    if (ui.from && txDate(t) < parseLocalDate(ui.from)) return false;
    if (ui.to && txDate(t) > new Date(parseLocalDate(ui.to).setHours(23, 59, 59, 999))) return false;
    if (q) {
      const hay = `${t.invoice || ''} ${t.customerName || ''} ${(t.items || []).map((i) => `${i.name} ${i.target || ''}`).join(' ')}`.toLowerCase();
      if (!hay.includes(q)) return false;
    }
    return true;
  });
  return list.sort((a, b) => txDate(b) - txDate(a));
}

export default {
  render(el, ctx) {
    root = el;
    const q = ctx && ctx.query ? ctx.query.get('q') : '';
    if (q) ui.q = q;

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Riwayat transaksi</h1>
          <p>Semua nota penjualan, pembayaran, laba, dan pembatalan tersimpan di sini.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" data-refresh>${icon('refresh')}Muat ulang</button>
          <button class="btn btn-primary btn-sm" data-export>${icon('download')}Ekspor CSV</button>
        </div>
      </div>

      <div class="card filter-bar">
        <div class="search-grow input-icon">
          ${icon('search')}
          <input class="input" id="tx-search" type="search" placeholder="Cari nota, pelanggan, atau nama barang…" value="${esc(ui.q)}" autocomplete="off">
        </div>
        <div class="date-field"><span>Dari</span><input class="input" id="tx-from" type="date" value="${esc(ui.from)}"></div>
        <div class="date-field"><span>s/d</span><input class="input" id="tx-to" type="date" value="${esc(ui.to)}"></div>
        <select class="select" id="tx-method">
          <option value="">Semua metode</option>
          ${['cash', 'qris', 'transfer', 'kasbon'].map((m) => `<option value="${m}" ${ui.method === m ? 'selected' : ''}>${paymentLabel(m)}</option>`).join('')}
        </select>
        <select class="select" id="tx-type">
          <option value="">Semua jenis</option>
          <option value="product" ${ui.type === 'product' ? 'selected' : ''}>Produk</option>
          <option value="digital" ${ui.type === 'digital' ? 'selected' : ''}>Digital</option>
          <option value="mixed" ${ui.type === 'mixed' ? 'selected' : ''}>Campuran</option>
        </select>
        <select class="select" id="tx-status">
          <option value="aktif" ${ui.status === 'aktif' ? 'selected' : ''}>Transaksi aktif</option>
          <option value="void" ${ui.status === 'void' ? 'selected' : ''}>Dibatalkan</option>
          <option value="semua" ${ui.status === 'semua' ? 'selected' : ''}>Semua status</option>
        </select>
        <button class="btn btn-ghost btn-sm" data-reset>${icon('x')}Reset</button>
      </div>

      <div class="tx-summary" id="tx-summary"></div>
      <div id="tx-range-note" class="hint mb-12"></div>

      <div class="card">
        <div class="table-wrap tx-table">
          <table class="table table-click">
            <thead><tr><th>Nota</th><th>Pelanggan</th><th>Item</th><th>Metode</th><th class="num">Total</th><th class="num">Laba</th><th class="actions">Aksi</th></tr></thead>
            <tbody id="tx-tbody"></tbody>
          </table>
        </div>
        <div class="tx-mobile-list" id="tx-mobile"></div>
        <div id="tx-empty"></div>
        <div class="card-foot flex" id="tx-pager" style="justify-content:space-between"></div>
      </div>`;

    bind(el);
    const start = ctx && ctx.query ? ctx.query.get('from') : '';
    const end = ctx && ctx.query ? ctx.query.get('to') : '';
    if (start) ui.from = start;
    if (end) ui.to = end;
    if (ui.from || ui.to) loadRange();
    else renderResults();
  },

  onChange(keys) {
    if (!root) return;
    if (!keys.has('transactions') && !keys.has('ready')) return;
    if (ui.remote) loadRange();
    else renderResults();
  }
};

function bind(el) {
  const search = el.querySelector('#tx-search');
  search.addEventListener('input', () => {
    ui.q = search.value;
    ui.page = 1;
    renderResults();
  });
  el.querySelector('#tx-from').addEventListener('change', (e) => { ui.from = e.target.value; ui.page = 1; loadRange(); });
  el.querySelector('#tx-to').addEventListener('change', (e) => { ui.to = e.target.value; ui.page = 1; loadRange(); });
  el.querySelector('#tx-method').addEventListener('change', (e) => { ui.method = e.target.value; ui.page = 1; renderResults(); });
  el.querySelector('#tx-type').addEventListener('change', (e) => { ui.type = e.target.value; ui.page = 1; renderResults(); });
  el.querySelector('#tx-status').addEventListener('change', (e) => { ui.status = e.target.value; ui.page = 1; renderResults(); });
  el.querySelector('[data-reset]').addEventListener('click', () => {
    ui.q = ''; ui.method = ''; ui.type = ''; ui.status = 'aktif'; ui.from = ''; ui.to = ''; ui.page = 1; ui.remote = null;
    el.querySelector('#tx-search').value = '';
    el.querySelector('#tx-from').value = '';
    el.querySelector('#tx-to').value = '';
    el.querySelector('#tx-method').value = '';
    el.querySelector('#tx-type').value = '';
    el.querySelector('#tx-status').value = 'aktif';
    renderResults();
  });
  el.querySelector('[data-refresh]').addEventListener('click', () => {
    if (ui.remote) loadRange(); else renderResults();
    toast('Daftar transaksi diperbarui.', 'info');
  });
  el.querySelector('[data-export]').addEventListener('click', exportCsv);

  el.addEventListener('click', (e) => {
    const view = e.target.closest('[data-view]');
    if (view) {
      const tx = findTx(view.getAttribute('data-view'));
      if (tx) openTxDetail(tx, { onChange: () => { if (ui.remote) loadRange(); else renderResults(); } });
      return;
    }
    const print = e.target.closest('[data-print]');
    if (print) {
      const tx = findTx(print.getAttribute('data-print'));
      if (tx) printReceipt(tx, state.store || {});
      return;
    }
    const wa = e.target.closest('[data-wa]');
    if (wa) {
      const tx = findTx(wa.getAttribute('data-wa'));
      const customer = tx && state.customers.find((c) => c.id === tx.customerId);
      if (tx) window.open(waLink(customer && customer.phone, waReceiptText(tx, state.store || {})), '_blank', 'noopener');
      return;
    }
    const page = e.target.closest('[data-page]');
    if (page) {
      ui.page = Number(page.getAttribute('data-page')) || 1;
      renderResults();
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    const action = e.target.closest('[data-action="go-kasir"]');
    if (action) location.hash = '#/kasir';
  });
}

function findTx(id) {
  return (ui.remote || state.recent).find((t) => t.id === id);
}

async function loadRange() {
  if (!ui.from && !ui.to) {
    ui.remote = null;
    renderResults();
    return;
  }
  const start = ui.from ? parseLocalDate(ui.from) : addDays(new Date(), -60);
  const end = ui.to ? parseLocalDate(ui.to) : new Date();
  if (start > end) {
    toast('Tanggal “dari” tidak boleh melebihi tanggal “sampai”.', 'warn');
    return;
  }
  ui.loading = true;
  const seq = ++loadSeq;
  renderResults();
  try {
    const rows = await fetchTransactions(start, end);
    if (seq !== loadSeq) return;
    ui.remote = rows;
  } catch (err) {
    if (seq !== loadSeq) return;
    toast(err.message || 'Gagal memuat transaksi pada rentang tanggal ini.', 'error');
    ui.remote = [];
  } finally {
    if (seq === loadSeq) {
      ui.loading = false;
      renderResults();
    }
  }
}

function renderResults() {
  if (!root) return;
  const rows = filtered();
  const active = rows.filter((t) => !t.voided);
  const stats = calcStats(active, []);
  const summary = root.querySelector('#tx-summary');
  const tbody = root.querySelector('#tx-tbody');
  const mobile = root.querySelector('#tx-mobile');
  const empty = root.querySelector('#tx-empty');
  const pager = root.querySelector('#tx-pager');
  const note = root.querySelector('#tx-range-note');

  if (summary) {
    summary.innerHTML = `
      <div class="txs-item"><span>Transaksi</span><strong>${stats.count}</strong></div>
      <div class="txs-item"><span>Omzet</span><strong>${fmtRp(stats.omzet)}</strong></div>
      <div class="txs-item"><span>Laba kotor</span><strong style="color:var(--brand)">${fmtRp(stats.labaKotor)}</strong></div>
      <div class="txs-item"><span>Kasbon</span><strong style="color:var(--purple)">${fmtRp(stats.kasbonBaru)}</strong></div>`;
  }

  if (note) {
    note.innerHTML = ui.loading
      ? `<span class="spinner" style="width:12px;height:12px;border-width:2px"></span> Memuat transaksi…`
      : ui.remote
        ? `${icon('calendar', 'ic-sm')} Menampilkan ${rows.length} transaksi pada rentang tanggal terpilih.`
        : `${icon('clock', 'ic-sm')} Menampilkan transaksi 60 hari terakhir. Pilih rentang tanggal untuk melihat riwayat lebih lama.`;
  }

  if (!rows.length) {
    if (tbody) tbody.innerHTML = '';
    if (mobile) mobile.innerHTML = '';
    if (pager) pager.innerHTML = '';
    if (empty) empty.innerHTML = ui.loading
      ? `<div class="empty"><span class="spinner"></span><p>Memuat data…</p></div>`
      : emptyState({
        iconName: 'receipt', title: 'Tidak ada transaksi',
        text: ui.q || ui.method || ui.type || ui.from || ui.to
          ? 'Tidak ada transaksi yang cocok dengan filter. Coba ubah kata kunci atau reset filter.'
          : 'Transaksi yang Anda catat di kasir akan muncul di sini.',
        action: 'go-kasir', actionLabel: 'Buka kasir'
      });
    return;
  }

  if (empty) empty.innerHTML = '';
  const totalPages = Math.max(1, Math.ceil(rows.length / ui.pageSize));
  if (ui.page > totalPages) ui.page = totalPages;
  const startIndex = (ui.page - 1) * ui.pageSize;
  const pageRows = rows.slice(startIndex, startIndex + ui.pageSize);

  if (tbody) {
    tbody.innerHTML = pageRows.map((t) => {
      const items = t.items || [];
      const preview = items.slice(0, 3).map((i) => `<span class="ti-emoji" title="${esc(i.name)}">${esc(i.emoji || '📦')}</span>`).join('');
      const more = items.length > 3 ? `<span class="ti-more">+${items.length - 3}</span>` : '';
      return `<tr class="${t.voided ? 'is-void' : ''}" data-view="${esc(t.id)}">
        <td>
          <span class="invoice-code">${esc(t.invoice || '-')}</span>
          <span class="sub">${fmtDate(t.date, 'long')} · ${fmtTime(t.date)}</span>
        </td>
        <td>${esc(t.customerName || 'Pelanggan umum')}<span class="sub">${t.type === 'digital' ? 'Layanan digital' : t.type === 'mixed' ? 'Produk + digital' : 'Produk'}</span></td>
        <td><div class="tx-items-preview">${preview}${more}</div><span class="sub">${fmtNum(t.itemCount || items.length)} item</span></td>
        <td>${paymentBadge(t.paymentMethod)}${t.voided ? `<span class="sub" style="color:var(--red)">Dibatalkan</span>` : ''}</td>
        <td class="num"><strong>${fmtRp(t.total)}</strong></td>
        <td class="num" style="color:${t.voided ? 'var(--dim)' : (t.profit >= 0 ? 'var(--brand)' : 'var(--red)')}">${fmtRp(t.profit)}</td>
        <td class="actions">
          <button class="icon-btn btn-sm" data-view="${esc(t.id)}" title="Detail">${icon('eye')}</button>
          <button class="icon-btn btn-sm" data-print="${esc(t.id)}" title="Cetak nota">${icon('printer')}</button>
        </td>
      </tr>`;
    }).join('');
  }

  if (mobile) {
    mobile.innerHTML = pageRows.map((t) => `
      <div class="tx-mobile-card ${t.voided ? 'is-void' : ''}" data-view="${esc(t.id)}" style="${t.voided ? 'opacity:.55' : ''}">
        <span class="tm-ic">${esc((t.items && t.items[0] && t.items[0].emoji) || (t.type === 'digital' ? '📱' : '🛒'))}</span>
        <div class="tm-main">
          <div class="tm-top"><strong>${esc(t.customerName || 'Pelanggan umum')}</strong><span class="tm-right"><strong>${fmtRp(t.total)}</strong></span></div>
          <div class="tm-sub">${esc(t.invoice)} · ${fmtDate(t.date, 'short')} ${fmtTime(t.date)} · ${fmtNum(t.itemCount || (t.items || []).length)} item</div>
          <div class="flex gap-6 mt-4">${paymentBadge(t.paymentMethod)}${t.voided ? `<span class="badge red">Dibatalkan</span>` : ''}<span class="badge ${t.profit >= 0 ? 'green' : 'red'}">Laba ${fmtRp(t.profit)}</span></div>
        </div>
      </div>`).join('');
  }

  if (pager) {
    pager.innerHTML = `
      <span class="dim" style="font-size:10.5px">Menampilkan ${startIndex + 1}–${Math.min(startIndex + ui.pageSize, rows.length)} dari ${rows.length} transaksi</span>
      <div class="flex gap-6">
        <button class="btn btn-secondary btn-sm" data-page="${ui.page - 1}" ${ui.page <= 1 ? 'disabled' : ''}>${icon('chevron-left')}Sebelumnya</button>
        <span class="badge">${ui.page} / ${totalPages}</span>
        <button class="btn btn-secondary btn-sm" data-page="${ui.page + 1}" ${ui.page >= totalPages ? 'disabled' : ''}>Berikutnya${icon('chevron-right')}</button>
      </div>`;
  }
}

/* ---------------- export ---------------- */
function exportCsv() {
  const rowsData = filtered();
  if (!rowsData.length) return toast('Tidak ada transaksi untuk diekspor.', 'warn');
  const rows = rowsData.map((t) => [
    t.invoice || '', fmtDate(t.date, 'long'), fmtTime(t.date),
    t.customerName || 'Pelanggan umum', t.type || 'product',
    paymentLabel(t.paymentMethod), Number(t.discount) || 0, Number(t.total) || 0,
    Number(t.cost) || 0, Number(t.profit) || 0, t.voided ? 'Dibatalkan' : 'Aktif',
    (t.items || []).map((i) => `${i.name} x${i.qty}`).join(' | ')
  ]);
  downloadCsv(`transaksi-tokoku-${inputDate(new Date())}.csv`, rows, [
    'No. Nota', 'Tanggal', 'Jam', 'Pelanggan', 'Jenis', 'Metode', 'Diskon', 'Total', 'HPP', 'Laba', 'Status', 'Item'
  ]);
  toast(`${rows.length} transaksi diekspor ke CSV.`, 'success');
}
