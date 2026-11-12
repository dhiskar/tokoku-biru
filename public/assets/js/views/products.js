/* ==========================================================================
   TokoKu — Produk & stok
   ========================================================================== */

import {
  esc, icon, fmtRp, fmtPct, fmtNum, marginPct, parseMoney, downloadCsv,
  inputDate, CATEGORIES, UNITS, PRODUCT_EMOJIS
} from '../utils.js';
import {
  state, saveProduct, setProductActive, restockProduct, stockValue, lowStock
} from '../store.js';
import { openModal, confirmDialog, toast, emptyState } from '../ui.js';

const ui = {
  q: '',
  category: 'Semua',
  status: 'aktif'
};

let root = null;
let delegateClick = null;

function productList() {
  const q = ui.q.trim().toLowerCase();
  return state.products
    .filter((p) => {
      const active = p.active !== false;
      if (ui.status === 'aktif' && !active) return false;
      if (ui.status === 'arsip' && active) return false;
      if (ui.category !== 'Semua' && (p.category || 'Lainnya') !== ui.category) return false;
      if (q && !`${p.name} ${p.category || ''} ${p.barcode || ''} ${p.note || ''}`.toLowerCase().includes(q)) return false;
      return true;
    })
    .sort((a, b) => String(a.name).localeCompare(String(b.name), 'id'));
}

function categoryOptions() {
  const cats = [...new Set([...CATEGORIES, ...state.products.map((p) => p.category).filter(Boolean)])];
  return cats.sort((a, b) => a.localeCompare(b, 'id'));
}

function stockState(p) {
  const stock = Number(p.stock) || 0;
  if (stock <= 0) return { cls: 'out', label: 'Habis' };
  if (stock <= (Number(p.minStock) || 0)) return { cls: 'low', label: `${stock} ${p.unit || ''} · menipis` };
  return { cls: '', label: `${stock} ${p.unit || ''}` };
}

export default {
  render(el, ctx) {
    root = el;
    const all = state.products;
    const active = all.filter((p) => p.active !== false);
    const low = lowStock();
    const out = active.filter((p) => (Number(p.stock) || 0) <= 0);
    const cats = new Set(active.map((p) => p.category || 'Lainnya'));
    const q = ctx && ctx.query ? ctx.query.get('q') : '';
    if (q) ui.q = q;

    el.innerHTML = `
      <div class="page-head">
        <div>
          <h1>Produk & stok</h1>
          <p>Kelola barang dagangan, harga jual, modal, dan batas stok minimum.</p>
        </div>
        <div class="page-actions">
          <button class="btn btn-secondary btn-sm" data-export>${icon('download')}Ekspor CSV</button>
          <button class="btn btn-primary" data-add>${icon('plus')}Tambah produk</button>
        </div>
      </div>

      <div class="stat-strip">
        <div class="stat-box"><div class="sb-label">${icon('box')}Produk aktif</div><div class="sb-value">${active.length}</div><div class="sb-sub">dari ${all.length} total produk</div></div>
        <div class="stat-box"><div class="sb-label">${icon('banknote')}Nilai stok</div><div class="sb-value">${fmtRp(stockValue())}</div><div class="sb-sub">harga modal barang tersisa</div></div>
        <div class="stat-box"><div class="sb-label">${icon('alert')}Stok menipis</div><div class="sb-value" style="color:${low.length ? 'var(--amber)' : 'var(--brand)'}">${low.length}</div><div class="sb-sub">${out.length} produk habis</div></div>
        <div class="stat-box"><div class="sb-label">${icon('tag')}Kategori</div><div class="sb-value">${cats.size}</div><div class="sb-sub">pengelompokan produk</div></div>
      </div>

      <div class="card toolbar">
        <div class="search-grow input-icon">
          ${icon('search')}
          <input class="input" id="prod-search" type="search" placeholder="Cari nama, kategori, atau barcode…" value="${esc(ui.q)}" autocomplete="off">
        </div>
        <select class="select" id="prod-category">
          <option value="Semua">Semua kategori</option>
          ${categoryOptions().map((c) => `<option value="${esc(c)}" ${ui.category === c ? 'selected' : ''}>${esc(c)}</option>`).join('')}
        </select>
        <select class="select" id="prod-status">
          <option value="aktif" ${ui.status === 'aktif' ? 'selected' : ''}>Produk aktif</option>
          <option value="arsip" ${ui.status === 'arsip' ? 'selected' : ''}>Arsip</option>
          <option value="semua" ${ui.status === 'semua' ? 'selected' : ''}>Semua status</option>
        </select>
        <span class="dim" id="prod-found" style="font-size:10.5px"></span>
      </div>

      <div class="card">
        <div class="table-wrap product-table">
          <table class="table">
            <thead><tr><th>Produk</th><th>Kategori</th><th class="num">Harga jual</th><th class="num">Modal</th><th class="num">Margin</th><th>Stok</th><th class="actions">Aksi</th></tr></thead>
            <tbody id="prod-tbody"></tbody>
          </table>
        </div>
        <div class="product-cards" id="prod-cards"></div>
        <div id="prod-empty"></div>
      </div>`;

    bind(el);
    renderList();

    if (ctx && ctx.query && ctx.query.get('add') === '1') openProductForm();
  },

  onChange(keys, el) {
    if (keys.has('products')) this.render(el, { query: new URLSearchParams() });
  },

  destroy() {
    if (root && delegateClick) root.removeEventListener('click', delegateClick);
    delegateClick = null;
    root = null;
  }
};

function bind(el) {
  const search = el.querySelector('#prod-search');
  search.addEventListener('input', () => {
    ui.q = search.value;
    renderList();
  });
  el.querySelector('#prod-category').addEventListener('change', (e) => {
    ui.category = e.target.value;
    renderList();
  });
  el.querySelector('#prod-status').addEventListener('change', (e) => {
    ui.status = e.target.value;
    renderList();
  });
  el.querySelector('[data-add]').addEventListener('click', () => openProductForm());
  el.querySelector('[data-export]').addEventListener('click', exportCsv);

  if (delegateClick) el.removeEventListener('click', delegateClick);
  delegateClick = (e) => {
    const add = e.target.closest('[data-action="add"]');
    if (add) return openProductForm();
    const edit = e.target.closest('[data-edit]');
    if (edit) {
      const product = state.products.find((p) => p.id === edit.getAttribute('data-edit'));
      return openProductForm(product);
    }
    const restock = e.target.closest('[data-restock]');
    if (restock) {
      const product = state.products.find((p) => p.id === restock.getAttribute('data-restock'));
      return openRestock(product);
    }
    const archive = e.target.closest('[data-archive]');
    if (archive) return toggleActive(archive.getAttribute('data-archive'), false);
    const restore = e.target.closest('[data-restore]');
    if (restore) return toggleActive(restore.getAttribute('data-restore'), true);
  };
  el.addEventListener('click', delegateClick);
}

function renderList() {
  if (!root) return;
  const tbody = root.querySelector('#prod-tbody');
  const cards = root.querySelector('#prod-cards');
  const empty = root.querySelector('#prod-empty');
  const found = root.querySelector('#prod-found');
  const list = productList();
  if (found) found.textContent = `${list.length} produk ditampilkan`;

  const emptyHTML = !list.length ? emptyState({
    iconName: ui.q || ui.status !== 'aktif' ? 'search' : 'box',
    title: 'Belum ada produk',
    text: ui.q ? 'Tidak ada produk yang cocok dengan pencarian Anda.' : 'Tambahkan produk pertama Anda agar bisa dijual lewat kasir.',
    action: 'add', actionLabel: 'Tambah produk'
  }) : '';

  if (tbody) {
    tbody.innerHTML = list.map((p) => {
      const active = p.active !== false;
      const st = stockState(p);
      return `<tr class="${active ? '' : 'is-void'}">
        <td>
          <div class="pt-name">
            <span class="pt-emoji">${esc(p.emoji || '📦')}</span>
            <span><strong>${esc(p.name)}</strong><span>${p.barcode ? esc(p.barcode) : esc(p.unit || 'pcs')}${active ? '' : ' · arsip'}</span></span>
          </div>
        </td>
        <td><span class="badge">${esc(p.category || 'Lainnya')}</span></td>
        <td class="num"><strong>${fmtRp(p.price)}</strong></td>
        <td class="num">${fmtRp(p.cost)}</td>
        <td class="num"><span class="margin-pill">${fmtPct(marginPct(p.price, p.cost))}</span></td>
        <td><span class="stock-text ${st.cls}">${st.label}</span></td>
        <td class="actions">
          <button class="icon-btn btn-sm" data-edit="${esc(p.id)}" title="Edit">${icon('edit')}</button>
          <button class="icon-btn btn-sm" data-restock="${esc(p.id)}" title="Restok">${icon('package')}</button>
          ${active
            ? `<button class="icon-btn btn-sm" data-archive="${esc(p.id)}" title="Arsipkan">${icon('ban')}</button>`
            : `<button class="icon-btn btn-sm" data-restore="${esc(p.id)}" title="Aktifkan kembali">${icon('refresh')}</button>`}
        </td>
      </tr>`;
    }).join('');
  }

  if (cards) {
    cards.innerHTML = list.map((p) => {
      const active = p.active !== false;
      const st = stockState(p);
      return `<div class="prod-admin-card" style="${active ? '' : 'opacity:.6'}">
        <span class="stock-emoji" style="width:38px;height:38px;font-size:18px">${esc(p.emoji || '📦')}</span>
        <div class="pac-main">
          <div class="pac-top">
            <h4>${esc(p.name)}</h4>
            <div class="pac-actions">
              <button class="icon-btn" data-edit="${esc(p.id)}" aria-label="Edit">${icon('edit')}</button>
              <button class="icon-btn" data-restock="${esc(p.id)}" aria-label="Restok">${icon('package')}</button>
              ${active
                ? `<button class="icon-btn" data-archive="${esc(p.id)}" aria-label="Arsipkan">${icon('ban')}</button>`
                : `<button class="icon-btn" data-restore="${esc(p.id)}" aria-label="Aktifkan">${icon('refresh')}</button>`}
            </div>
          </div>
          <div class="pac-meta">
            <span class="badge">${esc(p.category || 'Lainnya')}</span>
            <span class="stock-qty ${st.cls === 'out' ? 'out' : ''}">${st.label}</span>
            ${active ? '' : '<span class="badge red">Arsip</span>'}
          </div>
          <div class="pac-prices">
            <span>Harga jual<strong>${fmtRp(p.price)}</strong></span>
            <span>Modal<strong>${fmtRp(p.cost)}</strong></span>
            <span>Margin<strong style="color:var(--brand)">${fmtPct(marginPct(p.price, p.cost))}</strong></span>
          </div>
        </div>
      </div>`;
    }).join('');
  }

  if (empty) empty.innerHTML = emptyHTML;
}

function toggleActive(id, active) {
  const product = state.products.find((p) => p.id === id);
  if (!product) return;
  confirmDialog({
    title: active ? 'Aktifkan produk?' : 'Arsipkan produk?',
    message: active
      ? `<b>${esc(product.name)}</b> akan muncul kembali di kasir dan daftar produk.`
      : `<b>${esc(product.name)}</b> tidak akan muncul di kasir. Riwayat transaksi tetap tersimpan.`,
    confirmText: active ? 'Aktifkan' : 'Arsipkan',
    danger: !active,
    iconName: active ? 'refresh' : 'ban'
  }).then(async (ok) => {
    if (!ok) return;
    try {
      await setProductActive(id, active);
      toast(active ? 'Produk diaktifkan kembali.' : 'Produk dipindahkan ke arsip.', 'success');
    } catch (err) {
      toast(err.message || 'Gagal mengubah status produk.', 'error');
    }
  });
}

/* ---------------- product form ---------------- */
function openProductForm(product = null) {
  const isEdit = Boolean(product);
  const data = product || { emoji: '📦', category: '', unit: 'pcs', active: true, cost: '', price: '', stock: '', minStock: '' };
  let selectedEmoji = data.emoji || '📦';

  openModal({
    title: isEdit ? 'Edit produk' : 'Tambah produk',
    subtitle: isEdit ? 'Perbarui data barang dagangan.' : 'Lengkapi data produk baru untuk dijual di kasir.',
    size: 'wide',
    body: `<form id="pf-form" novalidate>
      <div class="flex gap-12 mb-16" style="align-items:flex-start">
        <div id="pf-emoji-preview" style="width:56px;height:56px;border-radius:14px;display:grid;place-items:center;background:var(--brand-soft);font-size:28px;flex:0 0 auto">${esc(selectedEmoji)}</div>
        <div class="grow">
          <label class="label">Ikon produk</label>
          <div class="emoji-picker" id="pf-emojis">
            ${PRODUCT_EMOJIS.map((em) => `<button type="button" class="emoji-opt ${em === selectedEmoji ? 'active' : ''}" data-emoji="${em}">${em}</button>`).join('')}
          </div>
        </div>
      </div>
      <div class="form-grid">
        <div class="field span-2">
          <label class="label" for="pf-name">Nama produk <span class="req">*</span></label>
          <input class="input input-lg" id="pf-name" maxlength="120" value="${esc(data.name || '')}" placeholder="Contoh: Indomie Goreng" required>
        </div>
        <div class="field">
          <label class="label" for="pf-category">Kategori</label>
          <input class="input" id="pf-category" list="pf-categories" maxlength="50" value="${esc(data.category || '')}" placeholder="Makanan">
          <datalist id="pf-categories">${categoryOptions().map((c) => `<option value="${esc(c)}">`).join('')}</datalist>
        </div>
        <div class="field">
          <label class="label" for="pf-unit">Satuan</label>
          <select class="select" id="pf-unit">${UNITS.map((u) => `<option value="${esc(u)}" ${data.unit === u ? 'selected' : ''}>${esc(u)}</option>`).join('')}</select>
        </div>
        <div class="field">
          <label class="label" for="pf-barcode">Barcode <span class="dim">(opsional)</span></label>
          <input class="input" id="pf-barcode" maxlength="60" value="${esc(data.barcode || '')}" placeholder="Scan / ketik barcode">
        </div>
        <div class="field">
          <label class="label" for="pf-cost">Harga modal (HPP)</label>
          <div class="input-group"><span class="ig-prefix">Rp</span><input class="input" id="pf-cost" data-money inputmode="numeric" value="${data.cost ? fmtNum(data.cost) : ''}" placeholder="0"></div>
        </div>
        <div class="field">
          <label class="label" for="pf-price">Harga jual <span class="req">*</span></label>
          <div class="input-group"><span class="ig-prefix">Rp</span><input class="input" id="pf-price" data-money inputmode="numeric" value="${data.price ? fmtNum(data.price) : ''}" placeholder="0" required></div>
        </div>
        <div class="field">
          <label class="label" for="pf-margin">Margin & laba</label>
          <div class="input" id="pf-margin" style="display:flex;align-items:center;font-weight:700;background:var(--bg-soft)">—</div>
        </div>
        <div class="field">
          <label class="label" for="pf-stock">Stok saat ini</label>
          <input class="input" id="pf-stock" type="number" inputmode="numeric" min="0" step="1" value="${Number(data.stock) || 0}">
        </div>
        <div class="field">
          <label class="label" for="pf-minstock">Batas stok minimum</label>
          <input class="input" id="pf-minstock" type="number" inputmode="numeric" min="0" step="1" value="${Number(data.minStock) || 0}">
          <span class="hint">Muncul peringatan jika stok ≤ batas ini.</span>
        </div>
        <div class="field span-2">
          <label class="label" for="pf-note">Catatan</label>
          <textarea class="textarea" id="pf-note" rows="2" maxlength="200" placeholder="Contoh: rak depan, dekat kasir">${esc(data.note || '')}</textarea>
        </div>
        <div class="field span-2">
          <label class="switch"><input type="checkbox" id="pf-active" ${data.active !== false ? 'checked' : ''}><span class="sw-track"></span><span>Tampilkan produk ini di kasir</span></label>
        </div>
      </div>
    </form>`,
    footer: `<button class="btn btn-secondary" data-cancel>Batal</button><button class="btn btn-primary" data-save>${icon('check')}${isEdit ? 'Simpan perubahan' : 'Tambah produk'}</button>`,
    onMount: ({ body, foot, close }) => {
      const nameInput = body.querySelector('#pf-name');
      const costInput = body.querySelector('#pf-cost');
      const priceInput = body.querySelector('#pf-price');
      const marginEl = body.querySelector('#pf-margin');

      const updateMargin = () => {
        const cost = parseMoney(costInput.value);
        const price = parseMoney(priceInput.value);
        const profit = price - cost;
        marginEl.innerHTML = price
          ? `<span style="color:${profit >= 0 ? 'var(--brand)' : 'var(--red)'}">${fmtPct(marginPct(price, cost))} · ${fmtRp(profit)}</span>`
          : '—';
      };
      costInput.addEventListener('input', updateMargin);
      priceInput.addEventListener('input', updateMargin);
      updateMargin();

      body.querySelector('#pf-emojis').addEventListener('click', (e) => {
        const btn = e.target.closest('[data-emoji]');
        if (!btn) return;
        selectedEmoji = btn.getAttribute('data-emoji');
        body.querySelectorAll('[data-emoji]').forEach((b) => b.classList.toggle('active', b === btn));
        body.querySelector('#pf-emoji-preview').textContent = selectedEmoji;
      });

      foot.querySelector('[data-cancel]').addEventListener('click', close);
      const save = async () => {
        const payload = {
          name: nameInput.value.trim(),
          category: body.querySelector('#pf-category').value.trim() || 'Lainnya',
          unit: body.querySelector('#pf-unit').value,
          barcode: body.querySelector('#pf-barcode').value.trim(),
          cost: parseMoney(costInput.value),
          price: parseMoney(priceInput.value),
          stock: Number(body.querySelector('#pf-stock').value) || 0,
          minStock: Number(body.querySelector('#pf-minstock').value) || 0,
          emoji: selectedEmoji,
          note: body.querySelector('#pf-note').value.trim(),
          active: body.querySelector('#pf-active').checked
        };
        if (!payload.name) return toast('Nama produk wajib diisi.', 'warn', undefined, nameInput.focus());
        if (payload.price <= 0) return toast('Harga jual harus lebih dari 0.', 'warn');
        if (payload.stock < 0 || payload.minStock < 0) return toast('Stok tidak boleh negatif.', 'warn');
        try {
          await saveProduct(payload, isEdit ? product.id : null);
          close();
          toast(isEdit ? 'Perubahan produk disimpan.' : 'Produk baru berhasil ditambahkan.', 'success');
        } catch (err) {
          toast(err.message || 'Gagal menyimpan produk.', 'error');
        }
      };
      foot.querySelector('[data-save]').addEventListener('click', save);
      body.querySelector('#pf-form').addEventListener('submit', (e) => { e.preventDefault(); save(); });
    }
  });
}

/* ---------------- restock ---------------- */
function openRestock(product) {
  if (!product) return;
  const oldStock = Number(product.stock) || 0;
  const oldCost = Number(product.cost) || 0;

  openModal({
    title: 'Restok produk',
    subtitle: product.name,
    size: 'narrow',
    body: `<div class="green-callout mb-16">${icon('package')}<span>Stok saat ini <b>${oldStock} ${esc(product.unit || 'pcs')}</b> dengan modal rata-rata <b>${fmtRp(oldCost)}</b>.</span></div>
      <div class="form-grid">
        <div class="field">
          <label class="label" for="rs-qty">Jumlah masuk <span class="req">*</span></label>
          <input class="input" id="rs-qty" type="number" min="1" step="1" value="10" inputmode="numeric">
        </div>
        <div class="field">
          <label class="label" for="rs-cost">Modal per unit</label>
          <div class="input-group"><span class="ig-prefix">Rp</span><input class="input" id="rs-cost" data-money inputmode="numeric" value="${fmtNum(oldCost)}"></div>
        </div>
        <div class="field span-2">
          <label class="label" for="rs-supplier">Pemasok / supplier</label>
          <input class="input" id="rs-supplier" maxlength="100" placeholder="Contoh: Toko Grosir Berkah">
        </div>
        <div class="field span-2">
          <label class="label" for="rs-date">Tanggal restok</label>
          <input class="input" id="rs-date" type="date" value="${inputDate(new Date())}">
        </div>
        <div class="field span-2">
          <label class="label" for="rs-note">Catatan</label>
          <input class="input" id="rs-note" maxlength="200" placeholder="Opsional">
        </div>
      </div>
      <div class="restock-preview">
        <div><span>Stok baru</span><strong id="rs-preview-stock">${oldStock + 10}</strong></div>
        <div><span>Total belanja</span><strong id="rs-preview-total">${fmtRp(oldCost * 10)}</strong></div>
        <div><span>Modal rata-rata baru</span><strong id="rs-preview-cost">${fmtRp(oldCost)}</strong></div>
        <div><span>Nilai stok bertambah</span><strong id="rs-preview-value">${fmtRp(oldCost * 10)}</strong></div>
      </div>`,
    footer: `<button class="btn btn-secondary" data-cancel>Batal</button><button class="btn btn-primary" data-save>${icon('package')}Simpan restok</button>`,
    onMount: ({ body, foot, close }) => {
      const qtyInput = body.querySelector('#rs-qty');
      const costInput = body.querySelector('#rs-cost');
      const update = () => {
        const qty = Math.max(0, Math.round(Number(qtyInput.value) || 0));
        const unitCost = parseMoney(costInput.value);
        const newStock = oldStock + qty;
        const newCost = newStock > 0 ? Math.round(((oldStock * oldCost) + (qty * unitCost)) / newStock) : unitCost;
        body.querySelector('#rs-preview-stock').textContent = `${newStock} ${product.unit || 'pcs'}`;
        body.querySelector('#rs-preview-total').textContent = fmtRp(qty * unitCost);
        body.querySelector('#rs-preview-cost').textContent = fmtRp(newCost);
        body.querySelector('#rs-preview-value').textContent = fmtRp(qty * unitCost);
      };
      qtyInput.addEventListener('input', update);
      costInput.addEventListener('input', update);

      foot.querySelector('[data-cancel]').addEventListener('click', close);
      foot.querySelector('[data-save]').addEventListener('click', async () => {
        const qty = Math.round(Number(qtyInput.value) || 0);
        if (qty <= 0) return toast('Jumlah restok harus lebih dari 0.', 'warn');
        try {
          await restockProduct({
            productId: product.id,
            qty,
            costPerUnit: parseMoney(costInput.value),
            supplier: body.querySelector('#rs-supplier').value.trim(),
            note: body.querySelector('#rs-note').value.trim(),
            date: body.querySelector('#rs-date').value
          });
          close();
          toast(`Stok ${product.name} bertambah ${qty} ${product.unit || 'pcs'}.`, 'success', 'Restok tersimpan');
        } catch (err) {
          toast(err.message || 'Gagal menyimpan restok.', 'error');
        }
      });
    }
  });
}

/* ---------------- export ---------------- */
function exportCsv() {
  const list = productList();
  if (!list.length) return toast('Tidak ada produk untuk diekspor.', 'warn');
  const rows = list.map((p) => [
    p.name, p.category || 'Lainnya', p.barcode || '', p.unit || 'pcs',
    Number(p.cost) || 0, Number(p.price) || 0, marginPct(p.price, p.cost).toFixed(1),
    Number(p.stock) || 0, Number(p.minStock) || 0, p.active === false ? 'Arsip' : 'Aktif'
  ]);
  downloadCsv(`produk-tokoku-${inputDate(new Date())}.csv`, rows, [
    'Nama', 'Kategori', 'Barcode', 'Satuan', 'Harga Modal', 'Harga Jual', 'Margin (%)', 'Stok', 'Stok Minimum', 'Status'
  ]);
  toast(`${rows.length} produk diekspor ke CSV.`, 'success');
}
