/* ==========================================================================
   TokoKu — Beranda / Dashboard
   ========================================================================== */

import {
  esc, icon, fmtRp, fmtDate, fmtPct, greeting, dayName, dateKey,
  startOfDay, startOfMonth, clamp, marginPct
} from '../utils.js';
import {
  state, todayTransactions, monthTransactions, calcStats, series,
  totalReceivable, openDebts, overdueDebts, lowStock, topProducts,
  expenseBreakdown, txDate, storeName
} from '../store.js';
import { chartBars, paymentBadge, emptyState } from '../ui.js';
import { navigate } from '../nav.js';
import { openTxDetail, kpiCard } from './common.js';

function inMonth(value) {
  return txDate({ date: value }) >= startOfMonth(new Date());
}

export default {
  render(el) {
    const store = state.store || {};
    const now = new Date();
    const today = todayTransactions();
    const todayExpenses = state.expenses.filter((e) => dateKey(e.date) === dateKey(now));
    const todayStats = calcStats(today, todayExpenses);

    const monthTx = monthTransactions();
    const monthExpenses = state.expenses.filter((e) => inMonth(e.date));
    const monthStats = calcStats(monthTx, monthExpenses);

    const chartData = series(state.recent, 7).map((row) => ({ ...row, label: dayName(row.date) }));
    const weekOmzet = chartData.reduce((acc, row) => acc + row.omzet, 0);
    const weekLaba = chartData.reduce((acc, row) => acc + row.laba, 0);
    const low = lowStock();
    const debtsOpen = openDebts();
    const overdue = overdueDebts();
    const receivable = totalReceivable();
    const recent = state.recent.filter((t) => !t.voided).slice(0, 6);
    const best = [...chartData].sort((a, b) => b.laba - a.laba)[0];
    const target = Number(store.monthlyTarget) || 0;
    const progress = target ? clamp((monthStats.labaBersih / target) * 100, 0, 100) : 0;
    const top = topProducts(monthTx, 5);
    const breakdown = expenseBreakdown(monthExpenses);

    const name = store.owner || (state.user && state.user.displayName) || 'Pemilik';
    const storeLabel = store.name || 'Toko Anda';

    el.innerHTML = `
      <section class="dash-hero">
        <div>
          <span class="dash-hero-label">${icon('sparkles')}${esc(greeting(now))}, ${esc(name.split(' ')[0])}</span>
          <h2>${esc(storeLabel)}</h2>
          <p>${fmtDate(now, 'full')} · ${esc(store.tagline || 'Kelontong · Pulsa · Paket Data · Transfer')}. Semua penjualan dan laba toko Anda tersaji di sini.</p>
        </div>
        <div class="dash-hero-actions">
          <button class="btn btn-primary" data-go="kasir">${icon('cart')}Buka Kasir</button>
          <button class="btn btn-secondary" data-go="pengeluaran">${icon('wallet')}Catat Biaya</button>
        </div>
      </section>

      <div class="kpi-grid">
        ${kpiCard({
          cls: 'green', label: 'Omzet hari ini', icon: 'banknote',
          value: fmtRp(todayStats.omzet),
          meta: `<span>${todayStats.count} transaksi</span><span class="dim">·</span><span>${todayStats.itemCount} item terjual</span>`
        })}
        ${kpiCard({
          cls: todayStats.labaBersih < 0 ? 'red' : 'blue', label: 'Laba bersih hari ini', icon: 'chart',
          value: fmtRp(todayStats.labaBersih),
          meta: todayStats.labaBersih < 0
            ? `<span class="badge red">${icon('alert')}Rugi</span><span>biaya lebih besar dari laba</span>`
            : `<span class="kpi-delta">${icon('arrow-up-right')}${fmtPct(todayStats.margin)}</span><span>margin kotor</span>`
        })}
        ${kpiCard({
          cls: 'amber', label: 'Transaksi hari ini', icon: 'receipt',
          value: fmtRp(todayStats.cashIn),
          meta: `<span>${todayStats.count} nota</span><span class="dim">·</span><span>rata-rata ${fmtRp(todayStats.avg)}</span>`
        })}
        ${kpiCard({
          cls: 'purple', label: 'Kasbon berjalan', icon: 'users',
          value: fmtRp(receivable),
          meta: overdue.length
            ? `<span class="badge red">${icon('clock')}${overdue.length} lewat tempo</span><span>${debtsOpen.length} pelanggan</span>`
            : `<span>${debtsOpen.length} kasbon aktif</span><span class="dim">·</span><span>semua aman</span>`
        })}
      </div>

      <div class="dash-grid">
        <div class="card">
          <div class="card-head">
            <div>
              <h3>Penjualan 7 hari terakhir</h3>
              <p>Omzet dan laba bersih harian</p>
            </div>
            <a class="card-link" href="#/laporan">Laporan lengkap ${icon('chevron-right')}</a>
          </div>
          <div class="card-body" style="padding-bottom:12px">
            ${chartBars(chartData, { height: 130 })}
            <div class="metric-strip">
              <div class="ms-item"><div class="ms-label">Omzet 7 hari</div><div class="ms-value">${fmtRp(weekOmzet)}</div></div>
              <div class="ms-item"><div class="ms-label">Laba 7 hari</div><div class="ms-value">${fmtRp(weekLaba)}</div></div>
              <div class="ms-item"><div class="ms-label">Hari terbaik</div><div class="ms-value">${best && best.laba > 0 ? esc(best.label) : '—'}</div></div>
            </div>
          </div>
        </div>

        <div class="dash-stack">
          <div class="card">
            <div class="card-head"><div><h3>Aksi cepat</h3><p>Pekerjaan harian toko</p></div></div>
            <div class="card-body" style="padding:14px">
              <div class="quick-grid">
                <button class="quick-tile" data-go="kasir"><span class="qt-ic qt-green">${icon('cart')}</span><strong>Jualan baru</strong><span>Produk & digital</span></button>
                <button class="quick-tile" data-go="pengeluaran"><span class="qt-ic qt-amber">${icon('wallet')}</span><strong>Pengeluaran</strong><span>Catat biaya</span></button>
                <button class="quick-tile" data-go="kasbon"><span class="qt-ic qt-purple">${icon('users')}</span><strong>Kasbon</strong><span>Piutang pelanggan</span></button>
                <button class="quick-tile" data-go="produk"><span class="qt-ic qt-blue">${icon('box')}</span><strong>Tambah produk</strong><span>Stok & harga</span></button>
              </div>
            </div>
          </div>

          <div class="card">
            <div class="card-head">
              <div><h3>Target laba bulan ini</h3><p>${fmtDate(now, 'month')}</p></div>
              <span class="badge ${progress >= 100 ? 'green' : 'amber'}">${target ? `${Math.round(progress)}%` : 'Belum diatur'}</span>
            </div>
            <div class="card-body" style="padding:14px 16px">
              ${target ? `
                <div class="flex" style="justify-content:space-between;gap:10px;margin-bottom:7px">
                  <strong style="font-size:16px;letter-spacing:-.03em">${fmtRp(monthStats.labaBersih)}</strong>
                  <span class="dim" style="font-size:10px">dari ${fmtRp(target)}</span>
                </div>
                <div class="progress ${progress >= 100 ? '' : 'amber'}"><i style="width:${progress}%"></i></div>
                <div class="hint mt-8">${progress >= 100
                  ? 'Selamat! Target laba bulan ini sudah tercapai. 🎉'
                  : `Kurang ${fmtRp(Math.max(0, target - monthStats.labaBersih))} lagi. Sisa ${Math.max(0, new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate() - now.getDate())} hari.`}</div>
              ` : `
                <div class="hint">Tentukan target laba bulanan agar kemajuan usaha lebih mudah dipantau.</div>
                <button class="btn btn-soft btn-sm mt-12" data-go="pengaturan">${icon('settings')}Atur target</button>
              `}
            </div>
          </div>
        </div>
      </div>

      <div class="dash-grid-2">
        <div class="card">
          <div class="card-head">
            <div><h3>Transaksi terbaru</h3><p>Nota yang baru tercatat</p></div>
            <a class="card-link" href="#/transaksi">Semua ${icon('chevron-right')}</a>
          </div>
          <div class="card-body" style="padding:4px 16px 10px">
            ${recent.length ? `<div class="recent-list">${recent.map((tx) => {
              const item = (tx.items || [])[0] || {};
              const count = (tx.items || []).reduce((acc, it) => acc + (Number(it.qty) || 0), 0);
              return `<button class="recent-row" data-tx="${esc(tx.id)}">
                <span class="rr-ic">${esc(item.emoji || (tx.type === 'digital' ? '📱' : '🛒'))}</span>
                <span class="rr-text">
                  <span class="rr-name">${esc(tx.customerName || item.name || tx.invoice)}</span>
                  <span class="rr-sub">${esc(tx.invoice)} · ${count} item · ${paymentBadge(tx.paymentMethod)}</span>
                </span>
                <span class="rr-amount"><strong>${fmtRp(tx.total)}</strong><span style="color:var(--brand)">${tx.profit >= 0 ? '+' : ''}${fmtRp(tx.profit)}</span></span>
              </button>`;
            }).join('')}</div>` : emptyState({
              iconName: 'receipt', title: 'Belum ada transaksi', text: 'Mulai catat penjualan pertama Anda melalui menu Kasir.', action: 'go-kasir', actionLabel: 'Buka Kasir', mini: true
            })}
          </div>
        </div>

        <div class="dash-stack">
          <div class="card">
            <div class="card-head">
              <div><h3>Stok perlu perhatian</h3><p>${low.length ? `${low.length} produk menipis` : 'Semua stok aman'}</p></div>
              <a class="card-link" href="#/produk">Kelola ${icon('chevron-right')}</a>
            </div>
            <div class="card-body" style="padding:6px 16px 10px">
              ${low.length ? `<div class="stock-list">${low.slice(0, 5).map((p) => {
                const out = (Number(p.stock) || 0) <= 0;
                return `<div class="stock-row">
                  <span class="stock-emoji">${esc(p.emoji || '📦')}</span>
                  <span class="stock-text"><strong>${esc(p.name)}</strong><span>${esc(p.category || 'Lainnya')} · min ${p.minStock || 0}</span></span>
                  <span class="stock-qty ${out ? 'out' : ''}">${out ? 'Habis' : `${p.stock} ${esc(p.unit || '')}`}</span>
                </div>`;
              }).join('')}</div>` : `<div class="insight-box" style="margin:8px 0">${icon('check-circle')}<p>Semua stok di atas batas minimum. Tidak ada yang perlu direstok hari ini.</p></div>`}
            </div>
          </div>

          <div class="debt-mini">
            <span class="dm-ic">${icon('users')}</span>
            <span class="dm-text"><span>Total piutang kasbon</span><strong>${fmtRp(receivable)}</strong></span>
            <button class="btn btn-secondary btn-sm" data-go="kasbon">${icon('chevron-right')}</button>
          </div>
        </div>
      </div>

      <div class="dash-grid-2">
        <div class="card">
          <div class="card-head"><div><h3>Produk terlaris bulan ini</h3><p>Berdasarkan laba kotor</p></div><a class="card-link" href="#/laporan">Detail ${icon('chevron-right')}</a></div>
          <div class="card-body" style="padding:6px 16px 10px">
            ${top.length ? `<div class="stock-list">${top.map((p, idx) => `
              <div class="stock-row">
                <span class="stock-emoji">${esc(p.emoji || '📦')}</span>
                <span class="stock-text"><strong>${esc(p.name)}</strong><span>${p.qty} terjual · omzet ${fmtRp(p.omzet)}</span></span>
                <span class="badge green">${fmtRp(p.profit)}</span>
              </div>`).join('')}</div>` : `<div class="hint" style="padding:14px 0">Belum ada penjualan produk bulan ini.</div>`}
          </div>
        </div>

        <div class="card">
          <div class="card-head"><div><h3>Ringkasan bulan ini</h3><p>${fmtDate(now, 'month')}</p></div></div>
          <div class="card-body" style="padding:14px 16px">
            <div class="report-breakdown">
              <div class="rb-row"><span><i style="background:var(--brand)"></i>Omzet</span><strong>${fmtRp(monthStats.omzet)}</strong></div>
              <div class="rb-row"><span><i style="background:var(--blue)"></i>HPP / modal terjual</span><strong>-${fmtRp(monthStats.hpp)}</strong></div>
              <div class="rb-row"><span><i style="background:var(--amber)"></i>Pengeluaran toko</span><strong>-${fmtRp(monthStats.pengeluaran)}</strong></div>
              <div class="rb-row total"><span>Laba bersih</span><strong style="color:${monthStats.labaBersih < 0 ? 'var(--red)' : 'var(--brand)'}">${fmtRp(monthStats.labaBersih)}</strong></div>
            </div>
            ${breakdown.length ? `<div class="hint mt-12">Biaya terbesar: <b>${esc(breakdown[0].label)}</b> ${fmtRp(breakdown[0].value)} (${Math.round((breakdown[0].value / (monthStats.pengeluaran || 1)) * 100)}%).</div>` : ''}
            <button class="btn btn-secondary btn-sm btn-block mt-12" data-go="laporan">${icon('chart')}Lihat laporan lengkap</button>
          </div>
        </div>
      </div>`;

    el.querySelectorAll('[data-go]').forEach((btn) => {
      btn.addEventListener('click', () => navigate(btn.getAttribute('data-go')));
    });
    el.querySelectorAll('[data-action="go-kasir"]').forEach((btn) => {
      btn.addEventListener('click', () => navigate('kasir'));
    });
    el.querySelectorAll('[data-tx]').forEach((btn) => {
      btn.addEventListener('click', () => {
        const tx = state.recent.find((t) => t.id === btn.getAttribute('data-tx'));
        openTxDetail(tx, { onChange: () => this.render(el) });
      });
    });
  },

  onChange(keys, el) {
    if (['transactions', 'expenses', 'products', 'debts', 'store', 'ready'].some((k) => keys.has(k))) {
      this.render(el);
    }
  }
};
