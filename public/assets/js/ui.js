/* ==========================================================================
   TokoKu — UI kit (toast, modal, chart, receipt)
   ========================================================================== */

import {
  esc, icon, fmtRp, fmtDate, fmtTime, fmtNum, parseMoney, fmtMoneyInput,
  printHTML, paymentLabel, paymentIcon, toDate
} from './utils.js';

/* ---------------- Toast ---------------- */
export function toast(message, type = 'success', title = '') {
  const root = document.getElementById('toast-root');
  if (!root) return;
  const ic = { success: 'check-circle', error: 'alert-circle', warn: 'alert', info: 'info' }[type] || 'check-circle';
  const el = document.createElement('div');
  el.className = `toast ${type}`;
  el.innerHTML = `
    <div class="toast-ic">${icon(ic)}</div>
    <div class="toast-body">
      ${title ? `<strong>${esc(title)}</strong>` : ''}
      <span>${esc(message)}</span>
    </div>
    <button class="toast-close" aria-label="Tutup">${icon('x', 'ic-sm')}</button>`;
  root.appendChild(el);
  const close = () => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 210);
  };
  el.querySelector('.toast-close').addEventListener('click', close);
  setTimeout(close, type === 'error' ? 6500 : 4200);
}

/* ---------------- Modal ---------------- */
export function openModal(options = {}) {
  const {
    title = '', subtitle = '', body = '', footer = '', size = '',
    onMount = null, onClose = null, dismissible = true, className = ''
  } = options;
  const root = document.getElementById('modal-root');
  const overlay = document.createElement('div');
  overlay.className = 'overlay';
  overlay.innerHTML = `
    <div class="modal ${size} ${className}" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="modal-handle"></div>
      <div class="modal-head">
        <div class="grow">
          <h2>${esc(title)}</h2>
          ${subtitle ? `<p>${esc(subtitle)}</p>` : ''}
        </div>
        ${dismissible ? `<button class="modal-close" aria-label="Tutup">${icon('x')}</button>` : ''}
      </div>
      <div class="modal-body">${body}</div>
      ${footer ? `<div class="modal-foot">${footer}</div>` : ''}
    </div>`;
  document.body.appendChild(overlay);
  document.body.classList.add('no-scroll');

  const modal = overlay.querySelector('.modal');
  const bodyEl = overlay.querySelector('.modal-body');
  const footEl = overlay.querySelector('.modal-foot');
  let closed = false;

  const close = (result) => {
    if (closed) return;
    closed = true;
    document.removeEventListener('keydown', onKey);
    overlay.style.opacity = '0';
    modal.style.transform = 'translateY(8px) scale(.99)';
    modal.style.transition = 'opacity .16s, transform .16s';
    setTimeout(() => {
      overlay.remove();
      if (!document.querySelector('.overlay')) document.body.classList.remove('no-scroll');
    }, 160);
    if (typeof onClose === 'function') onClose(result);
  };
  const onKey = (e) => {
    if (e.key === 'Escape' && dismissible) { e.preventDefault(); close(); }
  };
  document.addEventListener('keydown', onKey);
  overlay.addEventListener('mousedown', (e) => {
    if (e.target === overlay && dismissible) close();
  });
  const closeBtn = overlay.querySelector('.modal-close');
  if (closeBtn) closeBtn.addEventListener('click', () => close());

  setTimeout(() => {
    const focusable = bodyEl.querySelector('input:not([type="hidden"]), select, textarea, button');
    if (focusable) focusable.focus({ preventScroll: true });
  }, 80);

  if (typeof onMount === 'function') {
    try { onMount({ overlay, modal, body: bodyEl, foot: footEl, close }); } catch (e) { console.error(e); }
  }
  return { overlay, modal, body: bodyEl, foot: footEl, close };
}

let activeConfirm = null;

export function confirmDialog({
  title = 'Konfirmasi', message = '', confirmText = 'Ya, lanjutkan', cancelText = 'Batal',
  danger = true, warn = false, iconName = 'alert'
} = {}) {
  // Only one confirmation may be open at a time. Repeated clicks on the trigger
  // close the previous prompt instead of stacking overlays.
  if (activeConfirm) {
    try { activeConfirm.close(); } catch (err) {}
    activeConfirm = null;
  }
  return new Promise((resolve) => {
    let answered = false;
    const finish = (value) => {
      if (answered) return;
      answered = true;
      resolve(value);
    };
    const { close } = openModal({
      title: '',
      size: 'narrow',
      body: `
        <div class="confirm-ic ${warn ? 'warn' : ''}">${icon(iconName)}</div>
        <div class="confirm-title">${esc(title)}</div>
        <div class="confirm-text">${message}</div>`,
      footer: `<button class="btn btn-secondary" data-cancel>${esc(cancelText)}</button>
               <button class="btn ${danger ? 'btn-danger' : 'btn-primary'}" data-confirm>${esc(confirmText)}</button>`,
      onMount: ({ modal, close: c }) => {
        modal.querySelector('[data-cancel]')?.addEventListener('click', () => { finish(false); c(); });
        modal.querySelector('[data-confirm]')?.addEventListener('click', () => { finish(true); c(); });
        modal.querySelector('.modal-close')?.addEventListener('click', () => { finish(false); c(); });
      },
      onClose: () => { finish(false); if (activeConfirm && activeConfirm.close === close) activeConfirm = null; }
    });
    activeConfirm = { close };
  });
}

export function emptyState({ iconName = 'box', title = 'Belum ada data', text = '', action = '', actionLabel = '', mini = false } = {}) {
  return `<div class="empty ${mini ? 'mini' : ''}">
    <div class="empty-ic">${icon(iconName)}</div>
    <h3>${esc(title)}</h3>
    ${text ? `<p>${text}</p>` : ''}
    ${action && actionLabel ? `<button class="btn btn-primary btn-sm" data-action="${esc(action)}">${icon('plus')}${esc(actionLabel)}</button>` : ''}
  </div>`;
}

/* ---------------- Money input ---------------- */
let moneyBound = false;
export function initMoneyInputs() {
  if (moneyBound) return;
  moneyBound = true;
  document.addEventListener('input', (e) => {
    const el = e.target;
    if (!el || !el.matches || !el.matches('[data-money]')) return;
    const before = el.value;
    const caret = el.selectionStart;
    const digitsBefore = before.slice(0, caret).replace(/\D/g, '').length;
    const formatted = fmtMoneyInput(before);
    el.value = formatted;
    if (document.activeElement === el) {
      let pos = 0;
      let seen = 0;
      while (pos < formatted.length && seen < digitsBefore) {
        if (/\d/.test(formatted[pos])) seen += 1;
        pos += 1;
      }
      try { el.setSelectionRange(pos, pos); } catch (err) {}
    }
    el.dispatchEvent(new CustomEvent('moneychange', { bubbles: true }));
  });
  document.addEventListener('focusin', (e) => {
    if (e.target && e.target.matches && e.target.matches('[data-money]')) {
      const n = parseMoney(e.target.value);
      if (n) e.target.value = String(n);
      requestAnimationFrame(() => e.target.select && e.target.select());
    }
  });
  document.addEventListener('focusout', (e) => {
    if (e.target && e.target.matches && e.target.matches('[data-money]')) {
      e.target.value = fmtMoneyInput(e.target.value);
    }
  });
}

/* ---------------- Charts ---------------- */
export function chartBars(data, { height = 140, showLaba = true, compact = false } = {}) {
  const max = Math.max(1, ...data.map((d) => Math.max(Number(d.omzet) || 0, showLaba ? Number(d.laba) || 0 : 0)));
  const hasData = data.some((d) => (Number(d.omzet) || 0) > 0);
  if (!hasData) {
    return `<div class="empty mini" style="padding:26px 10px"><div class="empty-ic">${icon('chart')}</div><h3>Belum ada penjualan</h3><p>Grafik akan muncul setelah ada transaksi.</p></div>`;
  }
  return `<div class="chart-bars" style="height:${height + 50}px">
    ${data.map((d, idx) => {
      const oh = Math.max(2, Math.round(((Number(d.omzet) || 0) / max) * height));
      const lh = Math.max(2, Math.round(((Number(d.laba) || 0) / max) * height));
      const isToday = idx === data.length - 1;
      return `<div class="bar-group">
        <div class="bar-pair">
          <div class="bar" style="height:${oh}px" data-tip="Omzet ${fmtRp(d.omzet)}"></div>
          ${showLaba ? `<div class="bar alt" style="height:${lh}px" data-tip="Laba ${fmtRp(d.laba)}"></div>` : ''}
        </div>
        <div class="bar-label ${isToday ? 'today' : ''}">${esc(d.label || '')}</div>
      </div>`;
    }).join('')}
  </div>`;
}

export function donutChart(items, { centerLabel = 'Total', centerValue = '' } = {}) {
  const total = items.reduce((acc, it) => acc + (Number(it.value) || 0), 0);
  const size = 150;
  const r = 58;
  const circ = 2 * Math.PI * r;
  let acc = 0;
  const circles = items.map((it) => {
    const val = Number(it.value) || 0;
    const len = total ? (val / total) * circ : 0;
    const el = `<circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="${it.color || 'var(--brand)'}" stroke-dasharray="${len} ${circ - len}" stroke-dashoffset="${-acc}" />`;
    acc += len;
    return el;
  }).join('');
  return `<div class="donut-wrap">
    <div class="donut">
      <svg viewBox="0 0 ${size} ${size}">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" stroke="var(--line)" stroke-width="15" />
        ${circles}
      </svg>
      <div class="donut-center"><strong>${centerValue || fmtRp(total)}</strong><span>${esc(centerLabel)}</span></div>
    </div>
    <div class="donut-legend">
      ${items.map((it) => `<div class="dl-row"><i style="background:${it.color || 'var(--brand)'}"></i><span>${esc(it.label)}</span><strong>${fmtRp(it.value)}</strong></div>`).join('')}
    </div>
  </div>`;
}

export function paymentBadge(method) {
  const cls = { cash: 'green', qris: 'blue', transfer: 'purple', kasbon: 'amber' }[method] || '';
  return `<span class="badge ${cls} pay-badge">${icon(paymentIcon(method))}${esc(paymentLabel(method))}</span>`;
}

/* ---------------- Receipt ---------------- */
export function receiptText(tx, store = {}) {
  const items = tx.items || [];
  const lines = [];
  const storeName = store.name || 'TokoKu';
  lines.push(storeName.toUpperCase());
  if (store.address) lines.push(store.address);
  if (store.phone) lines.push(`Telp: ${store.phone}`);
  lines.push('--------------------------------');
  lines.push(`No   : ${tx.invoice || '-'}`);
  lines.push(`Tgl  : ${fmtDate(tx.date, 'long')} ${fmtTime(tx.date)}`);
  if (tx.customerName) lines.push(`Plgn : ${tx.customerName}`);
  lines.push('--------------------------------');
  items.forEach((it) => {
    const label = it.kind === 'digital' ? `${it.name}${it.target ? ' - ' + it.target : ''}` : it.name;
    lines.push(label);
    lines.push(`  ${it.qty} x ${fmtNum(it.price)} = ${fmtNum(it.price * it.qty)}`);
  });
  lines.push('--------------------------------');
  if (tx.discount) lines.push(`Diskon        ${fmtNum(tx.discount).padStart(10)}`);
  lines.push(`TOTAL         ${fmtNum(tx.total).padStart(10)}`);
  lines.push(`Bayar(${paymentLabel(tx.paymentMethod)}) ${fmtNum(tx.paymentMethod === 'kasbon' ? 0 : (tx.cashReceived || tx.total)).padStart(4)}`);
  if (tx.paymentMethod === 'cash') lines.push(`Kembali       ${fmtNum(tx.change || 0).padStart(10)}`);
  lines.push('--------------------------------');
  lines.push(store.receiptFooter || 'Terima kasih sudah berbelanja 🙏');
  lines.push('Barang yang sudah dibeli tidak dapat ditukar.');
  return lines.join('\n');
}

export function receiptHTML(tx, store = {}) {
  const width = store.receiptWidth === '80' ? '80mm' : '58mm';
  const items = tx.items || [];
  const rows = items.map((it) => {
    const label = it.kind === 'digital' ? `${esc(it.name)}${it.target ? `<br><span class="small">${esc(it.target)}</span>` : ''}` : esc(it.name);
    return `<tr><td colspan="3" class="item-name">${label}</td></tr>
      <tr><td>${it.qty} x ${fmtNum(it.price)}</td><td></td><td class="right">${fmtNum(it.price * it.qty)}</td></tr>`;
  }).join('');
  return `<style>
    @page { size: ${width} auto; margin: 3mm; }
    * { box-sizing: border-box; }
    body { margin: 0; padding: 0; color: #000; background: #fff; font-family: "Courier New", monospace; font-size: 10.5px; line-height: 1.35; width: ${width}; }
    .center { text-align: center; }
    .store { font-size: 13px; font-weight: 700; letter-spacing: .5px; }
    .muted { font-size: 9.5px; }
    .line { border-top: 1px dashed #000; margin: 5px 0; }
    table { width: 100%; border-collapse: collapse; }
    td { padding: 1px 0; vertical-align: top; }
    .item-name { font-weight: 700; padding-top: 3px; }
    .right { text-align: right; }
    .total { font-size: 12px; font-weight: 700; }
    .small { font-size: 8.5px; }
    .foot { margin-top: 6px; font-size: 9px; text-align: center; }
  </style>
  <div class="center">
    <div class="store">${esc(store.name || 'TokoKu')}</div>
    ${store.address ? `<div class="muted">${esc(store.address)}</div>` : ''}
    ${store.phone ? `<div class="muted">Telp: ${esc(store.phone)}</div>` : ''}
  </div>
  <div class="line"></div>
  <table>
    <tr><td>No</td><td class="right" colspan="2">${esc(tx.invoice || '-')}</td></tr>
    <tr><td>Tgl</td><td class="right" colspan="2">${fmtDate(tx.date, 'long')} ${fmtTime(tx.date)}</td></tr>
    ${tx.customerName ? `<tr><td>Pelanggan</td><td class="right" colspan="2">${esc(tx.customerName)}</td></tr>` : ''}
    ${tx.cashier ? `<tr><td>Kasir</td><td class="right" colspan="2">${esc(tx.cashier)}</td></tr>` : ''}
  </table>
  <div class="line"></div>
  <table>${rows}</table>
  <div class="line"></div>
  <table>
    ${tx.discount ? `<tr><td>Diskon</td><td class="right">-${fmtNum(tx.discount)}</td></tr>` : ''}
    <tr class="total"><td>TOTAL</td><td class="right">${fmtNum(tx.total)}</td></tr>
    <tr><td>${esc(paymentLabel(tx.paymentMethod))}</td><td class="right">${fmtNum(tx.paymentMethod === 'kasbon' ? 0 : (tx.cashReceived || tx.total))}</td></tr>
    ${tx.paymentMethod === 'cash' ? `<tr><td>Kembali</td><td class="right">${fmtNum(tx.change || 0)}</td></tr>` : ''}
    ${tx.paymentMethod === 'kasbon' ? `<tr><td>Sisa kasbon</td><td class="right">${fmtNum(tx.total)}</td></tr>` : ''}
  </table>
  <div class="line"></div>
  <div class="foot">${esc(store.receiptFooter || 'Terima kasih sudah berbelanja 🙏')}<br>Barang yang sudah dibeli tidak dapat ditukar.</div>`;
}

export function printReceipt(tx, store = {}) {
  printHTML(receiptHTML(tx, store), `Nota ${tx.invoice || ''}`);
}

export function receiptPreview(tx, store = {}) {
  return `<pre class="receipt-preview">${esc(receiptText(tx, store))}</pre>`;
}

export function waReceiptText(tx, store = {}) {
  const lines = [];
  lines.push(`*${(store.name || 'TokoKu').toUpperCase()}*`);
  lines.push(`Nota: ${tx.invoice || '-'}`);
  lines.push(`Tanggal: ${fmtDate(tx.date, 'long')} ${fmtTime(tx.date)}`);
  lines.push('');
  (tx.items || []).forEach((it) => {
    const extra = it.target ? ` (${it.target})` : '';
    lines.push(`• ${it.name}${extra} — ${it.qty} x ${fmtRp(it.price)}`);
  });
  lines.push('');
  if (tx.discount) lines.push(`Diskon: -${fmtRp(tx.discount)}`);
  lines.push(`*Total: ${fmtRp(tx.total)}*`);
  lines.push(`Pembayaran: ${paymentLabel(tx.paymentMethod)}`);
  if (tx.paymentMethod === 'cash') lines.push(`Kembali: ${fmtRp(tx.change || 0)}`);
  if (tx.paymentMethod === 'kasbon') lines.push(`Sisa kasbon: ${fmtRp(tx.total)}`);
  lines.push('');
  lines.push(store.receiptFooter || 'Terima kasih sudah berbelanja 🙏');
  return lines.join('\n');
}

/* ---------------- misc ---------------- */
export function statusDot(ok) {
  return `<span class="pill"><span class="dot" style="background:${ok ? 'var(--brand)' : 'var(--red)'}"></span>${ok ? 'Online' : 'Offline'}</span>`;
}

export function nbsp(value) {
  return value == null || value === '' ? '—' : value;
}

export function dateInputValue(value) {
  const d = toDate(value);
  if (!d) return '';
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
