/* ==========================================================================
   TokoKu — Laporan laba rugi & arus kas
   ========================================================================== */

import {
  esc, icon, fmtRp, fmtNum, fmtPct, fmtDate, dayName, addDays, addMonths,
  startOfDay, endOfDay, startOfMonth, parseLocalDate, downloadCsv, paymentLabel,
  paymentIcon, SERVICE_TYPES, sum, printHTML
} from '../utils.js';
import {
  state, txDate, calcStats, topProducts, topServices, expenseBreakdown,
  paymentsInRange, loadRange
} from '../store.js';
import { chartBars, donutChart, emptyState, toast } from '../ui.js';
import { pageHead } from './common.js';

const ui = {
  period: '30d',
  from: '',
  to: '',
  loading: false,
  txs: null,
  exps: null,
  last: null
};

let root = null;
let loadSeq = 0;

const PERIODS = [
  { key: '7d', label: '7 hari' },
  { key: '30d', label: '30 hari' },
  { key: 'month', label: 'Bulan ini' },
  { key: 'last', label: 'Bulan lalu' },
  { key: 'custom', label: 'Pilih tanggal' }
];

const DONUT_COLORS = [
  'var(--brand)', 'var(--amber)', 'var(--blue)', 'var(--purple)', 'var(--red)',
  '#0ea5e9', '#f97316', '#64748b', '#84cc16', '#ec4899'
];

/* ---------------- range helpers ---------------- */
function rangeFor(period) {
  const today = new Date();
  if (period === '7d') {
    return { start: addDays(today, -6), end: today, label: '7 hari terakhir' };
  }
  if (period === 'month') {
    return { start: startOfMonth(today), end: today, label: fmtDate(today, 'month') };
  }
  if (period === 'last') {
    const start = addMonths(startOfMonth(today), -1);
    const end = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59, 999);
    return { start, end, label: fmtDate(start, 'month') };
  }
  if (period === 'custom') {
    const start = ui.from ? parseLocalDate(ui.from) : addDays(today, -29);
    const end = ui.to ? parseLocalDate(ui.to) : today;
    return {
      start, end,
      label: `${fmtDate(start, 'long')} – ${fmtDate(end, 'long')}`
    };
  }
  return { start: addDays(today, -29), end: today, label: '30 hari terakhir' };
}

function inRange(date, start, end) {
  const d = date && date.getTime ? date : null;
  if (!d) return false;
  const t = d.getTime();
  return t >= startOfDay(start).getTime() && t <= endOfDay(end).getTime();
}

function previousRange(range) {
  const days = Math.round((startOfDay(range.end) - startOfDay(range.start)) / 86400000) + 1;
  return { start: addDays(range.start, -days), end: addDays(range.start, -1) };
}

function previousStats(range) {
  if (ui.period === 'custom') return null;
  const prev = previousRange(range);
  const earliest = startOfDay(addDays(new Date(), -60));
  if (startOfDay(prev.start) < earliest) return null;
  const ptx = state.recent.filter((t) => inRange(txDate(t), prev.start, prev.end));
  const pex = state.expenses.filter((e) => inRange(e.date && e.date.toDate ? e.date.toDate() : e.date, prev.start, prev.end));
  if (!ptx.length && !pex.length) return null;
  return calcStats(ptx, pex);
}

function deltaHtml(current, previous) {
  if (previous == null) return '';
  if (!previous) {
    return current > 0 ? '<span class="badge green">baru</span>' : '';
  }
  const pct = ((current - previous) / Math.abs(previous)) * 100;
  const up = pct >= 0;
  return `<span style="color:${up ? 'var(--brand)' : 'var(--red)'};font-weight:800">${up ? '▲' : '▼'} ${fmtPct(Math.abs(pct))}</span>`;
}

/* ---------------- series ---------------- */
function buildSeries(txs, start, end) {
  const s = startOfDay(start);
  const e = startOfDay(end);
  const days = Math.max(1, Math.round((e - s) / 86400000) + 1);
  const size = days <= 45 ? 1 : days <= 180 ? 7 : 30;
  const buckets = [];
  for (let cursor = new Date(s); cursor <= e; cursor = addDays(cursor, size)) {
    buckets.push({
      start: new Date(cursor),
      omzet: 0, hpp: 0, laba: 0, count: 0
    });
  }
  (txs || []).filter((t) => !t.voided).forEach((t) => {
    const d = startOfDay(txDate(t));
    const idx = Math.min(buckets.length - 1, Math.max(0, Math.floor((d - s) / 86400000 / size)));
    const b = buckets[idx];
    if (!b) return;
    b.omzet += Number(t.total) || 0;
    b.hpp += Number(t.cost) || 0;
    b.laba += Number(t.profit) || 0;
    b.count += 1;
  });
  const every = Math.max(1, Math.ceil(buckets.length / 8));
  buckets.forEach((b, i) => {
    b.key = fmtDate(b.start, 'long');
    b.label = size === 1
      ? dayName(b.start)
      : fmtDate(b.start, 'short');
    if (i % every !== 0 && i !== buckets.length - 1) b.label = '';
  });
  return buckets;
}

/* ---------------- render ---------------- */
export default {
  render(el, ctx) {
    root = el;
    if (ctx && ctx.query) {
      const p = ctx.query.get('period');
      if (p && PERIODS.some((x) => x.key === p)) ui.period = p;
      const from = ctx.query.get('from');
      const to = ctx.query.get('to');
      if (from) ui.from = from;
      if (to) ui.to = to;
    }
    if (!ui.from) ui.from = fmtDateInput(addDays(new Date(), -29));
    if (!ui.to) ui.to = fmtDateInput(new Date());

    el.innerHTML = `
      ${pageHead({
        title: 'Laporan usaha',
        desc: 'Omzet, HPP, biaya operasional, laba bersih, dan arus kas toko Anda.',
        actions: `
          <button class="btn btn-secondary btn-sm" data-print>${icon('printer')}Cetak</button>
          <button class="btn btn-primary btn-sm" data-export>${icon('download')}Ekspor CSV</button>`
      })}

      <div class="card report-period">
        <div class="chips" id="report-chips">
          ${PERIODS.map((p) => `<button class="chip ${ui.period === p.key ? 'active' : ''}" data-period="${p.key}">${esc(p.label)}</button>`).join('')}
        </div>
        <div class="date-range">
          <input class="input" id="report-from" type="date" value="${esc(ui.from)}" ${ui.period === 'custom' ? '' : 'disabled'}>
          <span>s/d</span>
          <input class="input" id="report-to" type="date" value="${esc(ui.to)}" ${ui.period === 'custom' ? '' : 'disabled'}>
        </div>
      </div>

      <div id="report-body"></div>`;

    bind(el);
    if (ui.period === 'custom') loadCustom();
    else renderContent();
  },

  onChange(keys, el) {
    if (!root) return;
    if (!['transactions', 'expenses', 'debts', 'purchases', 'ready'].some((k) => keys.has(k))) return;
    if (ui.period === 'custom') {
      if (keys.has('transactions')) loadCustom();
      else renderContent();
    } else {
      renderContent(el || root);
    }
  }
};

function fmtDateInput(d) {
  const date = new Date(d);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function bind(el) {
  el.querySelector('#report-chips').addEventListener('click', (e) => {
    const btn = e.target.closest('[data-period]');
    if (!btn) return;
    const next = btn.getAttribute('data-period');
    if (next === ui.period) return;
    ui.period = next;
    el.querySelectorAll('[data-period]').forEach((b) => b.classList.toggle('active', b === btn));
    const from = el.querySelector('#report-from');
    const to = el.querySelector('#report-to');
    const custom = ui.period === 'custom';
    from.disabled = !custom;
    to.disabled = !custom;
    if (custom) loadCustom();
    else {
      ui.txs = null;
      ui.exps = null;
      renderContent();
    }
  });

  const onDate = () => {
    ui.period = 'custom';
    ui.from = el.querySelector('#report-from').value;
    ui.to = el.querySelector('#report-to').value;
    el.querySelectorAll('[data-period]').forEach((b) => {
      b.classList.toggle('active', b.getAttribute('data-period') === 'custom');
    });
    loadCustom();
  };
  el.querySelector('#report-from').addEventListener('change', onDate);
  el.querySelector('#report-to').addEventListener('change', onDate);

  el.querySelector('[data-export]').addEventListener('click', exportCsv);
  el.querySelector('[data-print]').addEventListener('click', printReport);
}

function currentData(range) {
  if (ui.period === 'custom') {
    return { txs: ui.txs || [], exps: ui.exps || [] };
  }
  const txs = state.recent.filter((t) => inRange(txDate(t), range.start, range.end));
  const exps = state.expenses.filter((e) => {
    const d = e.date && typeof e.date.toDate === 'function' ? e.date.toDate() : e.date;
    return inRange(d, range.start, range.end);
  });
  return { txs, exps };
}

async function loadCustom() {
  if (!root) return;
  const range = rangeFor('custom');
  if (startOfDay(range.start) > startOfDay(range.end)) {
    toast('Tanggal awal tidak boleh melebihi tanggal akhir.', 'warn');
    return;
  }
  const seq = ++loadSeq;
  ui.loading = true;
  renderContent();
  try {
    const data = await loadRange(range.start, range.end);
    if (seq !== loadSeq) return;
    ui.txs = data.txs;
    ui.exps = data.expenses;
  } catch (err) {
    if (seq !== loadSeq) return;
    toast(err.message || 'Gagal memuat laporan pada rentang tanggal ini.', 'error');
    ui.txs = [];
    ui.exps = [];
  } finally {
    if (seq === loadSeq) {
      ui.loading = false;
      renderContent();
    }
  }
}

function renderContent(el = root) {
  const body = el && el.querySelector('#report-body');
  if (!body) return;
  if (ui.loading) {
    body.innerHTML = `<div class="card"><div class="empty"><span class="spinner"></span><p>Memuat laporan…</p></div></div>`;
    return;
  }
  const range = rangeFor(ui.period);
  const { txs, exps } = currentData(range);
  const stats = calcStats(txs, exps);
  const prev = previousStats(range);
  const seriesData = buildSeries(txs, range.start, range.end);
  const products = topProducts(txs, 6);
  const services = topServices(txs, 6);
  const breakdown = expenseBreakdown(exps);
  const pay = paymentsInRange(state.debts, range.start, range.end);
  const restock = state.purchases.filter((p) => {
    const d = p.date && typeof p.date.toDate === 'function' ? p.date.toDate() : p.date;
    return inRange(d, range.start, range.end);
  });
  const restockTotal = sum(restock, (p) => p.total);
  const netCash = stats.cashIn + pay.total - stats.pengeluaran;
  const activeCount = txs.filter((t) => !t.voided).length;
  const profitTone = stats.labaBersih < 0 ? 'var(--red)' : 'var(--brand)';

  ui.last = { range, txs, exps, stats, seriesData, products, services, breakdown, pay, restockTotal, netCash };

  body.innerHTML = `
    <div class="report-kpis">
      ${reportKpi({
        label: 'Omzet', value: fmtRp(stats.omzet), iconName: 'banknote', tone: 'brand',
        sub: `${activeCount} transaksi · ${fmtNum(stats.itemCount)} item ${deltaHtml(stats.omzet, prev ? prev.omzet : null)}`
      })}
      ${reportKpi({
        label: 'HPP / modal terjual', value: fmtRp(stats.hpp), iconName: 'package', tone: 'blue',
        sub: `${fmtPct(stats.omzet ? (stats.hpp / stats.omzet) * 100 : 0)} dari omzet`
      })}
      ${reportKpi({
        label: 'Laba kotor', value: fmtRp(stats.labaKotor), iconName: 'chart', tone: 'purple',
        sub: `Margin ${fmtPct(stats.margin)} ${deltaHtml(stats.labaKotor, prev ? prev.labaKotor : null)}`
      })}
      ${reportKpi({
        label: 'Pengeluaran', value: fmtRp(stats.pengeluaran), iconName: 'wallet', tone: 'amber',
        sub: `${exps.length} catatan biaya operasional`
      })}
      ${reportKpi({
        label: 'Laba bersih', value: fmtRp(stats.labaBersih), iconName: 'sparkles',
        highlight: true,
        sub: stats.labaBersih < 0
          ? '<span style="color:#fecaca;font-weight:700">Usaha rugi pada periode ini</span>'
          : `Setelah semua biaya ${deltaHtml(stats.labaBersih, prev ? prev.labaBersih : null)}`
      })}
      ${reportKpi({
        label: 'Rata-rata / transaksi', value: fmtRp(stats.avg), iconName: 'receipt', tone: 'green',
        sub: `${fmtRp(stats.cashIn)} masuk kas (non-kasbon)`
      })}
    </div>

    <div class="report-grid">
      <div class="card">
        <div class="card-head">
          <div><h3>Tren omzet & laba</h3><p>${esc(range.label)} · laba pada grafik adalah laba kotor</p></div>
          <span class="badge ${stats.labaBersih >= 0 ? 'green' : 'red'}">${stats.labaBersih >= 0 ? 'Untung' : 'Rugi'} ${fmtRp(Math.abs(stats.labaBersih))}</span>
        </div>
        <div class="card-body" style="padding-bottom:12px">
          ${chartBars(seriesData, { height: 150 })}
          <div class="metric-strip">
            <div class="ms-item"><div class="ms-label">Omzet</div><div class="ms-value">${fmtRp(stats.omzet)}</div></div>
            <div class="ms-item"><div class="ms-label">Laba kotor</div><div class="ms-value" style="color:var(--brand)">${fmtRp(stats.labaKotor)}</div></div>
            <div class="ms-item"><div class="ms-label">Laba bersih</div><div class="ms-value" style="color:${profitTone}">${fmtRp(stats.labaBersih)}</div></div>
          </div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div><h3>Rincian laba rugi</h3><p>${esc(range.label)}</p></div></div>
        <div class="card-body" style="padding:14px 16px">
          <div class="report-breakdown">
            <div class="rb-row"><span><i style="background:var(--brand)"></i>Omzet penjualan</span><strong>${fmtRp(stats.omzet)}</strong></div>
            <div class="rb-row"><span><i style="background:var(--blue)"></i>HPP / modal terjual</span><strong>-${fmtRp(stats.hpp)}</strong></div>
            <div class="rb-row" style="font-weight:700"><span style="color:var(--ink)">Laba kotor</span><strong>${fmtRp(stats.labaKotor)}</strong></div>
            <div class="rb-row"><span><i style="background:var(--amber)"></i>Pengeluaran operasional</span><strong>-${fmtRp(stats.pengeluaran)}</strong></div>
            <div class="rb-row total"><span>Laba bersih</span><strong style="color:${profitTone}">${fmtRp(stats.labaBersih)}</strong></div>
          </div>
          <div class="hint mt-12">Margin kotor <b>${fmtPct(stats.margin)}</b>. ${stats.discount ? `Total diskon diberikan ${fmtRp(stats.discount)}. ` : ''}${stats.labaBersih >= 0 ? 'Usaha Anda menghasilkan laba pada periode ini.' : 'Pengeluaran melebihi laba kotor — periksa biaya terbesar di bawah.'}</div>
        </div>
      </div>
    </div>

    <div class="report-grid-3">
      <div class="card">
        <div class="card-head"><div><h3>Arus kas</h3><p>Uang yang benar-benar masuk & keluar</p></div></div>
        <div class="card-body" style="padding:14px 16px">
          <div class="cashflow-box">
            <div class="cf-row"><span>${icon('banknote', 'ic-sm')} Pembayaran non-kasbon</span><strong>${fmtRp(stats.cashIn)}</strong></div>
            <div class="cf-row"><span>${icon('users', 'ic-sm')} Pembayaran kasbon diterima</span><strong>${fmtRp(pay.total)}</strong></div>
            <div class="cf-row"><span>${icon('wallet', 'ic-sm')} Pengeluaran operasional</span><strong style="color:var(--red)">-${fmtRp(stats.pengeluaran)}</strong></div>
            <div class="cf-row" style="padding-top:10px;border-top:1px dashed var(--line-strong)"><span style="color:var(--ink);font-weight:700">Arus kas bersih</span><strong style="font-size:15px;color:${netCash >= 0 ? 'var(--brand)' : 'var(--red)'}">${fmtRp(netCash)}</strong></div>
          </div>
          <div class="cf-note">${icon('info')} Penjualan kasbon baru ${fmtRp(stats.kasbonBaru)} belum dihitung sebagai uang masuk. Belanja restok ${fmtRp(restockTotal)} dicatat sebagai persediaan, bukan biaya operasional.</div>
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div><h3>Metode pembayaran</h3><p>Kontribusi omzet per metode</p></div></div>
        <div class="card-body" style="padding:14px 16px">
          ${paymentMethodsHTML(stats)}
        </div>
      </div>
    </div>

    <div class="report-grid-3">
      <div class="card">
        <div class="card-head"><div><h3>Produk terlaris</h3><p>Berdasarkan laba kotor</p></div><span class="badge">${products.length} produk</span></div>
        <div class="card-body" style="padding:6px 16px 12px">
          ${products.length ? products.map((p, i) => `
            <div class="top-product-row">
              <span class="tp-rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
              <span class="stock-emoji" style="width:28px;height:28px;font-size:14px">${esc(p.emoji || '📦')}</span>
              <span class="tp-main"><strong>${esc(p.name)}</strong><span>${fmtNum(p.qty)} terjual · omzet ${fmtRp(p.omzet)}</span></span>
              <span class="tp-right"><strong>${fmtRp(p.profit)}</strong><span>laba</span></span>
            </div>`).join('') : `<div class="hint" style="padding:16px 0">Belum ada penjualan produk pada periode ini.</div>`}
        </div>
      </div>

      <div class="card">
        <div class="card-head"><div><h3>Layanan digital</h3><p>Pulsa, data, token, transfer</p></div><span class="badge amber">${services.length} jenis</span></div>
        <div class="card-body" style="padding:6px 16px 12px">
          ${services.length ? services.map((s, i) => {
            const meta = SERVICE_TYPES[s.service] || {};
            return `<div class="top-product-row">
              <span class="tp-rank ${i < 3 ? 'top' : ''}">${i + 1}</span>
              <span class="stock-emoji" style="width:28px;height:28px;font-size:14px">${meta.emoji || '📱'}</span>
              <span class="tp-main"><strong>${esc(meta.label || s.name || s.service)}</strong><span>${fmtNum(s.qty)} transaksi · omzet ${fmtRp(s.omzet)}</span></span>
              <span class="tp-right"><strong>${fmtRp(s.profit)}</strong><span>laba</span></span>
            </div>`;
          }).join('') : `<div class="hint" style="padding:16px 0">Belum ada penjualan layanan digital pada periode ini.</div>`}
        </div>
      </div>
    </div>

    <div class="card">
      <div class="card-head">
        <div><h3>Pengeluaran per kategori</h3><p>${esc(range.label)} · total ${fmtRp(stats.pengeluaran)}</p></div>
        <a class="card-link" href="#/pengeluaran">Kelola ${icon('chevron-right')}</a>
      </div>
      <div class="card-body" style="padding:16px">
        ${breakdown.length
          ? `<div class="report-grid" style="margin-bottom:0">
              <div>${donutChart(breakdown.map((b, i) => ({ ...b, color: DONUT_COLORS[i % DONUT_COLORS.length] })), { centerLabel: 'Total biaya', centerValue: fmtRp(stats.pengeluaran) })}</div>
              <div class="expense-cat-list">
                ${breakdown.map((b, i) => {
                  const pct = stats.pengeluaran ? (b.value / stats.pengeluaran) * 100 : 0;
                  return `<div class="exp-cat-row">
                    <div class="exp-cat-top"><span>${esc(b.label)}</span><strong>${fmtRp(b.value)}</strong></div>
                    <div class="progress amber"><i style="width:${pct}%;background:${DONUT_COLORS[i % DONUT_COLORS.length]}"></i></div>
                    <div class="hint" style="margin-top:1px">${fmtPct(pct)} dari total pengeluaran</div>
                  </div>`;
                }).join('')}
              </div>
            </div>`
          : emptyState({ iconName: 'wallet', title: 'Belum ada pengeluaran', text: 'Catat biaya listrik, sewa, transport, dan kebutuhan toko agar laba bersih lebih akurat.', action: 'go-expense', actionLabel: 'Catat pengeluaran', mini: true })}
      </div>
    </div>`;

  body.querySelectorAll('[data-action="go-expense"]').forEach((btn) => {
    btn.addEventListener('click', () => { location.hash = '#/pengeluaran'; });
  });
}

function reportKpi({ label, value, sub = '', iconName = 'chart', highlight = false }) {
  return `<div class="report-kpi ${highlight ? 'highlight' : ''}">
    <div class="rk-top">
      <span class="rk-label">${esc(label)}</span>
      <span class="rk-ic">${icon(iconName)}</span>
    </div>
    <div class="rk-value">${value}</div>
    <div class="rk-sub">${sub}</div>
  </div>`;
}

function paymentMethodsHTML(stats) {
  const rows = ['cash', 'qris', 'transfer', 'kasbon'].map((key) => ({
    key, value: stats.methods[key] || 0
  }));
  if (!rows.some((r) => r.value > 0)) {
    return `<div class="hint" style="padding:16px 0">Belum ada transaksi pada periode ini.</div>`;
  }
  return `<div class="cashflow-box">
    ${rows.map((r) => {
      const pct = stats.omzet ? (r.value / stats.omzet) * 100 : 0;
      return `<div class="cf-row" style="display:block">
        <div class="flex" style="justify-content:space-between;gap:10px;margin-bottom:4px">
          <span class="flex gap-6" style="align-items:center">${icon(paymentIcon(r.key), 'ic-sm')} ${esc(paymentLabel(r.key))}</span>
          <strong>${fmtRp(r.value)} <span class="dim" style="font-weight:600">(${fmtPct(pct)})</span></strong>
        </div>
        <div class="progress ${r.key === 'kasbon' ? 'amber' : ''}"><i style="width:${pct}%"></i></div>
      </div>`;
    }).join('')}
  </div>
  <div class="hint mt-12">Kasbon dihitung sebagai omzet (accrual), tetapi uangnya belum masuk kas sampai dibayar.</div>`;
}

/* ---------------- export ---------------- */
function exportCsv() {
  if (!ui.last) return toast('Laporan belum siap.', 'warn');
  const { seriesData, stats, range } = ui.last;
  const rows = seriesData.map((d) => [
    d.key, Number(d.omzet) || 0, Number(d.hpp) || 0, Number(d.laba) || 0, Number(d.count) || 0
  ]);
  rows.push([]);
  rows.push(['RINGKASAN', '', '', '', '']);
  rows.push(['Omzet', Number(stats.omzet) || 0]);
  rows.push(['HPP', Number(stats.hpp) || 0]);
  rows.push(['Laba kotor', Number(stats.labaKotor) || 0]);
  rows.push(['Pengeluaran', Number(stats.pengeluaran) || 0]);
  rows.push(['Laba bersih', Number(stats.labaBersih) || 0]);
  rows.push(['Kasbon baru', Number(stats.kasbonBaru) || 0]);
  downloadCsv(
    `laporan-tokoku-${fmtDateInput(range.start)}-${fmtDateInput(range.end)}.csv`,
    rows,
    ['Periode', 'Omzet', 'HPP', 'Laba Kotor', 'Jumlah Transaksi']
  );
  toast('Laporan berhasil diekspor ke CSV.', 'success');
}

/* ---------------- print ---------------- */
function printReport() {
  if (!ui.last) return toast('Laporan belum siap dicetak.', 'warn');
  const { range, stats, seriesData, products, services, breakdown, pay, netCash, restockTotal } = ui.last;
  const store = state.store || {};
  const rows = seriesData.map((d) => `<tr>
    <td>${esc(d.key)}</td>
    <td class="right">${fmtNum(d.omzet)}</td>
    <td class="right">${fmtNum(d.hpp)}</td>
    <td class="right">${fmtNum(d.laba)}</td>
    <td class="right">${fmtNum(d.count)}</td>
  </tr>`).join('');
  const html = `<style>
    @page { size: A4 portrait; margin: 14mm; }
    * { box-sizing: border-box; }
    body { font-family: Arial, Helvetica, sans-serif; color: #111; font-size: 11px; margin: 0; }
    h1 { font-size: 20px; margin: 0; letter-spacing: -.02em; }
    .muted { color: #666; font-size: 10px; }
    .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 10px; margin-bottom: 14px; }
    .head-right { text-align: right; }
    .kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; margin-bottom: 14px; }
    .kpi { border: 1px solid #ddd; border-radius: 6px; padding: 8px 10px; }
    .kpi span { display: block; font-size: 8.5px; text-transform: uppercase; color: #666; letter-spacing: .04em; }
    .kpi strong { display: block; font-size: 13px; margin-top: 2px; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
    th, td { border-bottom: 1px solid #ddd; padding: 5px 6px; text-align: left; }
    th { background: #f2f2f2; font-size: 9px; text-transform: uppercase; }
    .right { text-align: right; }
    h2 { font-size: 12px; margin: 14px 0 6px; }
    .two { display: grid; grid-template-columns: 1fr 1fr; gap: 18px; }
    .note { margin-top: 14px; padding-top: 8px; border-top: 1px dashed #999; font-size: 9px; color: #555; }
  </style>
  <div class="head">
    <div><h1>${esc(store.name || 'TokoKu')}</h1><div class="muted">${esc(store.address || '')}${store.phone ? ' · ' + esc(store.phone) : ''}</div><div class="muted">Laporan laba rugi & arus kas</div></div>
    <div class="head-right"><strong>${esc(range.label)}</strong><div class="muted">Dicetak ${fmtDate(new Date(), 'full')}</div></div>
  </div>
  <div class="kpis">
    <div class="kpi"><span>Omzet</span><strong>${fmtRp(stats.omzet)}</strong></div>
    <div class="kpi"><span>HPP</span><strong>${fmtRp(stats.hpp)}</strong></div>
    <div class="kpi"><span>Laba kotor</span><strong>${fmtRp(stats.labaKotor)}</strong></div>
    <div class="kpi"><span>Pengeluaran</span><strong>${fmtRp(stats.pengeluaran)}</strong></div>
    <div class="kpi"><span>Laba bersih</span><strong>${fmtRp(stats.labaBersih)}</strong></div>
    <div class="kpi"><span>Arus kas bersih</span><strong>${fmtRp(netCash)}</strong></div>
  </div>
  <h2>Rincian harian</h2>
  <table><thead><tr><th>Periode</th><th class="right">Omzet</th><th class="right">HPP</th><th class="right">Laba kotor</th><th class="right">Transaksi</th></tr></thead><tbody>${rows}</tbody></table>
  <div class="two">
    <div>
      <h2>Produk terlaris</h2>
      <table><thead><tr><th>Produk</th><th class="right">Qty</th><th class="right">Laba</th></tr></thead><tbody>
        ${products.length ? products.map((p) => `<tr><td>${esc(p.name)}</td><td class="right">${fmtNum(p.qty)}</td><td class="right">${fmtNum(p.profit)}</td></tr>`).join('') : '<tr><td colspan="3">Belum ada data</td></tr>'}
      </tbody></table>
      <h2>Layanan digital</h2>
      <table><thead><tr><th>Layanan</th><th class="right">Transaksi</th><th class="right">Laba</th></tr></thead><tbody>
        ${services.length ? services.map((s) => `<tr><td>${esc((SERVICE_TYPES[s.service] || {}).label || s.service)}</td><td class="right">${fmtNum(s.qty)}</td><td class="right">${fmtNum(s.profit)}</td></tr>`).join('') : '<tr><td colspan="3">Belum ada data</td></tr>'}
      </tbody></table>
    </div>
    <div>
      <h2>Pengeluaran per kategori</h2>
      <table><thead><tr><th>Kategori</th><th class="right">Nominal</th></tr></thead><tbody>
        ${breakdown.length ? breakdown.map((b) => `<tr><td>${esc(b.label)}</td><td class="right">${fmtNum(b.value)}</td></tr>`).join('') : '<tr><td colspan="2">Belum ada data</td></tr>'}
        <tr><td><strong>Total</strong></td><td class="right"><strong>${fmtNum(stats.pengeluaran)}</strong></td></tr>
      </tbody></table>
      <h2>Arus kas</h2>
      <table><tbody>
        <tr><td>Pembayaran non-kasbon</td><td class="right">${fmtNum(stats.cashIn)}</td></tr>
        <tr><td>Pembayaran kasbon</td><td class="right">${fmtNum(pay.total)}</td></tr>
        <tr><td>Pengeluaran</td><td class="right">-${fmtNum(stats.pengeluaran)}</td></tr>
        <tr><td><strong>Arus kas bersih</strong></td><td class="right"><strong>${fmtNum(netCash)}</strong></td></tr>
      </tbody></table>
    </div>
  </div>
  <div class="note">Laba bersih = omzet − HPP − pengeluaran operasional. Belanja restok (${fmtRp(restockTotal)}) tidak dihitung sebagai biaya karena menjadi nilai persediaan. Kasbon baru (${fmtRp(stats.kasbonBaru)}) dihitung sebagai omzet tetapi belum menjadi uang masuk.</div>`;
  printHTML(html, `Laporan ${range.label}`);
  toast('Laporan dikirim ke dialog cetak.', 'info');
}
