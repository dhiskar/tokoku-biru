/* ==========================================================================
   TokoKu — Pengeluaran operasional
   ========================================================================== */

import {
  esc, icon, fmtRp, fmtNum, fmtPct, fmtDate, inputDate, parseMoney,
  downloadCsv, EXPENSE_CATEGORIES, dateKey, sum
} from '../utils.js';
import { state, saveExpense, deleteExpense, expenseBreakdown } from '../store.js';
import { openModal, confirmDialog, toast, emptyState } from '../ui.js';
import { pageHead, statBox } from './common.js';

const ui = {
  month: dateKey(new Date()).slice(0, 7),
  q: '',
  category: ''
};

const CAT_ICONS = {
  'Listrik & Air': 'zap',
  'Sewa Tempat': 'store',
  'Gaji Karyawan': 'users',
  'Transport': 'send',
  'ATK & Perlengkapan': 'clipboard',
  'Perawatan Toko': 'sliders',
  'Pulsa & Internet': 'wifi',
  'Lainnya': 'wallet'
};

const CAT_COLORS = ['var(--amber)', 'var(--blue)', 'var(--purple)', 'var(--brand)', 'var(--red)', '#0ea5e9', '#f97316', '#64748b', '#84cc16'];

let root = null;

function monthDate() {
  const [y, m] = ui.month.split('-').map(Number);
  return new Date(y, (m || 1) - 1, 1);
}

function monthExpenses() {
  return state.expenses.filter((e) => dateKey(e.date).startsWith(ui.month));
}

function filteredExpenses() {
  const q = ui.q.trim().toLowerCase();
  return monthExpenses()
    .filter((e) => !ui.category || (e.category || 'Lainnya') === ui.category)
    .filter((e) => !q || `${e.category || ''} ${e.note || ''}`.toLowerCase().includes(q))
    .sort((a, b) => {
      const da = a.date && a.date.toDate ? a.date.toDate() : new Date(a.date);
      const db = b.date && b.date.toDate ? b.date.toDate() : new Date(b.date);
      return db - da;
    });
}

function categoriesInUse() {
  return [...new Set([...EXPENSE_CATEGORIES, ...state.expenses.map((e) => e.category).filter(Boolean)])]
    .sort((a, b) => a.localeCompare(b, 'id'));
}

/* ---------------- view ---------------- */
export default {
  render(el, ctx) {
    root = el;
    const cur = dateKey(new Date()).slice(0, 7);
    if (ui.month > cur) ui.month = cur;

    el.innerHTML = `
      ${pageHead({
        title: 'Pengeluaran toko',
        desc: 'Catat biaya operasional agar laba bersih usaha Anda dihitung dengan benar.',
        actions: `
          <button class="btn btn-secondary btn-sm" data-export>${icon('download')}Ekspor CSV</button>
          <button class="btn btn-primary btn-sm" data-add>${icon('plus')}Tambah pengeluaran</button>`
      })}

      <div class="stat-strip" id="exp-stats"></div>

      <div class="card filter-bar">
        <div class="flex gap-4" style="align-items:center">
          <button class="icon-btn" data-month-prev title="Bulan sebelumnya">${icon('chevron-left')}</button>
          <input class="input" id="exp-month" type="month" value="${esc(ui.month)}" max="${esc(cur)}" style="width:150px">
          <button class="icon-btn" data-month-next title="Bulan berikutnya" ${ui.month >= cur ? 'disabled' : ''}>${icon('chevron-right')}</button>
        </div>
        <div class="search-grow input-icon">
          ${icon('search')}
          <input class="input" id="exp-search" type="search" placeholder="Cari kategori atau keterangan…" value="${esc(ui.q)}" autocomplete="off">
        </div>
        <select class="select" id="exp-category">
          <option value="">Semua kategori</option>
          ${categoriesInUse().map((c) => `<option value="${esc(c)}" ${ui.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <button class="btn btn-ghost btn-sm" data-reset>${icon('x')}Reset</button>
      </div>

      <div class="expense-layout">
        <div class="card">
          <div class="card-head">
            <div><h3 id="exp-list-title">Pengeluaran bulan ini</h3><p id="exp-list-sub">—</p></div>
            <button class="btn btn-soft btn-sm" data-add>${icon('plus')}Tambah</button>
          </div>
          <div class="expense-list" id="exp-list"></div>
          <div id="exp-empty"></div>
          <div class="card-foot flex" id="exp-total" style="justify-content:space-between"></div>
        </div>

        <div class="dash-stack">
          <div class="card">
            <div class="card-head"><div><h3>Per kategori</h3><p>Komposisi biaya bulan ini</p></div></div>
            <div class="card-body" style="padding:14px 16px" id="exp-cats"></div>
          </div>
          <div class="card">
            <div class="card-body" style="padding:14px 16px">
              <div class="expense-note">${icon('info')}<span><b>HPP sudah dihitung otomatis</b> dari harga modal setiap transaksi. Cukup catat biaya operasional di sini (listrik, sewa, gaji, transport). Belanja restok barang dicatat lewat menu Produk → Restok dan tidak dihitung dua kali.</span></div>
              <button class="btn btn-secondary btn-sm btn-block mt-12" data-go-restock>${icon('package')}Catat restok barang</button>
            </div>
          </div>
        </div>
      </div>`;

    bind(el);
    renderContent();

    if (ctx && ctx.query && ctx.query.get('add') === '1') {
      setTimeout(() => openExpenseForm(), 120);
    }
  },

  onChange(keys) {
    if (!root) return;
    if (keys.has('expenses') || keys.has('store') || keys.has('ready')) renderContent();
  }
};

function bind(el) {
  el.querySelectorAll('[data-add]').forEach((btn) => {
    btn.addEventListener('click', () => openExpenseForm());
  });

  el.querySelector('#exp-month').addEventListener('change', (e) => {
    ui.month = e.target.value || dateKey(new Date()).slice(0, 7);
    renderContent();
    updateMonthButtons();
  });

  el.querySelector('[data-month-prev]').addEventListener('click', () => {
    const d = monthDate();
    d.setMonth(d.getMonth() - 1);
    ui.month = dateKey(d).slice(0, 7);
    el.querySelector('#exp-month').value = ui.month;
    renderContent();
    updateMonthButtons();
  });

  el.querySelector('[data-month-next]').addEventListener('click', () => {
    const d = monthDate();
    d.setMonth(d.getMonth() + 1);
    const cur = dateKey(new Date()).slice(0, 7);
    ui.month = dateKey(d).slice(0, 7) > cur ? cur : dateKey(d).slice(0, 7);
    el.querySelector('#exp-month').value = ui.month;
    renderContent();
    updateMonthButtons();
  });

  el.querySelector('#exp-search').addEventListener('input', (e) => {
    ui.q = e.target.value;
    renderList();
  });

  el.querySelector('#exp-category').addEventListener('change', (e) => {
    ui.category = e.target.value;
    renderList();
  });

  el.querySelector('[data-reset]').addEventListener('click', () => {
    ui.q = '';
    ui.category = '';
    el.querySelector('#exp-search').value = '';
    el.querySelector('#exp-category').value = '';
    renderList();
  });

  el.querySelector('[data-export]').addEventListener('click', exportCsv);
  el.querySelector('[data-go-restock]').addEventListener('click', () => { location.hash = '#/produk'; });

  el.addEventListener('click', (e) => {
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      const exp = state.expenses.find((row) => row.id === edit.getAttribute('data-edit'));
      if (exp) openExpenseForm(exp);
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const exp = state.expenses.find((row) => row.id === del.getAttribute('data-del'));
      if (exp) removeExpense(exp);
      return;
    }
    const emptyAdd = e.target.closest('[data-action="add"]');
    if (emptyAdd) openExpenseForm();
  });
}

function updateMonthButtons() {
  if (!root) return;
  const cur = dateKey(new Date()).slice(0, 7);
  const next = root.querySelector('[data-month-next]');
  if (next) next.disabled = ui.month >= cur;
}

function renderContent() {
  if (!root) return;
  const month = monthExpenses();
  const total = sum(month, (e) => e.amount);
  const breakdown = expenseBreakdown(month);
  const daysInMonth = new Date(monthDate().getFullYear(), monthDate().getMonth() + 1, 0).getDate();
  const now = new Date();
  const isCurrent = ui.month === dateKey(now).slice(0, 7);
  const elapsed = isCurrent ? now.getDate() : daysInMonth;
  const perDay = total / Math.max(1, elapsed);
  const biggest = breakdown[0];

  const stats = root.querySelector('#exp-stats');
  if (stats) {
    stats.innerHTML = `
      ${statBox('Total pengeluaran', fmtRp(total), fmtDate(monthDate(), 'month'), 'wallet')}
      ${statBox('Jumlah catatan', fmtNum(month.length), 'biaya operasional bulan ini', 'receipt')}
      ${statBox('Kategori terbesar', biggest ? esc(biggest.label) : '—', biggest ? fmtRp(biggest.value) : 'Belum ada biaya', 'tag')}
      ${statBox('Rata-rata per hari', fmtRp(perDay), `dihitung ${elapsed} hari`, 'calendar')}`;
  }

  renderList();
  renderCats(breakdown, total);
}

function renderList() {
  if (!root) return;
  const list = filteredExpenses();
  const month = monthExpenses();
  const listEl = root.querySelector('#exp-list');
  const emptyEl = root.querySelector('#exp-empty');
  const totalEl = root.querySelector('#exp-total');
  const title = root.querySelector('#exp-list-title');
  const sub = root.querySelector('#exp-list-sub');
  const filteredTotal = sum(list, (e) => e.amount);
  const monthTotal = sum(month, (e) => e.amount);
  const hasFilter = Boolean(ui.q || ui.category);

  if (title) title.textContent = fmtDate(monthDate(), 'month');
  if (sub) sub.textContent = hasFilter
    ? `${list.length} catatan cocok dengan filter`
    : `${month.length} catatan pengeluaran`;

  if (!list.length) {
    if (listEl) listEl.innerHTML = '';
    if (totalEl) totalEl.innerHTML = '';
    if (emptyEl) {
      emptyEl.innerHTML = hasFilter
        ? emptyState({ iconName: 'search', title: 'Tidak ada yang cocok', text: 'Ubah kata kunci atau pilih kategori lain.', mini: true })
        : emptyState({
          iconName: 'wallet', title: 'Belum ada pengeluaran',
          text: `Belum ada biaya operasional yang dicatat pada ${fmtDate(monthDate(), 'month')}.`,
          action: 'add', actionLabel: 'Catat pengeluaran'
        });
    }
    return;
  }

  if (emptyEl) emptyEl.innerHTML = '';
  if (listEl) {
    listEl.innerHTML = list.map((e) => {
      const cat = e.category || 'Lainnya';
      return `<div class="expense-row">
        <span class="er-ic">${icon(CAT_ICONS[cat] || 'wallet')}</span>
        <div class="er-main">
          <strong>${esc(e.note || cat)}</strong>
          <span>${esc(cat)} · ${fmtDate(e.date, 'long')}</span>
        </div>
        <span class="er-amount">${fmtRp(e.amount)}</span>
        <div class="er-actions">
          <button class="icon-btn" data-edit="${esc(e.id)}" title="Edit">${icon('edit')}</button>
          <button class="icon-btn" data-del="${esc(e.id)}" title="Hapus">${icon('trash')}</button>
        </div>
      </div>`;
    }).join('');
  }

  if (totalEl) {
    totalEl.innerHTML = `
      <span class="dim" style="font-size:10.5px">${hasFilter ? `${list.length} catatan terfilter` : `${month.length} catatan`}</span>
      <span style="font-size:11px;color:var(--muted)">Total ${hasFilter ? 'terfilter' : 'bulan ini'} <strong style="font-size:15px;color:var(--ink);margin-left:6px">${fmtRp(hasFilter ? filteredTotal : monthTotal)}</strong></span>`;
  }
}

function renderCats(breakdown, total) {
  const el = root.querySelector('#exp-cats');
  if (!el) return;
  if (!breakdown.length) {
    el.innerHTML = `<div class="hint" style="padding:10px 0">Belum ada pengeluaran pada bulan ini.</div>`;
    return;
  }
  el.innerHTML = `<div class="expense-cat-list">
    ${breakdown.map((b, i) => {
      const pct = total ? (b.value / total) * 100 : 0;
      return `<div class="exp-cat-row">
        <div class="exp-cat-top"><span>${esc(b.label)}</span><strong>${fmtRp(b.value)}</strong></div>
        <div class="progress amber"><i style="width:${pct}%;background:${CAT_COLORS[i % CAT_COLORS.length]}"></i></div>
        <div class="hint" style="margin-top:1px">${fmtPct(pct)} dari total</div>
      </div>`;
    }).join('')}
  </div>`;
}

/* ---------------- form ---------------- */
function openExpenseForm(expense = null) {
  const isEdit = Boolean(expense);
  const data = expense || { date: inputDate(new Date()), category: '', amount: '', note: '' };
  openModal({
    title: isEdit ? 'Edit pengeluaran' : 'Tambah pengeluaran',
    subtitle: isEdit ? 'Perbarui catatan biaya operasional.' : 'Catat biaya toko agar laba bersih lebih akurat.',
    size: 'narrow',
    body: `<form id="exp-form" novalidate>
      <div class="field">
        <label class="label" for="ef-date">Tanggal <span class="req">*</span></label>
        <input class="input" id="ef-date" type="date" value="${inputDate(data.date)}">
      </div>
      <div class="field mt-12">
        <label class="label" for="ef-category">Kategori <span class="req">*</span></label>
        <input class="input" id="ef-category" list="ef-categories" maxlength="50" value="${esc(data.category || '')}" placeholder="Contoh: Listrik & Air">
        <datalist id="ef-categories">${categoriesInUse().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
      </div>
      <div class="field mt-12">
        <label class="label" for="ef-amount">Nominal <span class="req">*</span></label>
        <div class="input-group"><span class="ig-prefix">Rp</span><input class="input input-lg" id="ef-amount" data-money inputmode="numeric" value="${data.amount ? fmtNum(data.amount) : ''}" placeholder="0"></div>
      </div>
      <div class="field mt-12">
        <label class="label" for="ef-note">Keterangan</label>
        <input class="input" id="ef-note" maxlength="220" value="${esc(data.note || '')}" placeholder="Contoh: token listrik toko">
      </div>
      <div class="info-callout mt-16">${icon('info')}<span>Biaya ini akan mengurangi laba bersih, tetapi tidak mengurangi stok barang. Untuk belanja stok, gunakan menu Produk → Restok.</span></div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-cancel>Batal</button><button class="btn btn-primary" data-save>${icon('check')}${isEdit ? 'Simpan perubahan' : 'Tambah pengeluaran'}</button>`,
    onMount: ({ body, foot, close }) => {
      foot.querySelector('[data-cancel]').addEventListener('click', close);
      const save = async () => {
        const payload = {
          date: body.querySelector('#ef-date').value,
          category: body.querySelector('#ef-category').value.trim() || 'Lainnya',
          amount: parseMoney(body.querySelector('#ef-amount').value),
          note: body.querySelector('#ef-note').value.trim()
        };
        if (!payload.amount) return toast('Nominal pengeluaran wajib diisi.', 'warn');
        try {
          await saveExpense(payload, isEdit ? expense.id : null);
          close();
          toast(isEdit ? 'Pengeluaran diperbarui.' : 'Pengeluaran berhasil dicatat.', 'success');
        } catch (err) {
          toast(err.message || 'Gagal menyimpan pengeluaran.', 'error');
        }
      };
      foot.querySelector('[data-save]').addEventListener('click', save);
      body.querySelector('#exp-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    }
  });
}

async function removeExpense(expense) {
  const ok = await confirmDialog({
    title: 'Hapus pengeluaran?',
    message: `<b>${esc(expense.note || expense.category)}</b> sebesar <b>${fmtRp(expense.amount)}</b> akan dihapus.`,
    confirmText: 'Ya, hapus',
    danger: true,
    iconName: 'trash'
  });
  if (!ok) return;
  try {
    await deleteExpense(expense.id);
    toast('Pengeluaran dihapus.', 'success');
  } catch (err) {
    toast(err.message || 'Gagal menghapus pengeluaran.', 'error');
  }
}

/* ---------------- export ---------------- */
function exportCsv() {
  const list = filteredExpenses();
  if (!list.length) return toast('Tidak ada pengeluaran untuk diekspor.', 'warn');
  const rows = list.map((e) => [
    fmtDate(e.date, 'long'), e.category || 'Lainnya', e.note || '', Number(e.amount) || 0
  ]);
  rows.push([]);
  rows.push(['TOTAL', '', '', sum(list, (e) => e.amount)]);
  downloadCsv(`pengeluaran-tokoku-${ui.month}.csv`, rows, ['Tanggal', 'Kategori', 'Keterangan', 'Nominal']);
  toast(`${list.length} pengeluaran diekspor ke CSV.`, 'success');
}
