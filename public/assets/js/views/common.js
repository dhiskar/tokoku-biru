/* ==========================================================================
   TokoKu — Shared view helpers
   ========================================================================== */

import {
  esc, icon, fmtRp, fmtNum, fmtDate, fmtDateTime, fmtTime, paymentLabel,
  initials
} from '../utils.js';
import {
  openModal, confirmDialog, toast, paymentBadge, receiptPreview,
  printReceipt, waReceiptText
} from '../ui.js';
import { state, voidSale } from '../store.js';
import { waLink } from '../utils.js';

export function pageHead({ title = '', desc = '', actions = '', eyebrow = '' } = {}) {
  return `<div class="page-head">
    <div>
      ${eyebrow ? `<span class="badge green mb-8">${icon('sparkles')}${esc(eyebrow)}</span>` : ''}
      <h1>${esc(title)}</h1>
      ${desc ? `<p>${desc}</p>` : ''}
    </div>
    ${actions ? `<div class="page-actions">${actions}</div>` : ''}
  </div>`;
}

export function kpiCard({ cls = 'green', label = '', icon: iconName = 'chart', value = '', meta = '', spark = '' }) {
  return `<div class="kpi ${cls}">
    <div class="kpi-top">
      <span class="kpi-label">${icon(iconName)}${esc(label)}</span>
      <span class="kpi-ic">${icon(iconName)}</span>
    </div>
    <div class="kpi-value">${value}</div>
    <div class="kpi-meta">${meta || ''}</div>
    ${spark}
  </div>`;
}

export function txMethodBadge(tx) {
  if (tx && tx.voided) return `<span class="badge red">${icon('ban')}Dibatalkan</span>`;
  return paymentBadge(tx ? tx.paymentMethod : 'cash');
}

export function customerPhone(tx) {
  const c = state.customers.find((row) => row.id === tx.customerId);
  return (c && c.phone) || '';
}

export function txDetailBody(tx) {
  const store = state.store || {};
  const items = tx.items || [];
  const rows = items.map((it) => {
    const sub = it.kind === 'digital'
      ? `${esc(it.service ? it.service.toUpperCase() : 'DIGITAL')}${it.target ? ' · ' + esc(it.target) : ''}`
      : `${it.qty} × ${fmtRp(it.price)}${it.unit ? ' / ' + esc(it.unit) : ''}`;
    return `<div class="detail-item">
      <div class="di-emoji">${esc(it.emoji || (it.kind === 'digital' ? '📱' : '📦'))}</div>
      <div class="di-main">
        <strong>${esc(it.name)}</strong>
        <span>${sub}</span>
      </div>
      <div class="di-right">
        <strong>${fmtRp((Number(it.price) || 0) * (Number(it.qty) || 0))}</strong>
        <span>laba ${fmtRp(((Number(it.price) || 0) - (Number(it.cost) || 0)) * (Number(it.qty) || 0))}</span>
      </div>
    </div>`;
  }).join('');

  const debt = state.debts.find((d) => d.transactionId === tx.id && !d.voided && d.status !== 'void');
  return `
    ${tx.voided ? `<div class="void-banner">${icon('ban')}Transaksi dibatalkan${tx.voidReason ? ` — ${esc(tx.voidReason)}` : ''}</div>` : ''}
    <div class="detail-head">
      <div>
        <div class="dh-label">Nomor nota</div>
        <div class="dh-invoice">${esc(tx.invoice || '-')}</div>
        <div class="dh-date">${fmtDate(tx.date, 'full')} · ${fmtTime(tx.date)}</div>
      </div>
      <div class="dh-total">
        <strong>${fmtRp(tx.total)}</strong>
        <span>Laba kotor ${fmtRp(tx.profit)}</span>
      </div>
    </div>
    <div class="detail-items">${rows || '<div class="empty mini"><h3>Tanpa item</h3></div>'}</div>
    <div class="detail-totals">
      <div class="dt-row"><span>Subtotal</span><strong>${fmtRp(tx.subtotal)}</strong></div>
      ${tx.discount ? `<div class="dt-row"><span>Diskon</span><strong>-${fmtRp(tx.discount)}</strong></div>` : ''}
      <div class="dt-row grand"><span>Total</span><strong>${fmtRp(tx.total)}</strong></div>
      <div class="dt-row"><span>HPP (modal)</span><strong>${fmtRp(tx.cost)}</strong></div>
      <div class="dt-row"><span>Laba kotor</span><strong>${fmtRp(tx.profit)}</strong></div>
    </div>
    <div class="detail-meta">
      <div class="dm-item"><span>Metode bayar</span><strong>${tx.voided ? 'Dibatalkan' : esc(paymentLabel(tx.paymentMethod))}</strong></div>
      <div class="dm-item"><span>Kasir</span><strong>${esc(tx.cashier || '-')}</strong></div>
      <div class="dm-item"><span>Pelanggan</span><strong>${esc(tx.customerName || 'Pelanggan umum')}</strong></div>
      <div class="dm-item"><span>${tx.paymentMethod === 'kasbon' ? 'Sisa kasbon' : 'Uang diterima'}</span><strong>${fmtRp(tx.paymentMethod === 'kasbon' ? (debt ? Math.max(0, (Number(debt.amount) || 0) - (Number(debt.paid) || 0)) : tx.total) : (tx.cashReceived || tx.total))}</strong></div>
      ${tx.paymentMethod === 'cash' ? `<div class="dm-item"><span>Kembalian</span><strong>${fmtRp(tx.change || 0)}</strong></div>` : ''}
      <div class="dm-item"><span>Jumlah item</span><strong>${fmtNum(tx.itemCount || items.length)} item</strong></div>
    </div>
    ${tx.note ? `<div class="detail-note">${icon('message', 'ic-sm')} ${esc(tx.note)}</div>` : ''}
    ${tx.voided ? `<div class="detail-note" style="background:var(--red-soft);color:var(--red)">Dibatalkan oleh ${esc(tx.voidedBy || 'kasir')} pada ${fmtDateTime(tx.voidedAt)}</div>` : ''}
    <div class="mt-16">
      <div class="detail-head" style="border-bottom:0;padding-bottom:4px"><div class="dh-label">${icon('receipt', 'ic-sm')} Pratinjau nota</div></div>
      ${receiptPreview(tx, store)}
    </div>`;
}

export function openTxDetail(tx, { onChange } = {}) {
  if (!tx) return;
  const phone = customerPhone(tx);
  const store = state.store || {};

  const modal = openModal({
    title: 'Detail transaksi',
    subtitle: tx.invoice || '',
    size: 'wide',
    body: txDetailBody(tx),
    footer: `
      ${!tx.voided ? `<button class="btn btn-danger-soft btn-sm foot-left" data-void>${icon('ban')}Batalkan</button>` : '<span class="foot-left"></span>'}
      <button class="btn btn-secondary btn-sm" data-close>${icon('x')}Tutup</button>
      ${phone ? `<button class="btn btn-secondary btn-sm" data-wa>${icon('message')}WhatsApp</button>` : ''}
      <button class="btn btn-primary btn-sm" data-print>${icon('printer')}Cetak nota</button>`,
    onMount: ({ body, foot, close }) => {
      foot.querySelector('[data-close]')?.addEventListener('click', close);
      foot.querySelector('[data-print]')?.addEventListener('click', () => {
        printReceipt(tx, store);
        toast('Nota dikirim ke dialog cetak.', 'info');
      });
      foot.querySelector('[data-wa]')?.addEventListener('click', () => {
        window.open(waLink(phone, waReceiptText(tx, store)), '_blank', 'noopener');
      });
      foot.querySelector('[data-void]')?.addEventListener('click', async () => {
        const ok = await confirmDialog({
          title: 'Batalkan transaksi?',
          message: `Transaksi <b>${esc(tx.invoice)}</b> senilai <b>${fmtRp(tx.total)}</b> akan dibatalkan. Stok produk otomatis dikembalikan. Tindakan ini tidak bisa diurungkan.`,
          confirmText: 'Ya, batalkan',
          danger: true,
          iconName: 'ban'
        });
        if (!ok) return;
        try {
          await voidSale(tx);
          close();
          toast('Transaksi dibatalkan dan stok sudah dikembalikan.', 'success', 'Transaksi dibatalkan');
          if (typeof onChange === 'function') onChange();
        } catch (err) {
          toast(err.message || 'Gagal membatalkan transaksi.', 'error');
        }
      });
      body.querySelector('[data-void]')?.addEventListener('click', () => foot.querySelector('[data-void]')?.click());
    }
  });
  return modal;
}

export function statBox(label, value, sub = '', iconName = '') {
  return `<div class="stat-box">
    <div class="sb-label">${iconName ? icon(iconName) : ''}${esc(label)}</div>
    <div class="sb-value">${value}</div>
    ${sub ? `<div class="sb-sub">${sub}</div>` : ''}
  </div>`;
}

export function initialsAvatar(name) {
  return esc(initials(name || 'Pelanggan'));
}
