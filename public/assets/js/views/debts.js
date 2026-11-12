/* ==========================================================================
   TokoKu — Kasbon & pelanggan
   ========================================================================== */

import {
  esc, icon, fmtRp, fmtNum, fmtPct, fmtDate, fmtDateTime, initials, dueLabel,
  waLink, inputDate, addDays, startOfMonth, parseMoney, parseLocalDate
} from '../utils.js';
import {
  state, openDebts, totalReceivable, overdueDebts, debtRemaining,
  addDebtPayment, createManualDebt, saveCustomer, deleteCustomer, deleteDebt,
  customerDebt, customerTransactions, paymentsInRange, txDate
} from '../store.js';
import { openModal, confirmDialog, toast, emptyState, paymentBadge } from '../ui.js';
import { pageHead, statBox, openTxDetail } from './common.js';

const ui = {
  tab: 'open',
  q: '',
  customer: ''
};

let root = null;

function phoneOf(debt) {
  const c = state.customers.find((row) => row.id === debt.customerId);
  return (c && c.phone) || '';
}

function customerName(debt) {
  const c = state.customers.find((row) => row.id === debt.customerId);
  return (c && c.name) || debt.customerName || 'Pelanggan';
}

function paidDebts() {
  return state.debts
    .filter((d) => !d.voided && (d.status === 'paid' || (debtRemaining(d) <= 0 && (Number(d.paid) || 0) > 0)))
    .sort((a, b) => {
      const da = a.paidAt && a.paidAt.toDate ? a.paidAt.toDate() : (a.updatedAt && a.updatedAt.toDate ? a.updatedAt.toDate() : txDate(a));
      const db = b.paidAt && b.paidAt.toDate ? b.paidAt.toDate() : (b.updatedAt && b.updatedAt.toDate ? b.updatedAt.toDate() : txDate(b));
      return db - da;
    });
}

function visibleDebts() {
  let list = ui.tab === 'paid' ? paidDebts() : openDebts();
  if (ui.customer) list = list.filter((d) => d.customerId === ui.customer);
  const q = ui.q.trim().toLowerCase();
  if (q) {
    list = list.filter((d) => `${customerName(d)} ${d.invoice || ''} ${d.note || ''} ${phoneOf(d)}`.toLowerCase().includes(q));
  }
  if (ui.tab === 'open') {
    list = [...list].sort((a, b) => {
      const dueA = a.dueDate && a.dueDate.toDate ? a.dueDate.toDate().getTime() : Infinity;
      const dueB = b.dueDate && b.dueDate.toDate ? b.dueDate.toDate().getTime() : Infinity;
      return dueA - dueB;
    });
  }
  return list;
}

function visibleCustomers() {
  const q = ui.q.trim().toLowerCase();
  return state.customers
    .filter((c) => !ui.customer || c.id === ui.customer)
    .filter((c) => !q || `${c.name} ${c.phone || ''} ${c.address || ''}`.toLowerCase().includes(q))
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
}

/* ---------------- view ---------------- */
export default {
  render(el, ctx) {
    root = el;
    if (ctx && ctx.query) {
      const customer = ctx.query.get('customer');
      if (customer) {
        ui.customer = customer;
        ui.tab = 'open';
      }
    }

    el.innerHTML = `
      ${pageHead({
        title: 'Kasbon & pelanggan',
        desc: 'Pantau piutang pelanggan, terima cicilan, dan simpan kontak langganan toko.',
        actions: `
          <button class="btn btn-secondary btn-sm" data-add-customer>${icon('user')}Pelanggan baru</button>
          <button class="btn btn-primary btn-sm" data-add-debt>${icon('plus')}Catat kasbon</button>`
      })}

      <div id="debt-tabs"></div>
      <div class="debt-summary" id="debt-stats"></div>

      <div class="card filter-bar">
        <div class="search-grow input-icon">
          ${icon('search')}
          <input class="input" id="debt-search" type="search" placeholder="Cari nama pelanggan, nomor HP, atau nota…" value="${esc(ui.q)}" autocomplete="off">
        </div>
        <div id="debt-filter"></div>
      </div>

      <div id="debt-body"></div>`;

    bind(el);
    refresh();

    if (ctx && ctx.query && ctx.query.get('add') === '1') {
      setTimeout(() => openDebtForm(), 120);
    }
  },

  onChange(keys) {
    if (!root) return;
    if (['debts', 'customers', 'transactions', 'store', 'ready'].some((k) => keys.has(k))) refresh();
  }
};

function bind(el) {
  el.querySelector('#debt-tabs').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-tab]');
    if (!btn) return;
    ui.tab = btn.getAttribute('data-tab');
    refresh();
  });

  el.querySelector('#debt-search').addEventListener('input', (e) => {
    ui.q = e.target.value;
    refresh();
  });

  el.querySelector('[data-add-debt]').addEventListener('click', () => openDebtForm());
  el.querySelector('[data-add-customer]').addEventListener('click', () => openCustomerForm());

  el.addEventListener('click', (e) => {
    const clear = e.target.closest('[data-clear-customer]');
    if (clear) {
      ui.customer = '';
      refresh();
      return;
    }
    const pay = e.target.closest('[data-pay]');
    if (pay) {
      const debt = state.debts.find((d) => d.id === pay.getAttribute('data-pay'));
      if (debt) openPayment(debt);
      return;
    }
    const detail = e.target.closest('[data-detail]');
    if (detail) {
      const debt = state.debts.find((d) => d.id === detail.getAttribute('data-detail'));
      if (debt) openDebtDetail(debt);
      return;
    }
    const wa = e.target.closest('[data-wa]');
    if (wa) {
      const debt = state.debts.find((d) => d.id === wa.getAttribute('data-wa'));
      if (debt) sendReminder(debt);
      return;
    }
    const del = e.target.closest('[data-del]');
    if (del) {
      const debt = state.debts.find((d) => d.id === del.getAttribute('data-del'));
      if (debt) removeDebt(debt);
      return;
    }
    const custDebt = e.target.closest('[data-cust-debt]');
    if (custDebt) {
      const customer = state.customers.find((c) => c.id === custDebt.getAttribute('data-cust-debt'));
      openDebtForm(customer);
      return;
    }
    const editCust = e.target.closest('[data-edit-customer]');
    if (editCust) {
      const customer = state.customers.find((c) => c.id === editCust.getAttribute('data-edit-customer'));
      openCustomerForm(customer);
      return;
    }
    const delCust = e.target.closest('[data-del-customer]');
    if (delCust) {
      const customer = state.customers.find((c) => c.id === delCust.getAttribute('data-del-customer'));
      if (customer) removeCustomer(customer);
      return;
    }
    const addDebt = e.target.closest('[data-action="add-debt"]');
    if (addDebt) openDebtForm();
    const addCustomer = e.target.closest('[data-action="add-customer"]');
    if (addCustomer) openCustomerForm();
  });
}

function refresh() {
  if (!root) return;
  const open = openDebts();
  const overdue = overdueDebts();
  const paid = paidDebts();
  const customers = state.customers;
  const receivables = totalReceivable();
  const monthPay = paymentsInRange(state.debts, startOfMonth(new Date()), new Date()).total;
  const withDebt = new Set(open.map((d) => d.customerId).filter(Boolean)).size;

  const tabs = root.querySelector('#debt-tabs');
  if (tabs) {
    tabs.className = 'tab-bar';
    tabs.innerHTML = `
      <button data-tab="open" class="${ui.tab === 'open' ? 'active' : ''}">${icon('users')}Kasbon aktif <span class="badge ${overdue.length ? 'red' : ''}">${open.length}</span></button>
      <button data-tab="paid" class="${ui.tab === 'paid' ? 'active' : ''}">${icon('check-circle')}Sudah lunas <span class="badge green">${paid.length}</span></button>
      <button data-tab="customers" class="${ui.tab === 'customers' ? 'active' : ''}">${icon('user')}Pelanggan <span class="badge">${customers.length}</span></button>`;
  }

  const stats = root.querySelector('#debt-stats');
  if (stats) {
    stats.innerHTML = `
      ${statBox('Total piutang', fmtRp(receivables), `${open.length} kasbon berjalan`, 'wallet')}
      ${statBox('Lewat jatuh tempo', String(overdue.length), overdue.length ? 'Perlu ditagih segera' : 'Semua aman', 'clock')}
      ${statBox('Pelanggan berhutang', String(withDebt), `dari ${customers.length} pelanggan`, 'users')}
      ${statBox('Diterima bulan ini', fmtRp(monthPay), 'Pembayaran cicilan kasbon', 'banknote')}`;
  }

  const filter = root.querySelector('#debt-filter');
  if (filter) {
    if (ui.customer) {
      const c = state.customers.find((row) => row.id === ui.customer);
      filter.innerHTML = `<button class="chip active" data-clear-customer>${icon('user')} ${esc((c && c.name) || 'Pelanggan terpilih')} ${icon('x')}</button>`;
    } else {
      filter.innerHTML = '';
    }
  }

  const body = root.querySelector('#debt-body');
  if (!body) return;

  if (ui.tab === 'customers') {
    renderCustomers(body);
    return;
  }

  const list = visibleDebts();
  if (!list.length) {
    body.innerHTML = `<div class="card">${emptyState({
      iconName: ui.tab === 'paid' ? 'check-circle' : 'users',
      title: ui.tab === 'paid' ? 'Belum ada kasbon lunas' : 'Tidak ada kasbon',
      text: ui.q || ui.customer
        ? 'Tidak ada kasbon yang cocok dengan pencarian. Coba hapus filter.'
        : ui.tab === 'paid'
          ? 'Kasbon yang sudah dibayar penuh akan muncul di sini sebagai riwayat.'
          : 'Kasbon dari transaksi kasir atau catatan manual akan tampil di sini.',
      action: ui.tab === 'paid' ? '' : 'add-debt',
      actionLabel: 'Catat kasbon'
    })}</div>`;
    return;
  }

  body.innerHTML = `<div class="debt-grid">${list.map((d) => debtCard(d, ui.tab === 'paid')).join('')}</div>`;
}

/* ---------------- cards ---------------- */
function debtCard(debt, isPaid) {
  const name = customerName(debt);
  const phone = phoneOf(debt);
  const amount = Number(debt.amount) || 0;
  const paid = Number(debt.paid) || 0;
  const remaining = debtRemaining(debt);
  const progress = amount ? Math.min(100, (paid / amount) * 100) : 0;
  const due = dueLabel(debt.dueDate);
  const overdue = !isPaid && due.tone === 'red';
  const payments = debt.payments || [];
  const subtitle = [
    phone || 'Tanpa nomor HP',
    debt.type === 'sale' ? (debt.invoice || 'Kasbon transaksi') : 'Kasbon manual'
  ].join(' · ');
  const badge = isPaid
    ? `<span class="badge green">${icon('check-circle')}Lunas</span>`
    : overdue
      ? `<span class="badge red">${icon('clock')}${esc(due.text)}</span>`
      : due.tone
        ? `<span class="badge amber">${icon('clock')}${esc(due.text)}</span>`
        : `<span class="badge outline">${esc(due.text)}</span>`;

  return `<div class="debt-card ${overdue ? 'overdue' : ''} ${isPaid ? 'paid' : ''}">
    <div class="debt-top">
      <div class="dc-avatar">${esc(initials(name))}</div>
      <div class="dc-main">
        <strong>${esc(name)}</strong>
        <span>${esc(subtitle)}</span>
      </div>
      ${badge}
    </div>
    <div class="debt-amount">
      <div>
        <div class="da-label">${isPaid ? 'Total kasbon' : 'Sisa kasbon'}</div>
        <div class="da-value" style="color:${isPaid ? 'var(--muted)' : overdue ? 'var(--red)' : 'var(--ink)'}">${fmtRp(isPaid ? amount : remaining)}</div>
        <div class="da-paid">Dari ${fmtRp(amount)} · terbayar ${fmtRp(paid)}${payments.length ? ` · ${payments.length} cicilan` : ''}</div>
      </div>
      <span class="badge ${isPaid ? 'green' : progress >= 50 ? 'amber' : 'purple'}">${fmtPct(progress)}</span>
    </div>
    <div class="debt-progress">
      <div class="dp-labels"><span>Kemajuan pembayaran</span><span>${fmtPct(progress)}</span></div>
      <div class="progress ${overdue ? 'red' : ''}"><i style="width:${progress}%"></i></div>
    </div>
    ${debt.note ? `<div class="hint" style="line-height:1.45">${icon('message', 'ic-sm')} ${esc(debt.note)}</div>` : ''}
    <div class="debt-actions">
      ${!isPaid ? `<button class="btn btn-primary btn-sm" data-pay="${esc(debt.id)}">${icon('banknote')}Terima bayar</button>` : `<button class="btn btn-secondary btn-sm" data-detail="${esc(debt.id)}">${icon('history')}Riwayat</button>`}
      ${phone ? `<button class="btn btn-secondary btn-sm" data-wa="${esc(debt.id)}" title="Kirim pengingat WhatsApp">${icon('message')}WA</button>` : ''}
      ${!isPaid && phone ? `<button class="btn btn-secondary btn-sm btn-icon" data-detail="${esc(debt.id)}" title="Lihat riwayat">${icon('eye')}</button>` : ''}
      ${!isPaid && paid === 0 ? `<button class="btn btn-danger-soft btn-sm btn-icon" data-del="${esc(debt.id)}" title="Hapus kasbon">${icon('trash')}</button>` : ''}
    </div>
  </div>`;
}

function renderCustomers(body) {
  const customers = visibleCustomers();
  if (!customers.length) {
    body.innerHTML = `<div class="card">${emptyState({
      iconName: 'user',
      title: ui.q || ui.customer ? 'Pelanggan tidak ditemukan' : 'Belum ada pelanggan',
      text: 'Simpan nama dan nomor HP pelanggan agar mudah menagih kasbon lewat WhatsApp.',
      action: 'add-customer', actionLabel: 'Tambah pelanggan'
    })}</div>`;
    return;
  }
  body.innerHTML = `<div class="customer-grid">${customers.map((c) => {
    const debt = customerDebt(c.id);
    const count = customerTransactions(c.id).length;
    return `<div class="customer-card">
      <div class="cc-avatar">${esc(initials(c.name))}</div>
      <div class="cc-main">
        <strong>${esc(c.name)}</strong>
        <span>${esc(c.phone || 'Tanpa nomor HP')}${c.address ? ' · ' + esc(c.address) : ''}</span>
        <span>${count} transaksi${c.note ? ' · ' + esc(c.note) : ''}</span>
      </div>
      <div class="cc-debt"><span>Kasbon</span><strong>${debt ? fmtRp(debt) : 'Rp 0'}</strong></div>
      <div class="flex gap-4" style="align-items:center">
        <button class="icon-btn" data-cust-debt="${esc(c.id)}" title="Catat kasbon">${icon('plus')}</button>
        <button class="icon-btn" data-edit-customer="${esc(c.id)}" title="Edit pelanggan">${icon('edit')}</button>
        <button class="icon-btn" data-del-customer="${esc(c.id)}" title="Hapus pelanggan">${icon('trash')}</button>
      </div>
    </div>`;
  }).join('')}</div>`;
}

/* ---------------- payment ---------------- */
function openPayment(debt) {
  const remaining = debtRemaining(debt);
  const name = customerName(debt);
  const methodOptions = ['cash', 'qris', 'transfer'];

  openModal({
    title: 'Terima pembayaran kasbon',
    subtitle: name,
    size: 'narrow',
    body: `
      <div class="green-callout mb-16">${icon('wallet')}<span>Sisa kasbon <b>${fmtRp(remaining)}</b> dari total <b>${fmtRp(debt.amount)}</b>${debt.invoice ? ` · nota ${esc(debt.invoice)}` : ''}.</span></div>
      <div class="field">
        <label class="label" for="dp-amount">Nominal diterima <span class="req">*</span></label>
        <div class="input-group"><span class="ig-prefix">Rp</span><input class="input input-lg" id="dp-amount" data-money inputmode="numeric" value="${fmtNum(remaining)}"></div>
      </div>
      <div class="chips mt-8">
        <button type="button" class="chip" data-quick="half">Setengah (${fmtRp(Math.ceil(remaining / 2))})</button>
        <button type="button" class="chip" data-quick="full">Lunasi (${fmtRp(remaining)})</button>
      </div>
      <div class="form-grid mt-16">
        <div class="field">
          <label class="label" for="dp-method">Metode bayar</label>
          <select class="select" id="dp-method">
            ${methodOptions.map((m) => `<option value="${m}">${m === 'cash' ? 'Tunai' : m === 'qris' ? 'QRIS' : 'Transfer'}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label class="label" for="dp-note">Catatan</label>
          <input class="input" id="dp-note" maxlength="180" placeholder="Opsional">
        </div>
      </div>
      <div class="hint mt-12" id="dp-info"></div>`,
    footer: `<button class="btn btn-secondary" data-cancel>Batal</button><button class="btn btn-primary" data-save>${icon('check')}Simpan pembayaran</button>`,
    onMount: ({ body, foot, close }) => {
      const amount = body.querySelector('#dp-amount');
      const info = body.querySelector('#dp-info');
      const update = () => {
        const value = parseMoney(amount.value);
        const next = Math.max(0, remaining - value);
        info.innerHTML = value > remaining
          ? `<span style="color:var(--red);font-weight:700">Nominal melebihi sisa kasbon.</span>`
          : next === 0
            ? `<span style="color:var(--brand);font-weight:700">Kasbon akan lunas setelah pembayaran ini. 🎉</span>`
            : `Sisa setelah pembayaran: <b>${fmtRp(next)}</b>`;
      };
      amount.addEventListener('input', update);
      amount.addEventListener('moneychange', update);
      update();

      body.querySelectorAll('[data-quick]').forEach((btn) => {
        btn.addEventListener('click', () => {
          const value = btn.getAttribute('data-quick') === 'half' ? Math.ceil(remaining / 2) : remaining;
          amount.value = fmtNum(value);
          amount.dispatchEvent(new Event('input', { bubbles: true }));
          amount.focus();
        });
      });

      foot.querySelector('[data-cancel]').addEventListener('click', close);
      foot.querySelector('[data-save]').addEventListener('click', async () => {
        const value = parseMoney(amount.value);
        if (value <= 0) return toast('Masukkan nominal pembayaran.', 'warn');
        if (value > remaining) return toast('Nominal melebihi sisa kasbon.', 'warn');
        try {
          await addDebtPayment(debt.id, value, body.querySelector('#dp-note').value.trim(), body.querySelector('#dp-method').value);
          close();
          toast(`Pembayaran ${fmtRp(value)} dari ${name} tersimpan.`, 'success', 'Pembayaran diterima');
        } catch (err) {
          toast(err.message || 'Gagal menyimpan pembayaran.', 'error');
        }
      });
    }
  });
}

/* ---------------- manual debt ---------------- */
function openDebtForm(preselected = null) {
  const customers = [...state.customers].sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
  const selectedId = preselected ? preselected.id : (ui.customer || '');

  openModal({
    title: 'Catat kasbon',
    subtitle: 'Untuk kasbon di luar transaksi kasir.',
    size: 'wide',
    body: `<form id="debt-form" novalidate>
      <div class="form-grid">
        <div class="field span-2">
          <label class="label" for="db-customer">Pelanggan</label>
          <select class="select" id="db-customer">
            <option value="">— Pelanggan baru —</option>
            ${customers.map((c) => `<option value="${esc(c.id)}" ${selectedId === c.id ? 'selected' : ''}>${esc(c.name)}${c.phone ? ' · ' + esc(c.phone) : ''}</option>`).join('')}
          </select>
        </div>
        <div class="field" id="db-new-name-field">
          <label class="label" for="db-name">Nama pelanggan baru <span class="req">*</span></label>
          <input class="input" id="db-name" maxlength="100" value="${preselected ? esc(preselected.name) : ''}" placeholder="Contoh: Bu Siti">
        </div>
        <div class="field" id="db-new-phone-field">
          <label class="label" for="db-phone">No. HP</label>
          <input class="input" id="db-phone" inputmode="tel" maxlength="30" value="${preselected ? esc(preselected.phone || '') : ''}" placeholder="08xxxxxxxxxx">
        </div>
        <div class="field">
          <label class="label" for="db-amount">Nominal kasbon <span class="req">*</span></label>
          <div class="input-group"><span class="ig-prefix">Rp</span><input class="input" id="db-amount" data-money inputmode="numeric" placeholder="0"></div>
        </div>
        <div class="field">
          <label class="label" for="db-date">Tanggal kasbon</label>
          <input class="input" id="db-date" type="date" value="${inputDate(new Date())}">
        </div>
        <div class="field">
          <label class="label" for="db-due">Jatuh tempo</label>
          <input class="input" id="db-due" type="date" value="${inputDate(addDays(new Date(), 14))}">
        </div>
        <div class="field">
          <label class="label" for="db-note">Keterangan</label>
          <input class="input" id="db-note" maxlength="220" placeholder="Contoh: belanja sembako">
        </div>
      </div>
      <div class="info-callout mt-16">${icon('info')}<span>Kasbon manual tidak mengubah stok dan tidak dihitung sebagai penjualan baru. Gunakan untuk mencatat utang pelanggan yang belum tercatat di kasir.</span></div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-cancel>Batal</button><button class="btn btn-primary" data-save>${icon('check')}Simpan kasbon</button>`,
    onMount: ({ body, foot, close }) => {
      const select = body.querySelector('#db-customer');
      const nameField = body.querySelector('#db-new-name-field');
      const phoneField = body.querySelector('#db-new-phone-field');
      const toggleNew = () => {
        const isNew = !select.value;
        nameField.style.display = isNew ? '' : 'none';
        phoneField.style.display = isNew ? '' : 'none';
      };
      select.addEventListener('change', toggleNew);
      toggleNew();

      foot.querySelector('[data-cancel]').addEventListener('click', close);
      const save = async () => {
        const amount = parseMoney(body.querySelector('#db-amount').value);
        if (amount <= 0) return toast('Nominal kasbon wajib diisi.', 'warn');
        const customerId = select.value;
        const newName = body.querySelector('#db-name').value.trim();
        const newPhone = body.querySelector('#db-phone').value.trim();
        if (!customerId && !newName) return toast('Nama pelanggan wajib diisi.', 'warn');
        try {
          let cid = customerId;
          if (!cid) cid = await saveCustomer({ name: newName, phone: newPhone });
          const customer = state.customers.find((c) => c.id === cid);
          await createManualDebt({
            customerId: cid,
            customerName: (customer && customer.name) || newName,
            amount,
            note: body.querySelector('#db-note').value.trim(),
            date: body.querySelector('#db-date').value,
            dueDate: body.querySelector('#db-due').value
          });
          close();
          toast(`Kasbon ${fmtRp(amount)} untuk ${(customer && customer.name) || newName} tersimpan.`, 'success', 'Kasbon dicatat');
        } catch (err) {
          toast(err.message || 'Gagal menyimpan kasbon.', 'error');
        }
      };
      foot.querySelector('[data-save]').addEventListener('click', save);
      body.querySelector('#debt-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    }
  });
}

/* ---------------- customer form ---------------- */
function openCustomerForm(customer = null) {
  const isEdit = Boolean(customer);
  const data = customer || {};
  openModal({
    title: isEdit ? 'Edit pelanggan' : 'Pelanggan baru',
    subtitle: isEdit ? 'Perbarui nama, nomor HP, dan alamat pelanggan.' : 'Simpan kontak pelanggan untuk kasbon dan pengingat WhatsApp.',
    size: 'narrow',
    body: `<form id="cust-form" novalidate>
      <div class="field">
        <label class="label" for="cf-name">Nama pelanggan <span class="req">*</span></label>
        <input class="input input-lg" id="cf-name" maxlength="100" value="${esc(data.name || '')}" placeholder="Contoh: Bu Siti" required>
      </div>
      <div class="field mt-12">
        <label class="label" for="cf-phone">No. HP / WhatsApp</label>
        <input class="input" id="cf-phone" inputmode="tel" maxlength="30" value="${esc(data.phone || '')}" placeholder="08xxxxxxxxxx">
      </div>
      <div class="field mt-12">
        <label class="label" for="cf-address">Alamat</label>
        <input class="input" id="cf-address" maxlength="220" value="${esc(data.address || '')}" placeholder="RT / RW atau patokan rumah">
      </div>
      <div class="field mt-12">
        <label class="label" for="cf-note">Catatan</label>
        <input class="input" id="cf-note" maxlength="220" value="${esc(data.note || '')}" placeholder="Contoh: langganan mingguan">
      </div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-cancel>Batal</button><button class="btn btn-primary" data-save>${icon('check')}${isEdit ? 'Simpan perubahan' : 'Tambah pelanggan'}</button>`,
    onMount: ({ body, foot, close }) => {
      foot.querySelector('[data-cancel]').addEventListener('click', close);
      const save = async () => {
        const payload = {
          name: body.querySelector('#cf-name').value.trim(),
          phone: body.querySelector('#cf-phone').value.trim(),
          address: body.querySelector('#cf-address').value.trim(),
          note: body.querySelector('#cf-note').value.trim()
        };
        if (!payload.name) return toast('Nama pelanggan wajib diisi.', 'warn');
        try {
          await saveCustomer(payload, isEdit ? customer.id : null);
          close();
          toast(isEdit ? 'Data pelanggan diperbarui.' : 'Pelanggan baru ditambahkan.', 'success');
        } catch (err) {
          toast(err.message || 'Gagal menyimpan pelanggan.', 'error');
        }
      };
      foot.querySelector('[data-save]').addEventListener('click', save);
      body.querySelector('#cust-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    }
  });
}

/* ---------------- detail ---------------- */
function openDebtDetail(debt) {
  const name = customerName(debt);
  const phone = phoneOf(debt);
  const amount = Number(debt.amount) || 0;
  const paid = Number(debt.paid) || 0;
  const remaining = debtRemaining(debt);
  const progress = amount ? Math.min(100, (paid / amount) * 100) : 0;
  const due = dueLabel(debt.dueDate);
  const payments = debt.payments || [];
  const tx = debt.transactionId ? state.recent.find((t) => t.id === debt.transactionId || t.invoice === debt.invoice) : null;

  openModal({
    title: 'Detail kasbon',
    subtitle: name,
    size: 'wide',
    body: `
      <div class="detail-head">
        <div>
          <div class="dh-label">${debt.type === 'sale' ? 'Kasbon transaksi' : 'Kasbon manual'}</div>
          <div class="dh-invoice">${esc(debt.invoice || 'KASBON-MANUAL')}</div>
          <div class="dh-date">${fmtDate(debt.date, 'full')}</div>
        </div>
        <div class="dh-total">
          <strong>${fmtRp(remaining)}</strong>
          <span>sisa dari ${fmtRp(amount)}</span>
        </div>
      </div>
      <div class="detail-meta" style="margin-top:14px">
        <div class="dm-item"><span>Pelanggan</span><strong>${esc(name)}</strong></div>
        <div class="dm-item"><span>No. HP</span><strong>${esc(phone || '-')}</strong></div>
        <div class="dm-item"><span>Jatuh tempo</span><strong style="color:${due.tone === 'red' ? 'var(--red)' : due.tone === 'amber' ? 'var(--amber)' : 'var(--ink)'}">${esc(due.text)}</strong></div>
        <div class="dm-item"><span>Status</span><strong>${remaining <= 0 ? 'Lunas' : 'Belum lunas'}</strong></div>
      </div>
      <div class="debt-progress mt-16">
        <div class="dp-labels"><span>Terbayar ${fmtRp(paid)}</span><span>${fmtPct(progress)}</span></div>
        <div class="progress ${due.tone === 'red' && remaining > 0 ? 'red' : ''}"><i style="width:${progress}%"></i></div>
      </div>
      ${debt.note ? `<div class="detail-note">${icon('message', 'ic-sm')} ${esc(debt.note)}</div>` : ''}
      <div class="mt-16">
        <div class="dh-label" style="margin-bottom:6px">Riwayat pembayaran</div>
        ${payments.length ? `<div class="debt-history">${payments.map((p) => `
          <div class="debt-history-row">
            <span class="dh-ic">${icon('check')}</span>
            <span class="dh-main"><strong>${fmtDateTime(p.date)}</strong><span>${p.method ? esc(p.method.toUpperCase()) : 'Tunai'}${p.note ? ' · ' + esc(p.note) : ''}</span></span>
            <span class="dh-amount" style="color:var(--brand)">+${fmtRp(p.amount)}</span>
          </div>`).join('')}</div>` : `<div class="hint" style="padding:10px 0">Belum ada pembayaran. Sisa kasbon ${fmtRp(remaining)}.</div>`}
      </div>
      ${tx ? `<button class="btn btn-secondary btn-sm mt-16" data-view-tx>${icon('receipt')}Lihat nota transaksi</button>` : ''}`,
    footer: `<button class="btn btn-secondary" data-close>${icon('x')}Tutup</button>
      ${phone ? `<button class="btn btn-secondary" data-wa>${icon('message')}WhatsApp</button>` : ''}
      ${remaining > 0 ? `<button class="btn btn-primary" data-pay>${icon('banknote')}Terima pembayaran</button>` : ''}`,
    onMount: ({ body, foot, close }) => {
      foot.querySelector('[data-close]').addEventListener('click', close);
      foot.querySelector('[data-wa]')?.addEventListener('click', () => sendReminder(debt));
      foot.querySelector('[data-pay]')?.addEventListener('click', () => { close(); setTimeout(() => openPayment(debt), 180); });
      body.querySelector('[data-view-tx]')?.addEventListener('click', () => { close(); setTimeout(() => openTxDetail(tx), 180); });
    }
  });
}

/* ---------------- reminders & delete ---------------- */
function sendReminder(debt) {
  const phone = phoneOf(debt);
  if (!phone) return toast('Pelanggan ini belum memiliki nomor HP.', 'warn');
  const name = customerName(debt);
  const remaining = debtRemaining(debt);
  const due = dueLabel(debt.dueDate);
  const store = state.store || {};
  const text = `Halo ${name}, kami dari *${store.name || 'TokoKu'}*.\n\nKami ingin mengingatkan kasbon sebesar *${fmtRp(remaining)}*${debt.invoice ? ` (nota ${debt.invoice})` : ''} yang ${due.tone === 'red' ? `sudah lewat jatuh tempo (${due.text.toLowerCase()})` : `jatuh tempo ${due.text.toLowerCase()}`}.\n\nMohon segera melakukan pembayaran. Terima kasih sudah berbelanja 🙏`;
  window.open(waLink(phone, text), '_blank', 'noopener');
}

async function removeDebt(debt) {
  const ok = await confirmDialog({
    title: 'Hapus kasbon?',
    message: `Kasbon <b>${esc(customerName(debt))}</b> sebesar <b>${fmtRp(debtRemaining(debt))}</b> akan dihapus. Tindakan ini tidak bisa diurungkan.`,
    confirmText: 'Ya, hapus',
    danger: true,
    iconName: 'trash'
  });
  if (!ok) return;
  try {
    await deleteDebt(debt.id);
    toast('Kasbon dihapus.', 'success');
  } catch (err) {
    toast(err.message || 'Gagal menghapus kasbon.', 'error');
  }
}

async function removeCustomer(customer) {
  const debt = customerDebt(customer.id);
  if (debt > 0) return toast('Pelanggan masih memiliki kasbon. Lunasi kasbonnya terlebih dahulu.', 'warn');
  const ok = await confirmDialog({
    title: 'Hapus pelanggan?',
    message: `<b>${esc(customer.name)}</b> akan dihapus dari daftar pelanggan. Riwayat transaksi tetap tersimpan.`,
    confirmText: 'Ya, hapus',
    danger: true,
    iconName: 'trash'
  });
  if (!ok) return;
  try {
    await deleteCustomer(customer.id);
    toast('Pelanggan dihapus.', 'success');
  } catch (err) {
    toast(err.message || 'Gagal menghapus pelanggan.', 'error');
  }
}
